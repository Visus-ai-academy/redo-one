import type { precosCliente, precosPadraoContratado } from '../database/schema';
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
}

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
  /** Mesmo arranjo, faixa e vigência com valores diferentes: vale a alteração mais recente. */
  conflitos: { dono: string; arranjo: string; valores: number[]; escolhido: number }[];
  /** O que não entrou, agrupado pelo motivo. */
  naoResolvidas: { motivo: string; linhas: number; donos: string[] }[];
  /** Faixas sentinela (1–2147483647, 0–999999...) que viraram "sem faixa" ou faixa aberta. */
  sentinelas: number;
}

/**
 * Fim de faixa a partir do qual ela é sentinela ("sem limite"): nenhum cliente chega a 9.999
 * exames num mês (o maior soma ~2 mil), e o dashboards-one tem 9999, 99999... 2147483647.
 */
const FIM_SENTINELA = 9999;

/** Especialidades de preço do dashboards-one que, na modalidade, são outra no catálogo. */
const DE_PARAS: Record<string, string> = {
  'MG|MAMO': 'MAMA',
  'DO|D.O': 'MUSCULO ESQUELETICO',
};

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
  const nomeModalidade = new Map(cadastro.modalidades.map((m) => [m.id, m.codigo]));
  const nomeEspecialidade = new Map(cadastro.especialidades.map((e) => [e.id, e.nome]));
  const nomeCategoria = new Map(cadastro.categorias.map((c) => [c.id, c.nome]));
  const nomePrioridade = new Map(cadastro.prioridades.map((p) => [p.id, p.nome]));

  const naoResolvidas = new Map<string, { linhas: number; donos: Set<string> }>();
  const naoResolveu = (motivo: string, dono: string) => {
    const n = naoResolvidas.get(motivo) ?? { linhas: 0, donos: new Set<string>() };
    n.linhas += 1;
    n.donos.add(dono);
    naoResolvidas.set(motivo, n);
  };
  const conflitos: PrecosMigrados['conflitos'] = [];
  let repetidasIguais = 0;
  let sentinelas = 0;

  const traduzir = (
    linhas: LegadoPreco[],
    tabelaLegado: string,
    dono: { tabela: string; tipo: string; nomes: Map<string, string> },
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
      const esp = chaveCadastro(DE_PARAS[`${mod}|${espLegado}`] ?? espLegado);
      const cat = chaveCadastro(p.categoria) || CATEGORIA_VAZIA;
      const pri = chaveCadastro(p.prioridade) || PRIORIDADE_VAZIA;
      const ids = {
        modalidadeId: modalidade.get(mod),
        especialidadeId: especialidade.get(esp),
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
        conflitos.push({
          dono: dono.nomes.get(maisRecente.donoId) ?? maisRecente.donoId,
          arranjo: [
            nomeModalidade.get(l.modalidadeId),
            nomeEspecialidade.get(l.especialidadeId),
            nomeCategoria.get(l.categoriaId),
            nomePrioridade.get(l.prioridadeId),
            faixa,
          ].join(' | '),
          valores: [...new Set(grupo.map((g) => g.linha.valor))].sort((a, b) => a - b),
          escolhido: l.valor,
        });
      }
      saida.push({ ...maisRecente.linha, donoId: maisRecente.donoId });
    }
    return saida;
  };

  const clientes = traduzir(legado.clientes, 'precos_servicos', {
    tabela: 'clientes',
    tipo: 'cliente',
    nomes: new Map(cadastro.clientes.map((c) => [c.id, c.nome])),
  });
  const padrao = traduzir(legado.padrao, 'tabela_precos_padrao', {
    tabela: 'contratados',
    tipo: 'contratado',
    nomes: new Map(cadastro.contratados.map((c) => [c.id, c.razaoSocial])),
  });

  return {
    tabelas: {
      precosCliente: clientes.map(({ donoId, ...l }) => ({ clienteId: donoId, ...l })),
      precosPadraoContratado: padrao.map(({ donoId, ...l }) => ({ contratadoId: donoId, ...l })),
    },
    lidas: legado.clientes.length + legado.padrao.length,
    repetidasIguais,
    conflitos,
    naoResolvidas: [...naoResolvidas].map(([motivo, n]) => ({
      motivo,
      linhas: n.linhas,
      donos: [...n.donos].sort(),
    })),
    sentinelas,
  };
}
