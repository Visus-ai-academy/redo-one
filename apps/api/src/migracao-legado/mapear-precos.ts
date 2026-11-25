import type {
  categoriasExame,
  precosCliente,
  precosPadraoContratado,
  prioridades,
} from '../database/schema';
import { idDoLegado } from './comum';
import type { LegadoPreco, LegadoPrecos } from './legado';
import { chaveCadastro } from './mapear-catalogo';

/** O que a carga usa do cadastro do redo-one (já migrado). */
export interface CadastroParaPrecos {
  clientes: { id: string; nome: string }[];
  contratados: { id: string; razaoSocial: string }[];
  modalidades: { id: string; codigo: string }[];
  especialidades: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  prioridades: { id: string; nome: string }[];
  /** De-paras de grafia de especialidade do catálogo (MAMO → MAMA), em qualquer modalidade. */
  especialidadesDePara: { origem: string; especialidadeId: string }[];
  /**
   * Categorias e prioridades que já estão no banco do redo-one: o item que os preços usam e o
   * catálogo do dashboards-one não tem é reaproveitado daqui (criado por uma carga anterior ou
   * pela tela), em vez de nascer de novo.
   */
  noRedo?: {
    categorias: { id: string; nome: string }[];
    prioridades: { id: string; nome: string }[];
  };
}

type Item = { id: string; nome: string };

type CondVolume = 'MOD' | 'MOD_ESP' | 'MOD_ESP_CAT' | 'TOTAL';
type Colunas = Omit<typeof precosCliente.$inferInsert, 'clienteId'> & {
  id: string;
  condVolume: CondVolume;
};

export interface PrecosMigrados {
  tabelas: {
    precosCliente: (typeof precosCliente.$inferInsert & { id: string })[];
    precosPadraoContratado: (typeof precosPadraoContratado.$inferInsert & { id: string })[];
  };
  /** Linhas lidas (ativas) do dashboards-one, nas duas tabelas. */
  lidas: number;
  /** Linhas iguais a outra (mesmo arranjo, faixa, vigência, valor e condVolume) que viraram uma. */
  repetidasIguais: number;
  /**
   * Mesmo dono, arranjo, faixa e vigência com valores (ou condVolume) diferentes: vale a alteração
   * mais recente no dashboards-one. Cada caso vira aviso de "preço repetido".
   */
  precosRepetidos: PrecoRepetido[];
  /** Categorias e prioridades novas que a gravação cria no catálogo antes dos preços. */
  catalogo: {
    categoriasExame: (typeof categoriasExame.$inferInsert & { id: string })[];
    prioridades: (typeof prioridades.$inferInsert & { id: string })[];
  };
  /**
   * Itens do catálogo que só os preços do dashboards-one usam (lá não estão no catálogo): os que a
   * carga cria e os que já estavam no redo-one (`jaNoRedo`), com quantas linhas os usam.
   */
  itensCriados: {
    tipo: 'categoria' | 'prioridade';
    id: string;
    nome: string;
    linhas: number;
    donos: string[];
    jaNoRedo: boolean;
  }[];
  /** O que não entrou, agrupado pelo motivo. */
  naoResolvidas: { motivo: string; linhas: number; donos: string[] }[];
  /** Faixas sentinela (1–2147483647, 0–999999...) que viraram "sem faixa" ou faixa aberta. */
  sentinelas: number;
}

export interface PrecoRepetido {
  tabela: 'precos_cliente' | 'precos_padrao_contratado';
  donoId: string;
  dono: string;
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
  faixaInicio: number | null;
  faixaFim: number | null;
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
  /** "CT | NEURO | SC | PLANTÃO | sem faixa", para o relatório e o texto do aviso. */
  descricao: string;
  /** As linhas do dashboards-one, na ordem lida. */
  versoes: {
    id: string;
    idLegado: string;
    valor: number;
    condVolume: CondVolume;
    atualizadoEm: string;
  }[];
  /** Id (no redo-one) da versão que entrou: a alteração mais recente. */
  escolhida: string;
}

/** Marca a origem dos itens que a carga cria: o id é estável pela chave do nome. */
const ORIGEM_ITEM_CRIADO = 'carga-precos';
const DESCRICAO_ITEM_CRIADO =
  'Criado pela carga do dashboards-one: os preços de lá usam este item, que não existe no catálogo de lá.';

/**
 * Fim de faixa a partir do qual ela é sentinela ("sem limite"): nenhum cliente chega a 9.999
 * exames num mês (o maior soma ~2 mil), e o dashboards-one tem 9999, 99999... 2147483647.
 */
const FIM_SENTINELA = 9999;

const COND: Record<string, CondVolume> = {
  MOD: 'MOD',
  'MOD/ESP': 'MOD_ESP',
  'MOD/ESP/CAT': 'MOD_ESP_CAT',
  TOTAL: 'TOTAL',
};

/** Como o dashboards-one lê a linha: sem categoria = SC, sem prioridade = ROTINA. */
const CATEGORIA_VAZIA = 'SC';
const PRIORIDADE_VAZIA = 'ROTINA';

/** Faixa sem as sentinelas: início ≤ 1 e fim sentinela = sem faixa; só o fim sentinela = aberta. */
function faixaDe(p: LegadoPreco): {
  inicio: number | null;
  fim: number | null;
  sentinela: boolean;
} {
  const fimAberto = p.volumeFinal === null || p.volumeFinal >= FIM_SENTINELA;
  if (!fimAberto) return { inicio: p.volumeInicial, fim: p.volumeFinal, sentinela: false };
  const inicio = p.volumeInicial === null || p.volumeInicial <= 1 ? null : p.volumeInicial;
  return { inicio, fim: null, sentinela: p.volumeFinal !== null };
}

/**
 * Traduz os preços do dashboards-one (só as linhas ativas, com a vigência que tiverem) para
 * `precos_cliente` e `precos_padrao_contratado`: dono e arranjo viram FKs do redo-one, as faixas
 * sentinela saem, o condVolume vira enum (nulo = MOD/ESP/CAT, como lá) e as repetidas viram uma.
 * As linhas 0–0 ficam como estão: lá só casam no último recurso (a menor faixa do arranjo).
 */
export function mapearPrecos(legado: LegadoPrecos, cadastro: CadastroParaPrecos): PrecosMigrados {
  const porChave = <T>(itens: T[], chave: (i: T) => string, id: (i: T) => string) =>
    new Map(itens.map((i) => [chaveCadastro(chave(i)), id(i)]));
  const modalidade = porChave(
    cadastro.modalidades,
    (m) => m.codigo,
    (m) => m.id,
  );
  const especialidade = porChave(
    cadastro.especialidades,
    (e) => e.nome,
    (e) => e.id,
  );
  const deParaEspecialidade = porChave(
    cadastro.especialidadesDePara,
    (d) => d.origem,
    (d) => d.especialidadeId,
  );
  const categoria = porChave(
    cadastro.categorias,
    (c) => c.nome,
    (c) => c.id,
  );
  const prioridade = porChave(
    cadastro.prioridades,
    (p) => p.nome,
    (p) => p.id,
  );

  // Categoria e prioridade que só os preços usam (lá não estão no catálogo) viram itens do
  // catálogo, para os preços entrarem como estão no dashboards-one.
  const nomesDonos = {
    clientes: new Map(cadastro.clientes.map((c) => [c.id, c.nome])),
    contratados: new Map(cadastro.contratados.map((c) => [c.id, c.razaoSocial])),
  };
  const faltam = {
    categoria: new Map<
      string,
      { grafias: Map<string, number>; linhas: number; donos: Set<string> }
    >(),
    prioridade: new Map<
      string,
      { grafias: Map<string, number>; linhas: number; donos: Set<string> }
    >(),
  };
  for (const [linhas, tabela] of [
    [legado.clientes, 'clientes'],
    [legado.padrao, 'contratados'],
  ] as const) {
    for (const p of linhas) {
      if (!(typeof p.valorBase === 'number' && p.valorBase > 0)) continue;
      const donoId = idDoLegado(tabela, p.donoId);
      const dono = nomesDonos[tabela].get(donoId);
      if (!dono) continue;
      for (const [tipo, valor, indice] of [
        ['categoria', p.categoria, categoria],
        ['prioridade', p.prioridade, prioridade],
      ] as const) {
        const chave = chaveCadastro(valor);
        if (!chave || indice.has(chave)) continue;
        const f = faltam[tipo].get(chave) ?? { grafias: new Map(), linhas: 0, donos: new Set() };
        const grafia = (valor ?? '').trim().replace(/\s+/g, ' ');
        f.grafias.set(grafia, (f.grafias.get(grafia) ?? 0) + 1);
        f.linhas += 1;
        f.donos.add(dono);
        faltam[tipo].set(chave, f);
      }
    }
  }
  const noRedo = {
    categoria: porChave(
      cadastro.noRedo?.categorias ?? [],
      (c) => c.nome,
      (c) => c.id,
    ),
    prioridade: porChave(
      cadastro.noRedo?.prioridades ?? [],
      (p) => p.nome,
      (p) => p.id,
    ),
  };
  const nomeNoRedo = new Map(
    [...(cadastro.noRedo?.categorias ?? []), ...(cadastro.noRedo?.prioridades ?? [])].map((i) => [
      i.id,
      i.nome,
    ]),
  );
  const itensCriados: PrecosMigrados['itensCriados'] = [];
  const catalogo: PrecosMigrados['catalogo'] = { categoriasExame: [], prioridades: [] };
  const criados: Record<'categoria' | 'prioridade', Item[]> = { categoria: [], prioridade: [] };
  for (const tipo of ['categoria', 'prioridade'] as const) {
    const indice = tipo === 'categoria' ? categoria : prioridade;
    for (const [chave, f] of faltam[tipo]) {
      // A grafia mais usada nos preços; no empate, a primeira lida.
      const nome = [...f.grafias].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      const existente = noRedo[tipo].get(chave);
      const id =
        existente ??
        idDoLegado(
          tipo === 'categoria' ? 'categorias_exame' : 'prioridades',
          `${ORIGEM_ITEM_CRIADO}:${chave}`,
        );
      indice.set(chave, id);
      criados[tipo].push({ id, nome: existente ? (nomeNoRedo.get(id) ?? nome) : nome });
      itensCriados.push({
        tipo,
        id,
        nome: existente ? (nomeNoRedo.get(id) ?? nome) : nome,
        linhas: f.linhas,
        donos: [...f.donos].sort(),
        jaNoRedo: Boolean(existente),
      });
      if (existente) continue;
      const linha = {
        id,
        nome,
        descricao: DESCRICAO_ITEM_CRIADO,
        cor: null,
        ordem: 0,
        ativo: true,
      };
      if (tipo === 'categoria') catalogo.categoriasExame.push(linha);
      else catalogo.prioridades.push({ ...linha, urgente: false });
    }
  }

  const nomeModalidade = new Map(cadastro.modalidades.map((m) => [m.id, m.codigo]));
  const nomeEspecialidade = new Map(cadastro.especialidades.map((e) => [e.id, e.nome]));
  const nomeCategoria = new Map(
    [...cadastro.categorias, ...criados.categoria].map((c) => [c.id, c.nome]),
  );
  const nomePrioridade = new Map(
    [...cadastro.prioridades, ...criados.prioridade].map((p) => [p.id, p.nome]),
  );

  const naoResolvidas = new Map<string, { linhas: number; donos: Set<string> }>();
  const naoResolveu = (motivo: string, dono: string) => {
    const n = naoResolvidas.get(motivo) ?? { linhas: 0, donos: new Set<string>() };
    n.linhas += 1;
    n.donos.add(dono);
    naoResolvidas.set(motivo, n);
  };
  const precosRepetidos: PrecoRepetido[] = [];
  let repetidasIguais = 0;
  let sentinelas = 0;

  const traduzir = (
    linhas: LegadoPreco[],
    tabelaLegado: string,
    dono: {
      tabela: string;
      tipo: string;
      nomes: Map<string, string>;
      destino: PrecoRepetido['tabela'];
    },
  ) => {
    const grupos = new Map<string, { linha: Colunas; donoId: string; legado: LegadoPreco }[]>();
    for (const p of linhas) {
      const donoId = idDoLegado(dono.tabela, p.donoId);
      const nomeDono = dono.nomes.get(donoId) ?? p.donoNome ?? p.donoId;
      if (!dono.nomes.has(donoId)) {
        naoResolveu(`${dono.tipo} sem cadastro no redo-one`, nomeDono);
        continue;
      }
      if (!(typeof p.valorBase === 'number' && p.valorBase > 0)) {
        naoResolveu('valor zero ou negativo (o dashboards-one o trata como sem preço)', nomeDono);
        continue;
      }
      const mod = chaveCadastro(p.modalidade);
      const espLegado = chaveCadastro(p.especialidade);
      const espDePara = deParaEspecialidade.get(espLegado);
      const cat = chaveCadastro(p.categoria) || CATEGORIA_VAZIA;
      const pri = chaveCadastro(p.prioridade) || PRIORIDADE_VAZIA;
      const ids = {
        modalidadeId: modalidade.get(mod),
        especialidadeId: espDePara ?? especialidade.get(espLegado),
        categoriaId: categoria.get(cat),
        prioridadeId: prioridade.get(pri),
      };
      const falta = (
        [
          ['modalidade', ids.modalidadeId, p.modalidade],
          ['especialidade', ids.especialidadeId, p.especialidade],
          ['categoria', ids.categoriaId, p.categoria ?? CATEGORIA_VAZIA],
          ['prioridade', ids.prioridadeId, p.prioridade ?? PRIORIDADE_VAZIA],
        ] as const
      ).find(([, id]) => !id);
      if (falta) {
        naoResolveu(`${falta[0]} "${falta[2].trim()}" não existe no catálogo`, nomeDono);
        continue;
      }
      const faixa = faixaDe(p);
      if (faixa.sentinela) sentinelas += 1;
      const linha: Colunas = {
        id: idDoLegado(tabelaLegado, p.id),
        modalidadeId: ids.modalidadeId as string,
        especialidadeId: ids.especialidadeId as string,
        categoriaId: ids.categoriaId as string,
        prioridadeId: ids.prioridadeId as string,
        faixaInicio: faixa.inicio,
        faixaFim: faixa.fim,
        condVolume: COND[chaveCadastro(p.condVolume)] ?? 'MOD_ESP_CAT',
        valor: p.valorBase,
        vigenciaDesde: p.vigenciaDesde ?? null,
        vigenciaAte: p.vigenciaAte ?? null,
        criadoPorId: null,
      };
      const chave = JSON.stringify([
        donoId,
        linha.modalidadeId,
        linha.especialidadeId,
        linha.categoriaId,
        linha.prioridadeId,
        linha.faixaInicio,
        linha.faixaFim,
        linha.vigenciaDesde,
        linha.vigenciaAte,
      ]);
      grupos.set(chave, [...(grupos.get(chave) ?? []), { linha, donoId, legado: p }]);
    }

    const saida: (Colunas & { donoId: string })[] = [];
    for (const grupo of grupos.values()) {
      const maisRecente = grupo.reduce((a, b) =>
        b.legado.atualizadoEm > a.legado.atualizadoEm ? b : a,
      );
      const assinatura = (g: (typeof grupo)[number]) => `${g.linha.valor}|${g.linha.condVolume}`;
      const distintas = new Set(grupo.map(assinatura));
      if (distintas.size === 1) repetidasIguais += grupo.length - 1;
      else {
        const l = maisRecente.linha;
        const faixa =
          l.faixaInicio === null && l.faixaFim === null
            ? 'sem faixa'
            : `faixa ${l.faixaInicio ?? 0}–${l.faixaFim ?? '∞'}`;
        precosRepetidos.push({
          tabela: dono.destino,
          donoId: maisRecente.donoId,
          dono: dono.nomes.get(maisRecente.donoId) ?? maisRecente.donoId,
          modalidadeId: l.modalidadeId,
          especialidadeId: l.especialidadeId,
          categoriaId: l.categoriaId,
          prioridadeId: l.prioridadeId,
          faixaInicio: l.faixaInicio ?? null,
          faixaFim: l.faixaFim ?? null,
          vigenciaDesde: l.vigenciaDesde ?? null,
          vigenciaAte: l.vigenciaAte ?? null,
          descricao: [
            nomeModalidade.get(l.modalidadeId),
            nomeEspecialidade.get(l.especialidadeId),
            nomeCategoria.get(l.categoriaId),
            nomePrioridade.get(l.prioridadeId),
            faixa,
          ].join(' | '),
          versoes: grupo.map((g) => ({
            id: g.linha.id,
            idLegado: g.legado.id,
            valor: g.linha.valor as number,
            condVolume: g.linha.condVolume,
            atualizadoEm: g.legado.atualizadoEm,
          })),
          escolhida: l.id,
        });
      }
      saida.push({ ...maisRecente.linha, donoId: maisRecente.donoId });
    }
    return saida;
  };

  const clientes = traduzir(legado.clientes, 'precos_servicos', {
    tabela: 'clientes',
    tipo: 'cliente',
    nomes: nomesDonos.clientes,
    destino: 'precos_cliente',
  });
  const padrao = traduzir(legado.padrao, 'tabela_precos_padrao', {
    tabela: 'contratados',
    tipo: 'contratado',
    nomes: nomesDonos.contratados,
    destino: 'precos_padrao_contratado',
  });

  return {
    tabelas: {
      precosCliente: clientes.map(({ donoId, ...l }) => ({ clienteId: donoId, ...l })),
      precosPadraoContratado: padrao.map(({ donoId, ...l }) => ({ contratadoId: donoId, ...l })),
    },
    lidas: legado.clientes.length + legado.padrao.length,
    repetidasIguais,
    precosRepetidos,
    catalogo,
    itensCriados,
    naoResolvidas: [...naoResolvidas].map(([motivo, n]) => ({
      motivo,
      linhas: n.linhas,
      donos: [...n.donos].sort(),
    })),
    sentinelas,
  };
}
