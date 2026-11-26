import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  categoriasExame,
  clientes,
  contratados,
  especialidades,
  modalidades,
  prioridades,
} from './catalogo';
import { recalculosCompetencia } from './faturamento';
import { usuarios } from './identidade';
import { laudos } from './ingestao';
import { equipes, medicos } from './medicos';

// Contexto `repasse`: o que se paga a cada médico na competência. Dinheiro em centavos inteiros.
// Tudo o que decide o valor tem vigência por competência ("AAAA-MM", inclusivas): nada se
// sobrescreve nem se apaga; mudar é encerrar a versão (`vigencia_ate`) e criar outra a partir de
// uma competência aberta ou futura. Recorte "todos" é sempre explícito (coluna booleana), nunca
// lista vazia. A competência (abertura e fechamento) é a do `faturamento`.

const quando = (nome: string) => timestamp(nome, { withTimezone: true });
const quem = (nome: string) => uuid(nome).references(() => usuarios.id);
const competencia = (nome: string) => text(nome);
const COMPETENCIA_RE = `'^[0-9]{4}-(0[1-9]|1[0-2])$'`;

/** Vigência por competência: `desde` vazio = desde sempre (carga do dashboards-one); `ate` vazio = sem fim. */
const vigencia = () => ({
  vigenciaDesde: competencia('vigencia_desde'),
  vigenciaAte: competencia('vigencia_ate'),
  criadoEm: quando('criado_em').notNull().defaultNow(),
  /** Nulo na carga do dashboards-one. */
  criadoPorId: quem('criado_por_id'),
});

const checkVigencia = (
  tabela: string,
  t: { vigenciaDesde: AnyPgColumn; vigenciaAte: AnyPgColumn },
) =>
  check(
    `${tabela}_vigencia_check`,
    sql`(${t.vigenciaDesde} is null or ${t.vigenciaDesde} ~ ${sql.raw(COMPETENCIA_RE)})
      and (${t.vigenciaAte} is null or ${t.vigenciaAte} ~ ${sql.raw(COMPETENCIA_RE)})
      and (${t.vigenciaDesde} is null or ${t.vigenciaAte} is null or ${t.vigenciaAte} >= ${t.vigenciaDesde})`,
  );

/** Exatamente uma das colunas preenchida (linha de recorte com FK por dimensão). */
const exatamenteUma = (tabela: string, colunas: AnyPgColumn[]) =>
  check(
    `${tabela}_uma_dimensao_check`,
    sql.join(
      [
        sql`(`,
        sql.join(
          colunas.map((c) => sql`(${c} is not null)::int`),
          sql` + `,
        ),
        sql`) = 1`,
      ],
      sql``,
    ),
  );

/**
 * Parâmetros do repasse que o negócio muda (no dashboards-one, fixos no código ou num singleton),
 * com vigência a partir de `vigencia_desde` até a versão seguinte. Só se cria versão nova.
 */
export const parametrosRepasse = pgTable(
  'parametros_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** "AAAA-MM": vale desta competência até a próxima versão. */
    vigenciaDesde: competencia('vigencia_desde').notNull(),
    /** Tarifa padrão do Peer Review (por avaliação), sugerida no lançamento. */
    tarifaPeerReviewCentavos: integer('tarifa_peer_review_centavos').notNull(),
    /** Tarifa padrão do Plantão (por plantão), sugerida no lançamento. */
    tarifaPlantaoCentavos: integer('tarifa_plantao_centavos').notNull(),
    /** Contratado sob o qual o repasse é registrado (no dashboards-one, escolhido por heurística). */
    contratadoRegistroId: uuid('contratado_registro_id').references(() => contratados.id),
    /** Laudo marcado como duplicado na MobileMed entra no repasse. */
    pagaDuplicados: boolean('paga_duplicados').notNull(),
    /** Dia do vencimento do pagamento, no mês seguinte à competência (1 a 28). */
    diaVencimento: integer('dia_vencimento').notNull(),
    /** Dia do mês seguinte a partir do qual a competência não pode mais ser antecipada (1 a 28). */
    diaCorteAntecipacao: integer('dia_corte_antecipacao').notNull(),
    /** Categoria financeira do pagamento a médico sócio e a não sócio (contas a pagar). */
    categoriaFinanceiraSocio: text('categoria_financeira_socio').notNull(),
    categoriaFinanceiraNaoSocio: text('categoria_financeira_nao_socio').notNull(),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    criadoPorId: quem('criado_por_id'),
  },
  (t) => [
    unique('parametros_repasse_vigencia_desde_key').on(t.vigenciaDesde),
    check(
      'parametros_repasse_vigencia_check',
      sql`${t.vigenciaDesde} ~ ${sql.raw(COMPETENCIA_RE)}`,
    ),
    check(
      'parametros_repasse_tarifas_check',
      sql`${t.tarifaPeerReviewCentavos} > 0 and ${t.tarifaPlantaoCentavos} > 0`,
    ),
    check(
      'parametros_repasse_dias_check',
      sql`${t.diaVencimento} between 1 and 28 and ${t.diaCorteAntecipacao} between 1 and 28`,
    ),
  ],
);

/** Faixas padrão da gratificação por lista de exames em atraso, por versão dos parâmetros. */
export const faixasListaAtrasoPadrao = pgTable(
  'faixas_lista_atraso_padrao',
  {
    parametrosId: uuid('parametros_id')
      .notNull()
      .references(() => parametrosRepasse.id, { onDelete: 'cascade' }),
    /** A partir de quantos exames entregues no prazo. */
    exames: integer('exames').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.parametrosId, t.exames] }),
    check('faixas_lista_atraso_padrao_check', sql`${t.exames} > 0 and ${t.valorCentavos} >= 0`),
  ],
);

/**
 * Preço do repasse do médico por arranjo: para todos os clientes (explícito) ou para um cliente
 * (principal ou unidade). O preço do cliente vence o de todos.
 */
export const precosRepasse = pgTable(
  'precos_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
    modalidadeId: uuid('modalidade_id')
      .notNull()
      .references(() => modalidades.id),
    especialidadeId: uuid('especialidade_id')
      .notNull()
      .references(() => especialidades.id),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categoriasExame.id),
    prioridadeId: uuid('prioridade_id')
      .notNull()
      .references(() => prioridades.id),
    todosClientes: boolean('todos_clientes').notNull(),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    valorCentavos: integer('valor_centavos').notNull(),
    ...vigencia(),
  },
  (t) => [
    index('precos_repasse_medico_idx').on(t.medicoId, t.modalidadeId, t.especialidadeId),
    check('precos_repasse_cliente_check', sql`${t.todosClientes} = (${t.clienteId} is null)`),
    check('precos_repasse_valor_check', sql`${t.valorCentavos} >= 0`),
    checkVigencia('precos_repasse', t),
  ],
);

/**
 * Como o repasse trata os laudos de um médico, com vigência. Sem versão vigente, todos os laudos
 * contam. `somente_adicionais`: nenhum laudo conta. `todos_os_laudos` falso: só os laudos que
 * casam algum recorte (cliente × especialidade).
 */
export const configuracoesMedicoRepasse = pgTable(
  'configuracoes_medico_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
    somenteAdicionais: boolean('somente_adicionais').notNull(),
    todosOsLaudos: boolean('todos_os_laudos').notNull(),
    ...vigencia(),
  },
  (t) => [
    index('configuracoes_medico_repasse_medico_idx').on(t.medicoId),
    checkVigencia('configuracoes_medico_repasse', t),
  ],
);

/** Recorte da configuração do médico: cliente (ou todos) × especialidade (ou todas). */
export const configuracoesMedicoRepasseRecortes = pgTable(
  'configuracoes_medico_repasse_recortes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    configuracaoId: uuid('configuracao_id')
      .notNull()
      .references(() => configuracoesMedicoRepasse.id, { onDelete: 'cascade' }),
    todosClientes: boolean('todos_clientes').notNull(),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    todasEspecialidades: boolean('todas_especialidades').notNull(),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
  },
  (t) => [
    index('configuracoes_medico_repasse_recortes_configuracao_idx').on(t.configuracaoId),
    check(
      'configuracoes_medico_repasse_recortes_check',
      sql`${t.todosClientes} = (${t.clienteId} is null) and ${t.todasEspecialidades} = (${t.especialidadeId} is null)`,
    ),
  ],
);

/**
 * Reclassificação do laudo para o repasse, em ordem (a primeira que casa vale): ex.: coluna
 * laudada por médico da equipe "Neurologistas" vira NEURO|SC. Destino vazio mantém o do laudo.
 */
export const reclassificacoesRepasse = pgTable(
  'reclassificacoes_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ordem: integer('ordem').notNull(),
    descricao: text('descricao').notNull(),
    todasModalidades: boolean('todas_modalidades').notNull(),
    todasEspecialidades: boolean('todas_especialidades').notNull(),
    todasCategorias: boolean('todas_categorias').notNull(),
    todosMedicos: boolean('todos_medicos').notNull(),
    especialidadeDestinoId: uuid('especialidade_destino_id').references(() => especialidades.id),
    categoriaDestinoId: uuid('categoria_destino_id').references(() => categoriasExame.id),
    ...vigencia(),
  },
  (t) => [
    check(
      'reclassificacoes_repasse_destino_check',
      sql`${t.especialidadeDestinoId} is not null or ${t.categoriaDestinoId} is not null`,
    ),
    checkVigencia('reclassificacoes_repasse', t),
  ],
);

/** Recortes da reclassificação (uma dimensão por linha); a dimensão sem "todas" precisa de ao menos um. */
export const reclassificacoesRepasseRecortes = pgTable(
  'reclassificacoes_repasse_recortes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reclassificacaoId: uuid('reclassificacao_id')
      .notNull()
      .references(() => reclassificacoesRepasse.id, { onDelete: 'cascade' }),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    categoriaId: uuid('categoria_id').references(() => categoriasExame.id),
    /** Médicos da equipe (grupo de médicos do contexto `medicos`). */
    equipeId: uuid('equipe_id').references(() => equipes.id),
  },
  (t) => [
    index('reclassificacoes_repasse_recortes_regra_idx').on(t.reclassificacaoId),
    exatamenteUma('reclassificacoes_repasse_recortes', [
      t.modalidadeId,
      t.especialidadeId,
      t.categoriaId,
      t.equipeId,
    ]),
  ],
);

/**
 * Categoria alternativa quando o arranjo não tem preço, em ordem: ex.: NEURO|COLUNAS sem preço
 * tenta NEURO|SC; laudo sem categoria tenta SC.
 */
export const alternativasPrecoRepasse = pgTable(
  'alternativas_preco_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ordem: integer('ordem').notNull(),
    todasEspecialidades: boolean('todas_especialidades').notNull(),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    /** Verdadeiro: vale para o laudo sem categoria (e `categoria_origem_id` fica vazio). */
    semCategoria: boolean('sem_categoria').notNull(),
    categoriaOrigemId: uuid('categoria_origem_id').references(() => categoriasExame.id),
    categoriaDestinoId: uuid('categoria_destino_id')
      .notNull()
      .references(() => categoriasExame.id),
    ...vigencia(),
  },
  (t) => [
    check(
      'alternativas_preco_repasse_check',
      sql`${t.todasEspecialidades} = (${t.especialidadeId} is null) and ${t.semCategoria} = (${t.categoriaOrigemId} is null)`,
    ),
    checkVigencia('alternativas_preco_repasse', t),
  ],
);

export const tipoRegraApuracao = pgEnum('tipo_regra_apuracao', [
  /** Valor por competência. */
  'fixo',
  /** Valor por laudo da operação inteira que casa os recortes. */
  'por_laudo',
  /** Percentual do valor de exames dos médicos que laudam as especialidades do recorte. */
  'percentual_repasse',
  /** Valor por laudo do próprio médico, no lugar dos preços. */
  'tarifa_laudo',
]);

/** Regra de apuração do médico (coordenação, tarifa própria), com vigência. */
export const regrasApuracaoRepasse = pgTable(
  'regras_apuracao_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
    tipo: tipoRegraApuracao('tipo').notNull(),
    descricao: text('descricao').notNull(),
    /** `fixo`, `por_laudo` e `tarifa_laudo`. */
    valorCentavos: integer('valor_centavos'),
    /** `percentual_repasse`, em partes por milhão (6% = 60000). */
    percentualPpm: integer('percentual_ppm'),
    /** O resultado é dividido por ele (a variável de plantão é ÷ 2). */
    divisor: integer('divisor').notNull().default(1),
    todasModalidades: boolean('todas_modalidades').notNull(),
    todasEspecialidades: boolean('todas_especialidades').notNull(),
    todasPrioridades: boolean('todas_prioridades').notNull(),
    ...vigencia(),
  },
  (t) => [
    index('regras_apuracao_repasse_medico_idx').on(t.medicoId),
    check(
      'regras_apuracao_repasse_valor_check',
      sql`case when ${t.tipo} = 'percentual_repasse'
        then ${t.percentualPpm} > 0 and ${t.valorCentavos} is null
        else ${t.valorCentavos} > 0 and ${t.percentualPpm} is null end`,
    ),
    check('regras_apuracao_repasse_divisor_check', sql`${t.divisor} >= 1`),
    checkVigencia('regras_apuracao_repasse', t),
  ],
);

export const regrasApuracaoRepasseRecortes = pgTable(
  'regras_apuracao_repasse_recortes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    regraId: uuid('regra_id')
      .notNull()
      .references(() => regrasApuracaoRepasse.id, { onDelete: 'cascade' }),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    prioridadeId: uuid('prioridade_id').references(() => prioridades.id),
  },
  (t) => [
    index('regras_apuracao_repasse_recortes_regra_idx').on(t.regraId),
    exatamenteUma('regras_apuracao_repasse_recortes', [
      t.modalidadeId,
      t.especialidadeId,
      t.prioridadeId,
    ]),
  ],
);

export const tipoAdicionalRepasse = pgEnum('tipo_adicional_repasse', [
  'avulso',
  /** Por quantidade de avaliações, com os meses avaliados (não se paga o mesmo mês duas vezes). */
  'peer_review',
  /** Por quantidade de plantões. */
  'plantao',
]);

/**
 * Crédito (positivo) ou débito (negativo) avulso no repasse da competência. Nunca se apaga: o
 * cancelamento fica registrado. Lançar na competência fechada é um recálculo dela, com motivo.
 */
export const adicionaisRepasse = pgTable(
  'adicionais_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
    competencia: competencia('competencia').notNull(),
    data: date('data').notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    descricao: text('descricao').notNull(),
    tipo: tipoAdicionalRepasse('tipo').notNull(),
    quantidade: integer('quantidade'),
    valorUnitarioCentavos: integer('valor_unitario_centavos'),
    /** Peer Review: meses avaliados ("AAAA-MM", inclusivos). */
    referenciaDesde: competencia('referencia_desde'),
    referenciaAte: competencia('referencia_ate'),
    /**
     * Lançado na própria competência fechada: o pedido de recálculo (com o motivo, quem pediu e
     * quando) que o fez entrar.
     */
    recalculoId: uuid('recalculo_id').references(() => recalculosCompetencia.id),
    lancadoEm: quando('lancado_em').notNull().defaultNow(),
    /** Nulo na carga do dashboards-one. */
    lancadoPorId: quem('lancado_por_id'),
    canceladoEm: quando('cancelado_em'),
    canceladoPorId: quem('cancelado_por_id'),
    motivoCancelamento: text('motivo_cancelamento'),
  },
  (t) => [
    index('adicionais_repasse_competencia_idx').on(t.competencia, t.medicoId),
    check('adicionais_repasse_valor_check', sql`${t.valorCentavos} <> 0`),
    check(
      'adicionais_repasse_competencia_check',
      sql`${t.competencia} ~ ${sql.raw(COMPETENCIA_RE)}`,
    ),
    check(
      'adicionais_repasse_quantidade_check',
      sql`case when ${t.tipo} = 'avulso'
        then ${t.quantidade} is null and ${t.valorUnitarioCentavos} is null
        else ${t.quantidade} >= 1 and ${t.valorUnitarioCentavos} > 0 end`,
    ),
    check(
      'adicionais_repasse_referencia_check',
      sql`case when ${t.tipo} = 'peer_review'
        then ${t.referenciaDesde} is not null and ${t.referenciaAte} >= ${t.referenciaDesde}
        else ${t.referenciaDesde} is null and ${t.referenciaAte} is null end`,
    ),
    check(
      'adicionais_repasse_cancelamento_check',
      sql`(${t.canceladoEm} is null) = (${t.motivoCancelamento} is null)`,
    ),
  ],
);

export const aplicacaoRetencao = pgEnum('aplicacao_retencao', [
  'todos',
  'pessoa_fisica',
  'pessoa_juridica',
  'pessoa_juridica_simples',
  'pessoa_juridica_fora_simples',
]);

/**
 * Retenção de imposto no pagamento do médico (IR, INSS...). Vazia: o repasse sai cheio, como no
 * dashboards-one. Aguarda o financeiro para ganhar linhas.
 */
export const retencoesRepasse = pgTable(
  'retencoes_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    descricao: text('descricao').notNull(),
    aplicaA: aplicacaoRetencao('aplica_a').notNull(),
    /** Alíquota sobre o bruto, em partes por milhão (1,5% = 15000). */
    aliquotaPpm: integer('aliquota_ppm').notNull(),
    /** Abaixo deste valor a retenção zera. */
    pisoCentavos: integer('piso_centavos').notNull().default(0),
    ...vigencia(),
  },
  (t) => [
    check(
      'retencoes_repasse_valores_check',
      sql`${t.aliquotaPpm} > 0 and ${t.aliquotaPpm} <= 1000000 and ${t.pisoCentavos} >= 0`,
    ),
    checkVigencia('retencoes_repasse', t),
  ],
);

export const tipoGeracaoRepasse = pgEnum('tipo_geracao_repasse', [
  /** Competência aberta: refeita a cada importação ou mudança de configuração. */
  'previa',
  /** Competência fechada recalculada por um pedido com motivo; a versão anterior fica guardada. */
  'recalculo',
]);

/**
 * Uma geração dos demonstrativos de uma competência. Só uma é a atual; a de uma competência
 * fechada nunca se apaga (o recálculo cria outra e a anterior deixa de ser a atual).
 */
export const geracoesRepasse = pgTable(
  'geracoes_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competencia: competencia('competencia').notNull(),
    tipo: tipoGeracaoRepasse('tipo').notNull(),
    atual: boolean('atual').notNull(),
    /** O pedido de recálculo da competência fechada (motivo, quem pediu e quando). */
    recalculoId: uuid('recalculo_id').references(() => recalculosCompetencia.id),
    geradoEm: quando('gerado_em').notNull().defaultNow(),
    /** Nulo: o sistema (job). */
    geradoPorId: quem('gerado_por_id'),
    medicos: integer('medicos').notNull(),
    brutoCentavos: integer('bruto_centavos').notNull(),
    liquidoCentavos: integer('liquido_centavos').notNull(),
  },
  (t) => [
    uniqueIndex('geracoes_repasse_atual_key').on(t.competencia).where(sql`${t.atual}`),
    index('geracoes_repasse_competencia_idx').on(t.competencia, t.geradoEm),
    check(
      'geracoes_repasse_recalculo_check',
      sql`(${t.tipo} = 'recalculo') = (${t.recalculoId} is not null)`,
    ),
  ],
);

/** Demonstrativo de repasse do médico numa geração. */
export const demonstrativosRepasse = pgTable(
  'demonstrativos_repasse',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    geracaoId: uuid('geracao_id')
      .notNull()
      .references(() => geracoesRepasse.id, { onDelete: 'cascade' }),
    competencia: competencia('competencia').notNull(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
    contratadoId: uuid('contratado_id').references(() => contratados.id),
    /** Soma do volume dos laudos pagos. */
    volume: numeric('volume', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    examesCentavos: integer('exames_centavos').notNull(),
    adicionaisCentavos: integer('adicionais_centavos').notNull(),
    brutoCentavos: integer('bruto_centavos').notNull(),
    retencoesCentavos: integer('retencoes_centavos').notNull(),
    liquidoCentavos: integer('liquido_centavos').notNull(),
    /** Grupos de laudos sem preço (o aviso trava o fechamento). */
    gruposSemPreco: integer('grupos_sem_preco').notNull(),
  },
  (t) => [
    unique('demonstrativos_repasse_geracao_medico_key').on(t.geracaoId, t.medicoId),
    index('demonstrativos_repasse_medico_idx').on(t.medicoId, t.competencia),
  ],
);

export const tipoItemRepasse = pgEnum('tipo_item_repasse', [
  'exames',
  'adicional',
  'regra',
  'retencao',
]);

export const origemPrecoRepasse = pgEnum('origem_preco_repasse', [
  /** Preço do médico para a unidade do laudo. */
  'unidade',
  /** Preço do médico para o cliente (principal) do laudo. */
  'cliente',
  /** Preço do médico para todos os clientes. */
  'todos',
  /** Tarifa própria do médico (regra de apuração). */
  'tarifa_propria',
  'sem_preco',
]);

/** Linha do demonstrativo: grupo de laudos (arranjo × cliente), adicional, regra ou retenção. */
export const demonstrativosRepasseItens = pgTable(
  'demonstrativos_repasse_itens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    demonstrativoId: uuid('demonstrativo_id')
      .notNull()
      .references(() => demonstrativosRepasse.id, { onDelete: 'cascade' }),
    tipo: tipoItemRepasse('tipo').notNull(),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    categoriaId: uuid('categoria_id').references(() => categoriasExame.id),
    prioridadeId: uuid('prioridade_id').references(() => prioridades.id),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    unidadeId: uuid('unidade_id').references(() => clientes.id),
    volume: numeric('volume', { precision: 12, scale: 2, mode: 'number' }),
    unitarioCentavos: integer('unitario_centavos'),
    totalCentavos: integer('total_centavos').notNull(),
    origemPreco: origemPrecoRepasse('origem_preco'),
    /** A categoria do preço, quando veio por uma alternativa (ex.: COLUNAS pago como SC). */
    categoriaPrecoId: uuid('categoria_preco_id').references(() => categoriasExame.id),
    precoId: uuid('preco_id').references(() => precosRepasse.id),
    adicionalId: uuid('adicional_id').references(() => adicionaisRepasse.id),
    regraId: uuid('regra_id').references(() => regrasApuracaoRepasse.id),
    retencaoId: uuid('retencao_id').references(() => retencoesRepasse.id),
    /** Memória de cálculo do adicional, da regra ou da retenção. */
    descricao: text('descricao'),
  },
  (t) => [index('demonstrativos_repasse_itens_demonstrativo_idx').on(t.demonstrativoId)],
);

/** Visão diária do demonstrativo (dia do laudo em Brasília): os dias somam o valor dos exames. */
export const demonstrativosRepasseDias = pgTable(
  'demonstrativos_repasse_dias',
  {
    demonstrativoId: uuid('demonstrativo_id')
      .notNull()
      .references(() => demonstrativosRepasse.id, { onDelete: 'cascade' }),
    dia: date('dia').notNull(),
    volume: numeric('volume', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    totalCentavos: integer('total_centavos').notNull(),
  },
  (t) => [primaryKey({ columns: [t.demonstrativoId, t.dia] })],
);

/**
 * Laudo (ou peça da quebra) pago em cada grupo: base do detalhe exame a exame e do PDF do médico
 * (o nome do paciente é lido na hora, pelo `laudo_id`, com permissão).
 */
export const demonstrativosRepasseLaudos = pgTable(
  'demonstrativos_repasse_laudos',
  {
    demonstrativoId: uuid('demonstrativo_id')
      .notNull()
      .references(() => demonstrativosRepasse.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => demonstrativosRepasseItens.id, { onDelete: 'cascade' }),
    laudoId: uuid('laudo_id')
      .notNull()
      .references(() => laudos.id),
    /** 0 = o laudo inteiro; 1..N = a peça da quebra. */
    peca: integer('peca').notNull(),
    volume: numeric('volume', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    totalCentavos: integer('total_centavos').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.demonstrativoId, t.laudoId, t.peca] }),
    index('demonstrativos_repasse_laudos_laudo_idx').on(t.laudoId),
  ],
);
