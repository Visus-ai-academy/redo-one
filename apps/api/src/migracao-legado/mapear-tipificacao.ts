import type {
  clientesTipificacao,
  clientesTipificacaoLinhas,
  clientesTipificacaoLinhasEquipes,
  clientesTipificacaoLinhasEspecialidades,
  clientesTipificacaoLinhasMedicos,
  clientesTipificacaoLinhasModalidades,
  clientesTipificacaoLinhasPrioridades,
  regrasTipificacao,
  subregrasTipificacao,
} from '../database/schema';
import { montarResolvedorUnidadeCliente } from '../ingestao/domain/resolver-cliente';
import { normalizarNomeMedico } from '../medicos/comum/nome-medico';
import { type Aviso, idDoLegado, texto } from './comum';
import type { LegadoFiltroMedico, LegadoTipificacao } from './legado';
import { type CatalogoMigrado, chaveCadastro } from './mapear-catalogo';
import type { MedicosMigrados } from './mapear-medicos';

/** O que a carga usa do cadastro do redo-one (já migrado): clientes, catálogo, médicos e equipes. */
export interface CadastroParaTipificacao {
  clientes: {
    id: string;
    nome: string;
    chaveNormalizada: string;
    nomeFantasia: string | null;
    unificadoEmId: string | null;
  }[];
  clientesAliases: {
    tipo: 'exato' | 'prefixo' | 'normalizado';
    chave: string;
    clienteId: string;
  }[];
  sufixosNomeCliente: { sufixo: string; ativo?: boolean }[];
  modalidades: { id: string; codigo: string }[];
  modalidadesDePara: { origem: string; modalidadeId: string }[];
  especialidades: { id: string; nome: string }[];
  /** De-paras com destino (normalização e região anatômica). */
  especialidadesDePara: { origem: string; especialidadeId: string | null }[];
  /**
   * Especialidade crua dos laudos do redo-one (`especialidade_origem`) e a que a importação
   * resolveu: traduz o valor do dashboards-one que não é especialidade nem de-para (COLUNAS, que
   * a importação resolve pelo exame). Vale só se todos os laudos com aquele valor dão a mesma.
   */
  especialidadesDosLaudos: { origem: string; especialidadeId: string }[];
  prioridades: { id: string; nome: string }[];
  prioridadesDePara: { origem: string; prioridadeId: string }[];
  medicos: { id: string; chaveNormalizada: string }[];
  medicosAliases: { medicoId: string; chaveNormalizada: string }[];
  equipes: { id: string; nome: string }[];
}

type Tipo = 'modalidade' | 'especialidade' | 'prioridade';
type Modo = 'todos' | 'apenas' | 'exceto';

export interface TipificacaoMigrada {
  tabelas: {
    regrasTipificacao: (typeof regrasTipificacao.$inferInsert & { id: string })[];
    subregrasTipificacao: (typeof subregrasTipificacao.$inferInsert & { id: string })[];
    clientesTipificacao: (typeof clientesTipificacao.$inferInsert)[];
    clientesTipificacaoLinhas: (typeof clientesTipificacaoLinhas.$inferInsert & {
      id: string;
      tipo: Tipo;
      modoMedico: Modo;
    })[];
    clientesTipificacaoLinhasModalidades: (typeof clientesTipificacaoLinhasModalidades.$inferInsert)[];
    clientesTipificacaoLinhasEspecialidades: (typeof clientesTipificacaoLinhasEspecialidades.$inferInsert)[];
    clientesTipificacaoLinhasPrioridades: (typeof clientesTipificacaoLinhasPrioridades.$inferInsert)[];
    clientesTipificacaoLinhasMedicos: (typeof clientesTipificacaoLinhasMedicos.$inferInsert)[];
    clientesTipificacaoLinhasEquipes: (typeof clientesTipificacaoLinhasEquipes.$inferInsert)[];
  };
  avisos: Aviso[];
  /** O que impede gravar: a carga para e relata (não cria cadastro por conta própria). */
  erros: string[];
  /** Unidades sem configuração lá que ganharam a padrão explícita (o principal tem outra). */
  unidadesComCoExplicita: number;
}

/** Uma linha antes de resolver para o redo-one: o critério e o filtro como estão lá. */
interface LinhaLegada {
  tipo: string;
  valores: string[];
  filtro: LegadoFiltroMedico;
  subRegraId: string;
}

/** No dashboards-one, sem sub-regra só a regra NC deixa de faturar (`laudosFaturaveis.ts`). */
const REGRA_QUE_NAO_FATURA_SEM_SUBREGRA = 'NC';
/** Cliente sem configuração = CO (`REGRA_PADRAO` de `classificacao.ts`). */
const REGRA_PADRAO = 'CO';

const modoDo = (f: LegadoFiltroMedico | undefined): Modo =>
  f?.modo === 'apenas' || f?.modo === 'exceto' ? f.modo : 'todos';

/**
 * A precedência fixa do dashboards-one (`cascataEmpresa`) como lista de linhas, na mesma ordem:
 * Plantão › especialidade com médico › especialidade › modalidade com médico › modalidade. O
 * "todos os demais" (catch-all) volta à parte.
 */
function linhasDaPrecedenciaFixa(subs: LegadoTipificacao['clienteSubRegras']): {
  linhas: LinhaLegada[];
  demais: string | null;
} {
  const comuns = subs.filter((s) => !s.catchAll);
  const linhas: LinhaLegada[] = [];
  const todos: LegadoFiltroMedico = { modo: 'todos', medicos: [], grupos: [] };
  for (const s of comuns) {
    if (s.prioridades.length)
      linhas.push({
        tipo: 'prioridade',
        valores: s.prioridades,
        filtro: todos,
        subRegraId: s.subRegraId,
      });
  }
  for (const s of comuns) {
    for (const [esp, f] of Object.entries(s.especialidadeMedicos)) {
      if (modoDo(f) !== 'todos')
        linhas.push({ tipo: 'especialidade', valores: [esp], filtro: f, subRegraId: s.subRegraId });
    }
  }
  for (const s of comuns) {
    const esps = Object.entries(s.especialidadeMedicos)
      .filter(([, f]) => modoDo(f) === 'todos')
      .map(([e]) => e);
    if (esps.length)
      linhas.push({
        tipo: 'especialidade',
        valores: esps,
        filtro: todos,
        subRegraId: s.subRegraId,
      });
  }
  for (const s of comuns) {
    for (const [mod, f] of Object.entries(s.modalidadeMedicos)) {
      if (modoDo(f) !== 'todos')
        linhas.push({ tipo: 'modalidade', valores: [mod], filtro: f, subRegraId: s.subRegraId });
    }
  }
  for (const s of comuns) {
    const mods = Object.entries(s.modalidadeMedicos)
      .filter(([, f]) => modoDo(f) === 'todos')
      .map(([m]) => m);
    if (mods.length)
      linhas.push({ tipo: 'modalidade', valores: mods, filtro: todos, subRegraId: s.subRegraId });
  }
  return { linhas, demais: subs.find((s) => s.catchAll)?.subRegraId ?? null };
}

/**
 * Traduz a tipificação do dashboards-one para o redo-one: regras e sub-regras (com o "fatura sem
 * sub-regra" e a regra padrão como dado) e, por cliente ou unidade, a regra principal e a lista
 * ordenada de linhas. A precedência fixa vira linhas na mesma ordem; a personalizada vem como está.
 * Os critérios passam a ser os cadastros do redo-one (catálogo, médicos, equipes).
 */
export function mapearTipificacao(
  legado: LegadoTipificacao,
  cadastro: CadastroParaTipificacao,
  opcoes: {
    /**
     * Grafia que vale quando duas do mesmo cliente têm configurações diferentes (decisão do
     * usuário: RADI_IMAGEM, a única com laudos em set/out, e não RADI-IMAGEM).
     */
    grafiasPreferidas?: string[];
  } = {},
): TipificacaoMigrada {
  const avisos: Aviso[] = [];
  const erros: string[] = [];
  const avisar = (tabela: string, item: string, motivo: string) =>
    avisos.push({ tabela, item, motivo });

  const regraId = (id: string) => idDoLegado('regras_categorias', id);
  const subId = (id: string) => idDoLegado('sub_regras', id);
  const nomeRegra = new Map(legado.regras.map((r) => [r.id, r.nome]));
  const subsLegado = new Set(legado.subRegras.map((s) => s.id));

  const tabRegras = legado.regras.map((r) => ({
    id: regraId(r.id),
    nome: r.nome.trim(),
    descricao: texto(r.descricao),
    cor: texto(r.cor),
    ordem: r.ordem,
    ativo: r.ativo,
    faturaSemSubregra: chaveCadastro(r.nome) !== REGRA_QUE_NAO_FATURA_SEM_SUBREGRA,
    padrao: chaveCadastro(r.nome) === REGRA_PADRAO,
  }));
  const tabSubregras = legado.subRegras.map((s) => ({
    id: subId(s.id),
    regraId: regraId(s.regraId),
    nome: s.nome.trim(),
    descricao: texto(s.descricao),
    fatura: s.fatura,
    ordem: s.ordem,
    ativo: s.ativo,
  }));

  // Resolvedores do cadastro do redo-one.
  const resolverEmpresa = montarResolvedorUnidadeCliente({
    clientes: cadastro.clientes,
    aliases: cadastro.clientesAliases,
    sufixos: cadastro.sufixosNomeCliente.filter((s) => s.ativo !== false).map((s) => s.sufixo),
  });
  const clientePorId = new Map(cadastro.clientes.map((c) => [c.id, c]));
  const porChave = <T>(itens: T[], chave: (i: T) => string, id: (i: T) => string | null) => {
    const m = new Map<string, string>();
    for (const i of itens) {
      const v = id(i);
      if (v && !m.has(chave(i))) m.set(chave(i), v);
    }
    return m;
  };
  const modalidade = new Map([
    ...porChave(
      cadastro.modalidadesDePara,
      (d) => chaveCadastro(d.origem),
      (d) => d.modalidadeId,
    ),
    ...porChave(
      cadastro.modalidades,
      (m) => chaveCadastro(m.codigo),
      (m) => m.id,
    ),
  ]);
  const prioridade = new Map([
    ...porChave(
      cadastro.prioridadesDePara,
      (d) => chaveCadastro(d.origem),
      (d) => d.prioridadeId,
    ),
    ...porChave(
      cadastro.prioridades,
      (p) => chaveCadastro(p.nome),
      (p) => p.id,
    ),
  ]);
  const especialidadeDosLaudos = new Map<string, Set<string>>();
  for (const e of cadastro.especialidadesDosLaudos) {
    const k = chaveCadastro(e.origem);
    especialidadeDosLaudos.set(
      k,
      (especialidadeDosLaudos.get(k) ?? new Set()).add(e.especialidadeId),
    );
  }
  const especialidadePorNome = porChave(
    cadastro.especialidades,
    (e) => chaveCadastro(e.nome),
    (e) => e.id,
  );
  const especialidadeDePara = porChave(
    cadastro.especialidadesDePara,
    (d) => chaveCadastro(d.origem),
    (d) => d.especialidadeId,
  );
  const especialidade = (valor: string): string | null => {
    const k = chaveCadastro(valor);
    const direto = especialidadePorNome.get(k) ?? especialidadeDePara.get(k);
    if (direto) return direto;
    // Valor cru que só existe nos laudos (COLUNAS): vale se todos dão a mesma especialidade.
    const dosLaudos = especialidadeDosLaudos.get(k);
    return dosLaudos?.size === 1 ? ([...dosLaudos][0] as string) : null;
  };
  const medico = porChave(
    [
      ...cadastro.medicos.map((m) => ({ chave: m.chaveNormalizada, id: m.id })),
      ...cadastro.medicosAliases.map((a) => ({ chave: a.chaveNormalizada, id: a.medicoId })),
    ],
    (m) => m.chave,
    (m) => m.id,
  );
  const equipePorNome = porChave(
    cadastro.equipes,
    (e) => chaveCadastro(e.nome),
    (e) => e.id,
  );
  const nomeGrupo = new Map(legado.grupos.map((g) => [g.id, g.nome]));

  // Empresa → cliente (ou unidade). Várias grafias podem casar com o mesmo cliente.
  const empresas = [
    ...new Set([
      ...legado.clienteRegras.map((r) => r.empresa),
      ...legado.clienteSubRegras.map((s) => s.empresa),
      ...legado.ordens.filter((o) => o.personalizada && o.linhas.length).map((o) => o.empresa),
    ]),
  ];
  const empresasPorCliente = new Map<string, string[]>();
  for (const empresa of empresas) {
    const id = resolverEmpresa(empresa);
    if (!id) {
      erros.push(`Empresa "${empresa}" não casa com nenhum cliente do redo-one.`);
      continue;
    }
    empresasPorCliente.set(id, [...(empresasPorCliente.get(id) ?? []), empresa]);
  }

  const tabelas: TipificacaoMigrada['tabelas'] = {
    regrasTipificacao: tabRegras,
    subregrasTipificacao: tabSubregras,
    clientesTipificacao: [],
    clientesTipificacaoLinhas: [],
    clientesTipificacaoLinhasModalidades: [],
    clientesTipificacaoLinhasEspecialidades: [],
    clientesTipificacaoLinhasPrioridades: [],
    clientesTipificacaoLinhasMedicos: [],
    clientesTipificacaoLinhasEquipes: [],
  };

  interface LinhaResolvida {
    tipo: Tipo;
    modo: Modo;
    valores: string[];
    medicos: string[];
    equipes: string[];
    subregraId: string;
  }
  interface ConfigResolvida {
    regraId: string | null;
    demaisId: string | null;
    linhas: LinhaResolvida[];
    avisos: Aviso[];
    erros: string[];
  }

  /** A configuração de uma empresa do dashboards-one já nos cadastros do redo-one. */
  const configDaEmpresa = (empresa: string): ConfigResolvida => {
    const cfg: ConfigResolvida = {
      regraId: null,
      demaisId: null,
      linhas: [],
      avisos: [],
      erros: [],
    };
    const avisar = (tabela: string, item: string, motivo: string) =>
      cfg.avisos.push({ tabela, item, motivo });
    const principais = legado.clienteRegras.filter((r) => r.empresa === empresa);
    const principal = principais.find((r) => r.principal);
    cfg.regraId = principal ? regraId(principal.regraId) : null;
    for (const r of principais.filter((x) => !x.principal))
      avisar(
        'clientes_tipificacao',
        empresa,
        `Regra secundária "${nomeRegra.get(r.regraId) ?? r.regraId}" não tem efeito no dashboards-one: não migra.`,
      );

    const ordem = legado.ordens.find(
      (o) => o.empresa === empresa && o.personalizada && o.linhas.length,
    );
    let linhas: LinhaLegada[];
    let demais: string | null = null;
    if (ordem) {
      linhas = [];
      ordem.linhas.forEach((l, i) => {
        const tipo = String(l.tipo ?? '');
        const sub = String(l.subRegraId ?? '');
        if (!subsLegado.has(sub)) {
          avisar(
            'clientes_tipificacao_linhas',
            `${empresa}, linha ${i + 1}`,
            'Sub-regra desconhecida: não migra.',
          );
          return;
        }
        if (demais !== null) {
          avisar(
            'clientes_tipificacao_linhas',
            empresa,
            `Linha ${i + 1} vem depois de "todos os demais" e nunca casava: não migra.`,
          );
          return;
        }
        if (tipo === 'demais') {
          demais = sub;
          return;
        }
        linhas.push({
          tipo,
          valores: Array.isArray(l.valores) ? l.valores.map(String) : [],
          filtro: l.filtro ?? {},
          subRegraId: sub,
        });
      });
    } else {
      ({ linhas, demais } = linhasDaPrecedenciaFixa(
        legado.clienteSubRegras.filter((s) => s.empresa === empresa),
      ));
    }
    const demaisLegado: string | null = demais;
    cfg.demaisId = demaisLegado === null ? null : subId(demaisLegado);

    linhas.forEach((l, i) => {
      const item = `${empresa}, linha ${i + 1}`;
      if (l.tipo === 'categoria') {
        avisar(
          'clientes_tipificacao_linhas',
          item,
          'Critério por categoria nunca casava (o laudo de lá não tem categoria): não migra.',
        );
        return;
      }
      if (!['modalidade', 'especialidade', 'prioridade'].includes(l.tipo)) {
        avisar('clientes_tipificacao_linhas', item, `Tipo "${l.tipo}" desconhecido: não migra.`);
        return;
      }
      if (!l.valores.length) {
        avisar('clientes_tipificacao_linhas', item, 'Linha sem valores nunca casava: não migra.');
        return;
      }
      let modo = modoDo(l.filtro);
      const nomes = (l.filtro.medicos ?? []).map(String);
      const grupos = (l.filtro.grupos ?? []).map(String);
      if (modo !== 'todos' && !nomes.length && !grupos.length) {
        if (modo === 'apenas') {
          avisar(
            'clientes_tipificacao_linhas',
            item,
            '"Apenas" sem médico nunca casava: não migra.',
          );
          return;
        }
        modo = 'todos';
      }

      const tipo = l.tipo as Tipo;
      const resolver =
        tipo === 'modalidade'
          ? (v: string) => modalidade.get(chaveCadastro(v)) ?? null
          : tipo === 'prioridade'
            ? (v: string) => prioridade.get(chaveCadastro(v)) ?? null
            : especialidade;
      const valores = new Set<string>();
      let falhou = false;
      for (const v of l.valores) {
        const id = resolver(v);
        if (id) valores.add(id);
        else {
          cfg.erros.push(
            `${item}: ${tipo} "${v}" não existe no redo-one.${tipo === 'especialidade' ? ' Se é um valor cru da MobileMed (COLUNAS), importe os laudos antes da carga.' : ''}`,
          );
          falhou = true;
        }
      }
      const medicos = new Set<string>();
      const equipes = new Set<string>();
      if (modo !== 'todos') {
        for (const g of grupos) {
          const nome = nomeGrupo.get(g) ?? g;
          const id = equipePorNome.get(chaveCadastro(nome));
          if (id) equipes.add(id);
          else {
            cfg.erros.push(`${item}: grupo "${nome}" não existe como equipe no redo-one.`);
            falhou = true;
          }
        }
        for (const n of nomes) {
          const id = medico.get(normalizarNomeMedico(n));
          if (id) medicos.add(id);
          else {
            cfg.erros.push(`${item}: médico "${n}" não tem cadastro no redo-one.`);
            falhou = true;
          }
        }
      }
      if (falhou) return;
      cfg.linhas.push({
        tipo,
        modo,
        valores: [...valores],
        medicos: [...medicos],
        equipes: [...equipes],
        subregraId: subId(l.subRegraId),
      });
    });
    return cfg;
  };
  const vazia = (c: ConfigResolvida) => !c.regraId && !c.demaisId && !c.linhas.length;
  const assinatura = (c: ConfigResolvida) => JSON.stringify([c.regraId, c.demaisId, c.linhas]);

  for (const [clienteId, grafias] of empresasPorCliente) {
    const nomeCliente = clientePorId.get(clienteId)?.nome ?? '';
    const configs = grafias.map((g) => ({ empresa: g, cfg: configDaEmpresa(g) }));
    let escolhida = configs[0] as (typeof configs)[number];
    if (new Set(configs.map((c) => assinatura(c.cfg))).size > 1) {
      // Grafias com configurações diferentes: só com a decisão de qual vale (`grafiasPreferidas`).
      const preferida = configs.filter((c) =>
        opcoes.grafiasPreferidas?.some((g) => chaveCadastro(g) === chaveCadastro(c.empresa)),
      );
      if (preferida.length !== 1) {
        erros.push(
          `Grafias ${grafias.map((g) => `"${g}"`).join(', ')} casam com ${nomeCliente} e têm configurações diferentes: diga qual vale.`,
        );
        continue;
      }
      escolhida = preferida[0] as (typeof configs)[number];
      for (const c of configs.filter((x) => x !== escolhida))
        avisar(
          'clientes_tipificacao',
          c.empresa,
          `Outra grafia de ${nomeCliente} com configuração diferente: vale a de ${escolhida.empresa}; esta é ignorada.`,
        );
    } else if (configs.length > 1) {
      avisar(
        'clientes_tipificacao',
        grafias.join(', '),
        `Grafias de ${nomeCliente} com a mesma configuração: entram uma vez.`,
      );
    }
    const { cfg } = escolhida;
    avisos.push(...cfg.avisos);
    erros.push(...cfg.erros);
    if (cfg.erros.length || vazia(cfg)) continue;

    cfg.linhas.forEach((l, i) => {
      const ordemLinha = i + 1;
      const id = idDoLegado('tipificacao_linha', `${clienteId}:${ordemLinha}`);
      tabelas.clientesTipificacaoLinhas.push({
        id,
        clienteId,
        ordem: ordemLinha,
        tipo: l.tipo,
        modoMedico: l.modo,
        subregraId: l.subregraId,
      });
      for (const v of l.valores) {
        if (l.tipo === 'modalidade')
          tabelas.clientesTipificacaoLinhasModalidades.push({ linhaId: id, modalidadeId: v });
        else if (l.tipo === 'especialidade')
          tabelas.clientesTipificacaoLinhasEspecialidades.push({ linhaId: id, especialidadeId: v });
        else tabelas.clientesTipificacaoLinhasPrioridades.push({ linhaId: id, prioridadeId: v });
      }
      for (const m of l.medicos)
        tabelas.clientesTipificacaoLinhasMedicos.push({ linhaId: id, medicoId: m });
      for (const e of l.equipes)
        tabelas.clientesTipificacaoLinhasEquipes.push({ linhaId: id, equipeId: e });
    });
    tabelas.clientesTipificacao.push({
      clienteId,
      regraId: cfg.regraId,
      subregraDemaisId: cfg.demaisId,
      atualizadoPorId: null,
    });
  }

  // No dashboards-one, empresa sem configuração é CO. A unidade sem configuração própria, no
  // redo-one, seguiria a do principal: quando ela não é a padrão, a unidade ganha a padrão
  // explícita. Unidade com linhas e sem regra principal também fica na padrão (não herda).
  const padraoId = tabRegras.find((r) => r.padrao)?.id ?? null;
  const configPorCliente = new Map(tabelas.clientesTipificacao.map((c) => [c.clienteId, c]));
  const comLinhas = new Set(tabelas.clientesTipificacaoLinhas.map((l) => l.clienteId));
  const foraDaPadrao = (id: string) => {
    const c = configPorCliente.get(id);
    return Boolean(
      c && ((c.regraId && c.regraId !== padraoId) || c.subregraDemaisId || comLinhas.has(id)),
    );
  };
  let unidadesComCoExplicita = 0;
  for (const cl of padraoId ? cadastro.clientes : []) {
    if (!cl.unificadoEmId) continue;
    const propria = configPorCliente.get(cl.id);
    if (propria) {
      propria.regraId ??= padraoId;
      continue;
    }
    if (!foraDaPadrao(cl.unificadoEmId)) continue;
    tabelas.clientesTipificacao.push({
      clienteId: cl.id,
      regraId: padraoId,
      subregraDemaisId: null,
      atualizadoPorId: null,
    });
    unidadesComCoExplicita += 1;
    avisar(
      'clientes_tipificacao',
      cl.nome,
      `Unidade sem configuração no dashboards-one (lá era CO): gravada a padrão explícita, para não seguir a de ${clientePorId.get(cl.unificadoEmId)?.nome ?? 'principal'}.`,
    );
  }
  // Grafia (apelido) sem configuração lá de um cliente fora da padrão: aqui segue a do cliente.
  const empresasComConfiguracao = new Set(empresas.map((e) => chaveCadastro(e)));
  for (const a of cadastro.clientesAliases) {
    if (a.tipo === 'prefixo' || empresasComConfiguracao.has(chaveCadastro(a.chave))) continue;
    if (!foraDaPadrao(a.clienteId)) continue;
    const nome = clientePorId.get(a.clienteId)?.nome ?? '';
    avisar(
      'clientes_tipificacao',
      a.chave,
      `Grafia de ${nome} sem configuração no dashboards-one (lá era CO): no redo-one segue a de ${nome}.`,
    );
  }

  return { tabelas, avisos, erros, unidadesComCoExplicita };
}

/** O cadastro da carga a partir do catálogo e dos médicos migrados (ids estáveis). */
export function cadastroDaCarga(
  especialidadesDosLaudos: CadastroParaTipificacao['especialidadesDosLaudos'],
  catalogo: CatalogoMigrado['tabelas'],
  medicos: MedicosMigrados['tabelas'],
): CadastroParaTipificacao {
  return {
    clientes: catalogo.clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      chaveNormalizada: c.chaveNormalizada,
      nomeFantasia: c.nomeFantasia ?? null,
      unificadoEmId: c.unificadoEmId ?? null,
    })),
    clientesAliases: catalogo.clientesAliases.map((a) => ({
      tipo: a.tipo,
      chave: a.chave,
      clienteId: a.clienteId,
    })),
    sufixosNomeCliente: catalogo.sufixosNomeCliente.map((s) => ({
      sufixo: s.sufixo,
      ativo: s.ativo ?? true,
    })),
    modalidades: catalogo.modalidades.map((m) => ({ id: m.id as string, codigo: m.codigo })),
    modalidadesDePara: catalogo.modalidadesDePara.map((d) => ({
      origem: d.origem,
      modalidadeId: d.modalidadeId,
    })),
    especialidades: catalogo.especialidades.map((e) => ({ id: e.id as string, nome: e.nome })),
    especialidadesDePara: catalogo.especialidadesDePara.map((d) => ({
      origem: d.origem,
      especialidadeId: d.especialidadeId ?? null,
    })),
    especialidadesDosLaudos,
    prioridades: catalogo.prioridades.map((p) => ({ id: p.id as string, nome: p.nome })),
    prioridadesDePara: catalogo.prioridadesDePara.map((d) => ({
      origem: d.origem,
      prioridadeId: d.prioridadeId,
    })),
    medicos: medicos.medicos.map((m) => ({
      id: m.id as string,
      chaveNormalizada: m.chaveNormalizada,
    })),
    medicosAliases: medicos.medicosAliases.map((a) => ({
      medicoId: a.medicoId,
      chaveNormalizada: a.chaveNormalizada,
    })),
    equipes: medicos.equipes.map((e) => ({ id: e.id as string, nome: e.nome })),
  };
}
