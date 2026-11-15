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
  uuid,
} from 'drizzle-orm/pg-core';

// Contexto `catalogo`: listas do domínio (modalidades, especialidades...), exames, de-paras usados
// na importação, contratados (emissoras) e o cadastro básico de clientes com seus apelidos.

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Colunas comuns às listas: rótulo para a tela, cor do selo, ordem de exibição e ativo. */
const colunasDeLista = () => ({
  descricao: text('descricao'),
  /** Hex `#RRGGBB` do selo. */
  cor: text('cor'),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const modalidades = pgTable(
  'modalidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Código como vem da MobileMed: `MR`, `CT`, `RX`. */
    codigo: text('codigo').notNull().unique(),
    ...colunasDeLista(),
  },
  (t) => [index('modalidades_ativo_ordem_idx').on(t.ativo, t.ordem)],
);

export const especialidades = pgTable(
  'especialidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull().unique(),
    ...colunasDeLista(),
  },
  (t) => [index('especialidades_ativo_ordem_idx').on(t.ativo, t.ordem)],
);

/** Recorte abaixo da especialidade (NEURO › AVC). Pode pertencer a várias (COLUNAS: NEURO e MSK). */
export const subespecialidades = pgTable(
  'subespecialidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull().unique(),
    ...colunasDeLista(),
  },
  (t) => [index('subespecialidades_ativo_ordem_idx').on(t.ativo, t.ordem)],
);

export const subespecialidadesEspecialidades = pgTable(
  'subespecialidades_especialidades',
  {
    subespecialidadeId: uuid('subespecialidade_id')
      .notNull()
      .references(() => subespecialidades.id, { onDelete: 'cascade' }),
    especialidadeId: uuid('especialidade_id')
      .notNull()
      .references(() => especialidades.id),
  },
  (t) => [
    primaryKey({ columns: [t.subespecialidadeId, t.especialidadeId] }),
    index('subespecialidades_especialidades_especialidade_idx').on(t.especialidadeId),
  ],
);

export const categoriasExame = pgTable(
  'categorias_exame',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull().unique(),
    ...colunasDeLista(),
  },
  (t) => [index('categorias_exame_ativo_ordem_idx').on(t.ativo, t.ordem)],
);

export const prioridades = pgTable(
  'prioridades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull().unique(),
    /** Prioridade urgente para a distribuição (no legado, lista na configuração do robô). */
    urgente: boolean('urgente').notNull().default(false),
    ...colunasDeLista(),
  },
  (t) => [index('prioridades_ativo_ordem_idx').on(t.ativo, t.ordem)],
);

/** Valor bruto de prioridade que chega na importação → prioridade do catálogo. */
export const prioridadesDePara = pgTable(
  'prioridades_de_para',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    origem: text('origem').notNull().unique(),
    prioridadeId: uuid('prioridade_id')
      .notNull()
      .references(() => prioridades.id),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index('prioridades_de_para_prioridade_idx').on(t.prioridadeId)],
);

/**
 * Código de modalidade que chega na importação → modalidade do catálogo (`OT` e `BMD` → `DO`,
 * `CR`/`DX` → `RX`). Quando o exame do laudo está no cadastro, vale a modalidade dele (é assim que
 * a mamografia em CR/DX vira `MG`).
 */
export const modalidadesDePara = pgTable(
  'modalidades_de_para',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Em maiúsculas. */
    origem: text('origem').notNull().unique(),
    modalidadeId: uuid('modalidade_id')
      .notNull()
      .references(() => modalidades.id),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index('modalidades_de_para_modalidade_idx').on(t.modalidadeId)],
);

export const tipoDeParaEspecialidade = pgEnum('tipo_de_para_especialidade', [
  /** Grafia de especialidade → especialidade do catálogo (`MAMO` → `MAMA`). */
  'normalizacao',
  /** Valor que chega no campo especialidade mas não é especialidade (`RX`, `CT`). */
  'invalida',
  /** Região anatômica → especialidade de preço (`JOELHO` → `MUSCULO ESQUELETICO`). */
  'regiao_anatomica',
]);

export const especialidadesDePara = pgTable(
  'especialidades_de_para',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoDeParaEspecialidade('tipo').notNull(),
    /** Em maiúsculas; em `regiao_anatomica`, também sem acento (é como a importação compara). */
    origem: text('origem').notNull(),
    /** Vazio só em `invalida`. */
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    ativo: boolean('ativo').notNull().default(true),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique('especialidades_de_para_tipo_origem_key').on(t.tipo, t.origem),
    index('especialidades_de_para_especialidade_idx').on(t.especialidadeId),
    check(
      'especialidades_de_para_destino_check',
      sql`(${t.tipo} = 'invalida') = (${t.especialidadeId} is null)`,
    ),
  ],
);

export const exames = pgTable(
  'exames',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Não é único: há homônimos raros (ex.: ESCANOMETRIA em duas modalidades). */
    nome: text('nome').notNull(),
    /** Nome sem acento, minúsculo, só letras, dígitos e espaço: chave de busca na importação. */
    chaveNormalizada: text('chave_normalizada').notNull(),
    codigo: text('codigo'),
    descricao: text('descricao'),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    /** Vazio: o exame não tem recorte e não vai para médico restrito a uma subespecialidade. */
    subespecialidadeId: uuid('subespecialidade_id').references(() => subespecialidades.id),
    categoriaId: uuid('categoria_id').references(() => categoriasExame.id),
    prioridadeId: uuid('prioridade_id').references(() => prioridades.id),
    permiteQuebra: boolean('permite_quebra').notNull().default(false),
    /** Exame que a operação analisa um a um: o robô separa para revisão em vez de distribuir. */
    exigeRevisaoManual: boolean('exige_revisao_manual').notNull().default(false),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('exames_chave_normalizada_idx').on(t.chaveNormalizada),
    index('exames_nome_idx').on(t.nome),
    index('exames_modalidade_idx').on(t.modalidadeId),
    index('exames_especialidade_idx').on(t.especialidadeId),
  ],
);

/**
 * Estudo que, laudado, se divide em vários exames na cobrança (ex.: "TC TORAX E ABDOME" → TC
 * TORAX + TC ABDOME, cada um valendo 1). Fica ligado ao nome do estudo como chega da MobileMed,
 * que em geral nem é um exame do cadastro (é o combinado que se quebra), como no dashboards-one.
 */
export const quebrasEstudo = pgTable('quebras_estudo', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Como o estudo chega no laudo. */
  estudoOrigem: text('estudo_origem').notNull(),
  /** `normalizarNome` do estudo: é o que a importação compara. */
  chaveNormalizada: text('chave_normalizada').notNull().unique(),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

/** Cada exame em que o estudo se quebra; cada um vira uma linha de valor 1. */
export const quebrasEstudoPecas = pgTable(
  'quebras_estudo_pecas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quebraId: uuid('quebra_id')
      .notNull()
      .references(() => quebrasEstudo.id, { onDelete: 'cascade' }),
    exameId: uuid('exame_id')
      .notNull()
      .references(() => exames.id),
    /** Usada só quando o exame não tem categoria (como a `categoriaQuebrada` do dashboards-one). */
    categoriaId: uuid('categoria_id').references(() => categoriasExame.id),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique('quebras_estudo_pecas_quebra_exame_key').on(t.quebraId, t.exameId),
    index('quebras_estudo_pecas_exame_idx').on(t.exameId),
  ],
);

/** Quantas unidades vale o laudo cujo estudo chega com VALORES zerado (sem de-para, vale 1). */
export const examesDeParaValores = pgTable(
  'exames_de_para_valores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    estudoDescricao: text('estudo_descricao').notNull(),
    chaveNormalizada: text('chave_normalizada').notNull().unique(),
    valores: numeric('valores', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    exameId: uuid('exame_id').references(() => exames.id, { onDelete: 'set null' }),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index('exames_de_para_valores_exame_idx').on(t.exameId)],
);

/** Empresa própria que emite a nota (001 Teleimagem, 002 Radiologia Nacional). */
export const contratados = pgTable('contratados', {
  id: uuid('id').primaryKey().defaultRandom(),
  razaoSocial: text('razao_social').notNull().unique(),
  /** Só dígitos. */
  cnpj: text('cnpj').unique(),
  endereco: text('endereco'),
  cidade: text('cidade'),
  uf: text('uf'),
  cep: text('cep'),
  /** Contratado que paga o repasse dos laudos emitidos por este; vazio = o próprio. */
  contratadoRepasseId: uuid('contratado_repasse_id').references((): AnyPgColumn => contratados.id),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const tipoPessoa = pgEnum('tipo_pessoa', ['PJ', 'PF']);

export const clientes = pgTable(
  'clientes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nome canônico, igual ao da MobileMed. */
    nome: text('nome').notNull().unique(),
    chaveNormalizada: text('chave_normalizada').notNull(),
    nomeFantasia: text('nome_fantasia'),
    razaoSocial: text('razao_social'),
    tipoPessoa: tipoPessoa('tipo_pessoa'),
    /** Só dígitos. */
    cnpj: text('cnpj'),
    /** Só dígitos; cliente pessoa física. */
    cpf: text('cpf'), // LGPD: pessoal
    contratadoId: uuid('contratado_id').references(() => contratados.id),
    /**
     * Cliente principal, quando este é unidade de outro (ex.: as "PRN TELE_…" no PRN): os laudos
     * da unidade são do principal. Um nível só; vazio = cliente independente.
     */
    unificadoEmId: uuid('unificado_em_id').references((): AnyPgColumn => clientes.id),
    ativo: boolean('ativo').notNull().default(true),
    /** Fora dos painéis (volumetria, executivo); continua no faturamento. */
    ocultoDashboards: boolean('oculto_dashboards').notNull().default(false),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('clientes_chave_normalizada_idx').on(t.chaveNormalizada),
    index('clientes_ativo_idx').on(t.ativo),
    index('clientes_oculto_dashboards_idx').on(t.ocultoDashboards),
    index('clientes_contratado_idx').on(t.contratadoId),
    index('clientes_unificado_em_idx').on(t.unificadoEmId),
    check('clientes_unificado_em_check', sql`${t.unificadoEmId} <> ${t.id}`),
  ],
);

export const tipoAliasCliente = pgEnum('tipo_alias_cliente', [
  /** Nome inteiro igual ao padrão (sem diferenciar maiúsculas). */
  'exato',
  /** Nome começa pelo padrão; o mais longo vence. */
  'prefixo',
  /** Grafia normalizada (sem acento e separadores) igual à do padrão. */
  'normalizado',
]);

/** Outra grafia do cliente na origem. A ordem de avaliação fica no resolvedor da ingestão. */
export const clientesAliases = pgTable(
  'clientes_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id, { onDelete: 'cascade' }),
    tipo: tipoAliasCliente('tipo').notNull(),
    padrao: text('padrao').notNull(),
    /** Padrão em maiúsculas (exato, prefixo) ou normalizado: é o que a importação compara. */
    chave: text('chave').notNull(),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
  },
  (t) => [
    unique('clientes_aliases_tipo_chave_key').on(t.tipo, t.chave),
    index('clientes_aliases_cliente_idx').on(t.clienteId),
  ],
);

/** Sufixo cortado do nome do cliente antes de resolver (`-CT`, `_PLANTÃO`); os cortes acumulam. */
export const sufixosNomeCliente = pgTable('sufixos_nome_cliente', {
  id: uuid('id').primaryKey().defaultRandom(),
  sufixo: text('sufixo').notNull().unique(),
  ativo: boolean('ativo').notNull().default(true),
  observacoes: text('observacoes'),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});
