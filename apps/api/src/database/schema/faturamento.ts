import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
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
import { usuarios } from './identidade';
import { laudos } from './ingestao';
import { equipes, medicos } from './medicos';

// Contexto `faturamento`: as competências (meses de faturamento) com fechamento e trava da
// importação, os cortes que decidem a competência de cada laudo (padrão e por cliente), os dados
// fiscais do cliente, a tipificação (CO/NC/NC1 e sub-regras) que decide se o laudo fatura e os
// preços (do cliente e a tabela padrão do contratado).

const quando = (nome: string) => timestamp(nome, { withTimezone: true });
const quem = (nome: string) => uuid(nome).references(() => usuarios.id);

/**
 * Competência "YYYY-MM". A linha nasce na importação (aberta) ou na migração do dashboards-one; mês
 * sem linha está aberto. Quem fechou, reabriu ou travou vem como usuário ou, na migração, como o
 * texto do dashboards-one (`*_por_legado`) quando não há usuário correspondente.
 */
export const competencias = pgTable(
  'competencias',
  {
    competencia: text('competencia').primaryKey(),
    status: text('status', { enum: ['aberta', 'fechada'] }).notNull(),
    fechadaEm: quando('fechada_em'),
    fechadaPorId: quem('fechada_por_id'),
    fechadaPorLegado: text('fechada_por_legado'),
    /**
     * Fechada apesar de avisos pendentes que impedem fechar: o motivo de quem tem a permissão
     * própria. Nulo no fechamento sem avisos; o fechamento seguinte sobrescreve.
     */
    fechadaComAvisosMotivo: text('fechada_com_avisos_motivo'),
    reabertaEm: quando('reaberta_em'),
    reabertaPorId: quem('reaberta_por_id'),
    reabertaPorLegado: text('reaberta_por_legado'),
    /** Trava a importação mesmo com a competência aberta; reabrir não destrava. */
    importacaoTravadaEm: quando('importacao_travada_em'),
    importacaoTravadaPorId: quem('importacao_travada_por_id'),
    importacaoTravadaPorLegado: text('importacao_travada_por_legado'),
    observacoes: text('observacoes'),
    criadaEm: quando('criada_em').notNull().defaultNow(),
    atualizadaEm: quando('atualizada_em')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('competencias_status_idx').on(t.status),
    check('competencias_status_check', sql`${t.status} in ('aberta', 'fechada')`),
  ],
);

/**
 * Vigência do corte da competência a partir de `desde` ("YYYY-MM"). Sem cliente = o corte padrão;
 * com cliente, um corte próprio ou "usa o padrão". Só se cria vigência nova; a passada não se edita.
 */
export const cortesCompetencia = pgTable(
  'cortes_competencia',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    desde: text('desde').notNull(),
    /** Só com cliente: a partir de `desde` ele segue o corte padrão. */
    usaPadrao: boolean('usa_padrao').notNull().default(false),
    /** 1 a 31 (dia maior que o mês vale o último dia); nulo com `ultimo_dia` ou `usa_padrao`. */
    dia: integer('dia'),
    ultimoDia: boolean('ultimo_dia').notNull().default(false),
    /** `seguinte`: o corte cai no mês M+1; `proprio`: no próprio mês M. */
    mes: text('mes', { enum: ['proprio', 'seguinte'] }),
    /** A competência é o maior entre o mês da data do laudo e o da data do exame (cada um pelo seu corte). */
    consideraExame: boolean('considera_exame'),
    /**
     * Período da data do exame, com a mesma forma do laudo; vale com `considera_exame`. Nulos com
     * `usa_padrao`; as vigências de antes de 25/11/2026 ficaram com o mês cheio (último dia, próprio).
     */
    exameDia: integer('exame_dia'),
    exameUltimoDia: boolean('exame_ultimo_dia').notNull().default(false),
    exameMes: text('exame_mes', { enum: ['proprio', 'seguinte'] }),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    criadoPorId: quem('criado_por_id'),
  },
  (t) => [
    uniqueIndex('cortes_competencia_padrao_desde_key')
      .on(t.desde)
      .where(sql`${t.clienteId} is null`),
    uniqueIndex('cortes_competencia_cliente_desde_key')
      .on(t.clienteId, t.desde)
      .where(sql`${t.clienteId} is not null`),
    check('cortes_competencia_dia_check', sql`${t.dia} between 1 and 31`),
    check('cortes_competencia_mes_check', sql`${t.mes} in ('proprio', 'seguinte')`),
    check('cortes_competencia_exame_dia_check', sql`${t.exameDia} between 1 and 31`),
    check('cortes_competencia_exame_mes_check', sql`${t.exameMes} in ('proprio', 'seguinte')`),
    check(
      'cortes_competencia_exame_check',
      sql`case when ${t.usaPadrao}
        then ${t.exameDia} is null and not ${t.exameUltimoDia} and ${t.exameMes} is null
        else ${t.exameMes} is not null and (${t.exameDia} is not null) <> ${t.exameUltimoDia}
      end`,
    ),
    check(
      'cortes_competencia_usa_padrao_check',
      sql`not ${t.usaPadrao} or ${t.clienteId} is not null`,
    ),
    check(
      'cortes_competencia_corte_check',
      sql`case when ${t.usaPadrao}
        then ${t.dia} is null and not ${t.ultimoDia} and ${t.mes} is null and ${t.consideraExame} is null
        else ${t.mes} is not null and ${t.consideraExame} is not null and (${t.dia} is not null) <> ${t.ultimoDia}
      end`,
    ),
  ],
);

/**
 * Dados de faturamento do cliente (1:1 com `clientes`): para onde vai a NF, endereço, contato e
 * banco. Nada é obrigatório no banco (o
 * dashboards-one tem clientes sem endereço); a tela exige o endereço mínimo quando ele é preenchido.
 */
export const clientesDadosFiscais = pgTable(
  'clientes_dados_fiscais',
  {
    clienteId: uuid('cliente_id')
      .primaryKey()
      .references(() => clientes.id, { onDelete: 'cascade' }),
    /** E-mails que recebem a NF e os demonstrativos, na ordem cadastrada. */
    emailsNf: text('emails_nf').array().notNull().default(sql`'{}'::text[]`), // LGPD: pessoal
    email: text('email'), // LGPD: pessoal
    contatoNome: text('contato_nome'), // LGPD: pessoal
    telefone: text('telefone'), // LGPD: pessoal
    /** Só dígitos; a carga traz como estava o que não deu 8 dígitos. */
    cep: text('cep'),
    logradouro: text('logradouro'),
    numero: text('numero'),
    complemento: text('complemento'),
    bairro: text('bairro'),
    cidade: text('cidade'),
    uf: text('uf'),
    bancoCodigo: text('banco_codigo'),
    bancoAgencia: text('banco_agencia'),
    bancoConta: text('banco_conta'),
    /** Os laudos do cliente saem do faturamento (`faturamentoExclusaoFiscal` do dashboards-one). */
    exclusaoFiscal: boolean('exclusao_fiscal').notNull().default(false),
    atualizadoEm: quando('atualizado_em')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /** Nulo na carga do dashboards-one. */
    atualizadoPorId: quem('atualizado_por_id'),
  },
  (t) => [index('clientes_dados_fiscais_exclusao_fiscal_idx').on(t.exclusaoFiscal)],
);

/**
 * Regra da tipificação (CO, NC, NC1). O laudo que nenhuma linha do cliente casou fica na regra
 * principal do cliente, sem sub-regra, e fatura conforme o "fatura sem sub-regra" vigente
 * (`regras_tipificacao_fatura`). A regra `padrao` é
 * a do cliente sem configuração (uma só).
 */
export const regrasTipificacao = pgTable(
  'regras_tipificacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull().unique(),
    descricao: text('descricao'),
    /** Hex `#RRGGBB` do selo. */
    cor: text('cor'),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    padrao: boolean('padrao').notNull().default(false),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    atualizadoEm: quando('atualizado_em')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('regras_tipificacao_padrao_key').on(t.padrao).where(sql`${t.padrao}`)],
);

/**
 * Sub-regra (CO-FT, NC-NF...): o resultado de uma linha da configuração do cliente. Se fatura, pela
 * versão vigente em `subregras_tipificacao_fatura`.
 */
export const subregrasTipificacao = pgTable(
  'subregras_tipificacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    regraId: uuid('regra_id')
      .notNull()
      .references(() => regrasTipificacao.id),
    nome: text('nome').notNull().unique(),
    descricao: text('descricao'),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    atualizadoEm: quando('atualizado_em')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('subregras_tipificacao_regra_idx').on(t.regraId)],
);

const vigenciaCheck = (tabela: string, desde: AnyPgColumn, ate: AnyPgColumn) =>
  check(
    `${tabela}_vigencia_check`,
    sql`(${desde} is null or ${desde} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and (${ate} is null or ${ate} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and (${desde} is null or ${ate} is null or ${ate} >= ${desde})`,
  );

/**
 * "Fatura sem sub-regra" da regra por competência: mudar encerra a versão e cria outra (nada se
 * sobrescreve); a programada que nunca valeu pode ser apagada.
 */
export const regrasTipificacaoFatura = pgTable(
  'regras_tipificacao_fatura',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    regraId: uuid('regra_id')
      .notNull()
      .references(() => regrasTipificacao.id),
    /** "YYYY-MM"; vazio = sem início (a versão inicial, da carga ou de antes do histórico). */
    vigenciaDesde: text('vigencia_desde'),
    /** "YYYY-MM", inclusiva; vazio = sem fim. */
    vigenciaAte: text('vigencia_ate'),
    faturaSemSubregra: boolean('fatura_sem_subregra').notNull(),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    /** Nulo na carga do dashboards-one. */
    criadoPorId: quem('criado_por_id'),
  },
  (t) => [
    uniqueIndex('regras_tipificacao_fatura_desde_key').on(t.regraId, t.vigenciaDesde),
    vigenciaCheck('regras_tipificacao_fatura', t.vigenciaDesde, t.vigenciaAte),
  ],
);

/** "Fatura" da sub-regra por competência, como o da regra. */
export const subregrasTipificacaoFatura = pgTable(
  'subregras_tipificacao_fatura',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subregraId: uuid('subregra_id')
      .notNull()
      .references(() => subregrasTipificacao.id),
    vigenciaDesde: text('vigencia_desde'),
    vigenciaAte: text('vigencia_ate'),
    fatura: boolean('fatura').notNull(),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    criadoPorId: quem('criado_por_id'),
  },
  (t) => [
    uniqueIndex('subregras_tipificacao_fatura_desde_key').on(t.subregraId, t.vigenciaDesde),
    vigenciaCheck('subregras_tipificacao_fatura', t.vigenciaDesde, t.vigenciaAte),
  ],
);

/**
 * Versão da configuração da tipificação do cliente ou da unidade (regra principal, "todos os
 * demais" e as linhas, como um todo), por competência. A versão vazia (sem regra, demais nem
 * linhas) é o "remover a configuração": volta a seguir a do principal ou a padrão. Nada se
 * sobrescreve nem se apaga, salvo a programada que nunca valeu.
 */
export const clientesTipificacaoVersoes = pgTable(
  'clientes_tipificacao_versoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id),
    vigenciaDesde: text('vigencia_desde'),
    vigenciaAte: text('vigencia_ate'),
    /** Regra do laudo que nenhuma linha casou; vazio = a do principal ou a padrão. */
    regraId: uuid('regra_id').references(() => regrasTipificacao.id),
    /** "Todos os demais": sub-regra do laudo que nenhuma linha casou; vazio = só a regra. */
    subregraDemaisId: uuid('subregra_demais_id').references(() => subregrasTipificacao.id),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    /** Nulo na carga do dashboards-one. */
    criadoPorId: quem('criado_por_id'),
  },
  (t) => [
    uniqueIndex('clientes_tipificacao_versoes_desde_key').on(t.clienteId, t.vigenciaDesde),
    index('clientes_tipificacao_versoes_regra_idx').on(t.regraId),
    index('clientes_tipificacao_versoes_subregra_demais_idx').on(t.subregraDemaisId),
    vigenciaCheck('clientes_tipificacao_versoes', t.vigenciaDesde, t.vigenciaAte),
  ],
);

/**
 * Linha de uma versão da configuração: "se a modalidade/especialidade/prioridade for uma destas e o médico for
 * (todos | apenas | exceto) estes → sub-regra". Vale a primeira linha que casar, pela `ordem`.
 */
export const clientesTipificacaoLinhas = pgTable(
  'clientes_tipificacao_linhas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versaoId: uuid('versao_id')
      .notNull()
      .references(() => clientesTipificacaoVersoes.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull(),
    tipo: text('tipo', { enum: ['modalidade', 'especialidade', 'prioridade'] }).notNull(),
    /** `apenas` nunca casa com laudo sem médico; `exceto` sempre casa. */
    modoMedico: text('modo_medico', { enum: ['todos', 'apenas', 'exceto'] })
      .notNull()
      .default('todos'),
    subregraId: uuid('subregra_id')
      .notNull()
      .references(() => subregrasTipificacao.id),
  },
  (t) => [
    unique('clientes_tipificacao_linhas_versao_ordem_key').on(t.versaoId, t.ordem),
    index('clientes_tipificacao_linhas_subregra_idx').on(t.subregraId),
    check(
      'clientes_tipificacao_linhas_tipo_check',
      sql`${t.tipo} in ('modalidade', 'especialidade', 'prioridade')`,
    ),
    check(
      'clientes_tipificacao_linhas_modo_check',
      sql`${t.modoMedico} in ('todos', 'apenas', 'exceto')`,
    ),
  ],
);

const linhaTipificacao = () =>
  uuid('linha_id')
    .notNull()
    .references(() => clientesTipificacaoLinhas.id, { onDelete: 'cascade' });

/** Modalidades da linha do tipo `modalidade`. */
export const clientesTipificacaoLinhasModalidades = pgTable(
  'clientes_tipificacao_linhas_modalidades',
  {
    linhaId: linhaTipificacao(),
    modalidadeId: uuid('modalidade_id')
      .notNull()
      .references(() => modalidades.id),
  },
  (t) => [
    primaryKey({ columns: [t.linhaId, t.modalidadeId] }),
    index('clientes_tipificacao_linhas_modalidades_modalidade_idx').on(t.modalidadeId),
  ],
);

/** Especialidades da linha do tipo `especialidade`. */
export const clientesTipificacaoLinhasEspecialidades = pgTable(
  'clientes_tipificacao_linhas_especialidades',
  {
    linhaId: linhaTipificacao(),
    especialidadeId: uuid('especialidade_id')
      .notNull()
      .references(() => especialidades.id),
  },
  (t) => [
    primaryKey({ columns: [t.linhaId, t.especialidadeId] }),
    index('clientes_tipificacao_linhas_especialidades_especialidade_idx').on(t.especialidadeId),
  ],
);

/** Prioridades (do catálogo) da linha do tipo `prioridade`. */
export const clientesTipificacaoLinhasPrioridades = pgTable(
  'clientes_tipificacao_linhas_prioridades',
  {
    linhaId: linhaTipificacao(),
    prioridadeId: uuid('prioridade_id')
      .notNull()
      .references(() => prioridades.id),
  },
  (t) => [
    primaryKey({ columns: [t.linhaId, t.prioridadeId] }),
    index('clientes_tipificacao_linhas_prioridades_prioridade_idx').on(t.prioridadeId),
  ],
);

/** Médicos do filtro `apenas`/`exceto` da linha. */
export const clientesTipificacaoLinhasMedicos = pgTable(
  'clientes_tipificacao_linhas_medicos',
  {
    linhaId: linhaTipificacao(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
  },
  (t) => [
    primaryKey({ columns: [t.linhaId, t.medicoId] }),
    index('clientes_tipificacao_linhas_medicos_medico_idx').on(t.medicoId),
  ],
);

/** Equipes (contexto `medicos`) do filtro `apenas`/`exceto` da linha: valem os membros. */
export const clientesTipificacaoLinhasEquipes = pgTable(
  'clientes_tipificacao_linhas_equipes',
  {
    linhaId: linhaTipificacao(),
    equipeId: uuid('equipe_id')
      .notNull()
      .references(() => equipes.id),
  },
  (t) => [
    primaryKey({ columns: [t.linhaId, t.equipeId] }),
    index('clientes_tipificacao_linhas_equipes_equipe_idx').on(t.equipeId),
  ],
);

/**
 * Tipificação de cada laudo: calculada na importação (mesma transação) e pelo job de
 * reclassificação das competências abertas. Laudo de competência fechada ou travada não muda.
 */
export const classificacoesLaudo = pgTable(
  'classificacoes_laudo',
  {
    laudoId: uuid('laudo_id')
      .primaryKey()
      .references(() => laudos.id, { onDelete: 'cascade' }),
    regraId: uuid('regra_id')
      .notNull()
      .references(() => regrasTipificacao.id),
    /** Nulo: nenhuma linha casou e não há "todos os demais". */
    subregraId: uuid('subregra_id').references(() => subregrasTipificacao.id),
    fatura: boolean('fatura').notNull(),
    calculadoEm: quando('calculado_em').notNull(),
  },
  (t) => [
    index('classificacoes_laudo_regra_idx').on(t.regraId),
    index('classificacoes_laudo_subregra_idx').on(t.subregraId),
  ],
);

/**
 * Dimensão em que se soma o volume do mês que escolhe a faixa de preço: só a modalidade, modalidade
 * e especialidade, modalidade, especialidade e categoria, ou tudo do cliente. Sem efeito na linha
 * sem faixa.
 */
export const condVolume = pgEnum('cond_volume', ['MOD', 'MOD_ESP', 'MOD_ESP_CAT', 'TOTAL']);

/**
 * Colunas de uma versão de preço: o arranjo (modalidade, especialidade, categoria, prioridade), a
 * faixa opcional de volume, o valor e a vigência por competência. Nada se sobrescreve: mudar o
 * preço encerra a versão (`vigencia_ate`) e cria outra; só a versão que nunca valeu (começa numa
 * competência futura) pode ser apagada.
 */
const colunasPreco = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
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
  /** Faixa de volume do mês; vazia = vale para qualquer volume. */
  faixaInicio: integer('faixa_inicio'),
  faixaFim: integer('faixa_fim'),
  condVolume: condVolume('cond_volume').notNull().default('MOD_ESP_CAT'),
  valor: numeric('valor', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  /** "YYYY-MM"; vazio = desde sempre (carga do dashboards-one). */
  vigenciaDesde: text('vigencia_desde'),
  /** "YYYY-MM", inclusiva; vazio = sem fim. */
  vigenciaAte: text('vigencia_ate'),
  criadoEm: quando('criado_em').notNull().defaultNow(),
  /** Nulo na carga do dashboards-one. */
  criadoPorId: quem('criado_por_id'),
});

type ColunasPreco = ReturnType<typeof colunasPreco>;
const checksPreco = (tabela: string, t: { [K in keyof ColunasPreco]: AnyPgColumn }) => [
  check(`${tabela}_valor_check`, sql`${t.valor} > 0`),
  check(
    `${tabela}_faixa_check`,
    sql`(${t.faixaInicio} is null or ${t.faixaInicio} >= 0) and (${t.faixaFim} is null or ${t.faixaFim} >= coalesce(${t.faixaInicio}, 0))`,
  ),
  check(
    `${tabela}_vigencia_check`,
    sql`(${t.vigenciaDesde} is null or ${t.vigenciaDesde} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and (${t.vigenciaAte} is null or ${t.vigenciaAte} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      and (${t.vigenciaDesde} is null or ${t.vigenciaAte} is null or ${t.vigenciaAte} >= ${t.vigenciaDesde})`,
  ),
];

/** Preços do cliente ou da unidade, por arranjo. A unidade sem o preço usa o do principal. */
export const precosCliente = pgTable(
  'precos_cliente',
  {
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id),
    ...colunasPreco(),
  },
  (t) => [
    index('precos_cliente_arranjo_idx').on(
      t.clienteId,
      t.modalidadeId,
      t.especialidadeId,
      t.categoriaId,
      t.prioridadeId,
    ),
    ...checksPreco('precos_cliente', t),
  ],
);

/** Tabela padrão do contratado: o preço do arranjo que o cliente não tem. */
export const precosPadraoContratado = pgTable(
  'precos_padrao_contratado',
  {
    contratadoId: uuid('contratado_id')
      .notNull()
      .references(() => contratados.id),
    ...colunasPreco(),
  },
  (t) => [
    index('precos_padrao_contratado_arranjo_idx').on(
      t.contratadoId,
      t.modalidadeId,
      t.especialidadeId,
      t.categoriaId,
      t.prioridadeId,
    ),
    ...checksPreco('precos_padrao_contratado', t),
  ],
);
