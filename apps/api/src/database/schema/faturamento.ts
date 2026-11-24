import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { clientes, especialidades, modalidades, prioridades } from './catalogo';
import { usuarios } from './identidade';
import { laudos } from './ingestao';
import { equipes, medicos } from './medicos';

// Contexto `faturamento`: as competências (meses de faturamento) com fechamento e trava da
// importação, os cortes que decidem a competência de cada laudo (padrão e por cliente), os dados
// fiscais do cliente e a tipificação (CO/NC/NC1 e sub-regras) que decide se o laudo fatura.

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
    /** A competência nunca fica antes do mês da data do exame. */
    consideraExame: boolean('considera_exame'),
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
 * Dados de faturamento do cliente (1:1 com `clientes`): para onde vai a NF, endereço e contato do
 * cadastro no Omie, banco e o código do cliente no Omie. Nada é obrigatório no banco (o
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
    /** Preenchido pela sincronização com o Omie; não é único (unidades do mesmo CNPJ repetem). */
    omieCodigoCliente: text('omie_codigo_cliente'),
    omieSincronizadoEm: quando('omie_sincronizado_em'),
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
 * principal do cliente, sem sub-regra, e fatura conforme `fatura_sem_subregra`. A regra `padrao` é
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
    faturaSemSubregra: boolean('fatura_sem_subregra').notNull(),
    padrao: boolean('padrao').notNull().default(false),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    atualizadoEm: quando('atualizado_em')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('regras_tipificacao_padrao_key').on(t.padrao).where(sql`${t.padrao}`)],
);

/** Sub-regra (CO-FT, NC-NF...): o resultado de uma linha da configuração do cliente. */
export const subregrasTipificacao = pgTable(
  'subregras_tipificacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    regraId: uuid('regra_id')
      .notNull()
      .references(() => regrasTipificacao.id),
    nome: text('nome').notNull().unique(),
    descricao: text('descricao'),
    /** O laudo nesta sub-regra fatura. */
    fatura: boolean('fatura').notNull().default(true),
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

/**
 * Configuração da tipificação do cliente ou da unidade. A unidade sem linha aqui segue a do
 * principal; sem nenhuma, vale a regra padrão. Regra principal vazia na unidade = a do principal.
 */
export const clientesTipificacao = pgTable(
  'clientes_tipificacao',
  {
    clienteId: uuid('cliente_id')
      .primaryKey()
      .references(() => clientes.id, { onDelete: 'cascade' }),
    /** Regra do laudo que nenhuma linha casou; vazio = a do principal ou a padrão. */
    regraId: uuid('regra_id').references(() => regrasTipificacao.id),
    /** "Todos os demais": sub-regra do laudo que nenhuma linha casou; vazio = só a regra. */
    subregraDemaisId: uuid('subregra_demais_id').references(() => subregrasTipificacao.id),
    atualizadoEm: quando('atualizado_em')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /** Nulo na carga do dashboards-one. */
    atualizadoPorId: quem('atualizado_por_id'),
  },
  (t) => [
    index('clientes_tipificacao_regra_idx').on(t.regraId),
    index('clientes_tipificacao_subregra_demais_idx').on(t.subregraDemaisId),
  ],
);

/**
 * Linha da configuração: "se a modalidade/especialidade/prioridade for uma destas e o médico for
 * (todos | apenas | exceto) estes → sub-regra". Vale a primeira linha que casar, pela `ordem`.
 */
export const clientesTipificacaoLinhas = pgTable(
  'clientes_tipificacao_linhas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientesTipificacao.clienteId, { onDelete: 'cascade' }),
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
    unique('clientes_tipificacao_linhas_ordem_key').on(t.clienteId, t.ordem),
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
