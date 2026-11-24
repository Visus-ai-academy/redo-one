import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Contexto `medicos`: cadastro do médico, níveis, dados de pagamento (à parte, com permissão
// própria), apelidos usados na importação e equipes. Arranjos e parâmetros do robô são da
// `distribuicao`; regras de repasse, do `repasse`.

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

/** Nível do médico (Nível 0–6, 1.1…): chave da tabela de referência do repasse. */
export const niveisMedico = pgTable('niveis_medico', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull().unique(),
  ...colunasDeLista(),
});

export const funcaoMedico = pgEnum('funcao_medico', [
  /** Médico do corpo clínico. */
  'STAFF',
  /** Em formação (fellowship em andamento). */
  'FELLOW',
]);

export const medicos = pgTable(
  'medicos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nome de exibição (canônico). */
    nome: text('nome').notNull(), // LGPD: pessoal
    /** Nome sem acento, prefixo "Dr."/"Dra." nem sinais: o que a importação compara. */
    chaveNormalizada: text('chave_normalizada').notNull().unique(),
    crm: text('crm'), // LGPD: pessoal
    /** Id da conta na MobileMed: o robô escolhe a conta por ele, não pelo nome. */
    idMobilemed: integer('id_mobilemed').unique(),
    email: text('email'), // LGPD: pessoal
    telefone: text('telefone'), // LGPD: pessoal
    ativo: boolean('ativo').notNull().default(true),
    /** Fora dos painéis (volumetria, executivo). */
    ocultoDashboards: boolean('oculto_dashboards').notNull().default(false),
    /** Senioridade: independe da função (um staff pode ou não ser sênior). */
    senior: boolean('senior').notNull().default(false),
    /** Fez fellowship (formação concluída); entra na classificação da qualidade. */
    fellowship: boolean('fellowship').notNull().default(false),
    funcao: funcaoMedico('funcao'),
    nivelId: uuid('nivel_id').references(() => niveisMedico.id),
    /** Início da prestação de serviço. */
    dataInicioVinculo: date('data_inicio_vinculo'),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('medicos_ativo_idx').on(t.ativo),
    index('medicos_oculto_dashboards_idx').on(t.ocultoDashboards),
    index('medicos_nivel_idx').on(t.nivelId),
  ],
);

export const tipoChavePix = pgEnum('tipo_chave_pix', [
  'CPF',
  'CNPJ',
  'EMAIL',
  'TELEFONE',
  'ALEATORIA',
]);

/** Dados de pagamento do médico (LGPD: pessoal). Leitura e edição com permissão própria e auditoria. */
export const medicosDadosPagamento = pgTable('medicos_dados_pagamento', {
  medicoId: uuid('medico_id')
    .primaryKey()
    .references(() => medicos.id, { onDelete: 'cascade' }),
  /** Só dígitos; pessoa física. */
  cpf: text('cpf'), // LGPD: pessoal
  /** Só dígitos; pessoa jurídica. */
  cnpj: text('cnpj'),
  /** Empresa que recebe o repasse (PJ). */
  razaoSocial: text('razao_social'),
  tipoChavePix: tipoChavePix('tipo_chave_pix'),
  chavePix: text('chave_pix'), // LGPD: pessoal
  /** Decide a categoria financeira do contas a pagar no Omie; nulo = não informado. */
  socio: boolean('socio'),
  optanteSimples: boolean('optante_simples'),
  omieCodigoFornecedor: text('omie_codigo_fornecedor'),
  atualizadoEm: atualizadoEm(),
});

export const origemAliasMedico = pgEnum('origem_alias_medico', [
  'manual',
  'volumetria',
  'repasse',
  'repasse_upload',
]);

/** Outra grafia do médico na origem; resolve `laudos.medico_id` na importação. */
export const medicosAliases = pgTable(
  'medicos_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id, { onDelete: 'cascade' }),
    /** Grafia bruta, como veio da origem. */
    nomeOrigem: text('nome_origem').notNull(),
    /** Única: uma grafia aponta para um médico só. */
    chaveNormalizada: text('chave_normalizada').notNull().unique(),
    origem: origemAliasMedico('origem').notNull().default('manual'),
    verificadoManualmente: boolean('verificado_manualmente').notNull().default(false),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
  },
  (t) => [index('medicos_aliases_medico_idx').on(t.medicoId)],
);

/**
 * Outras contas do médico na MobileMed, além da principal (`medicos.id_mobilemed`, a que recebe os
 * exames): o médico entra por uma delas conforme o login do dia. A importação e a carga do robô
 * reconhecem o médico por qualquer uma; a atribuição vai sempre para a principal. O id é único
 * aqui e não pode ser a principal de ninguém (conferido pelo service).
 */
export const medicosContasMobilemed = pgTable(
  'medicos_contas_mobilemed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id, { onDelete: 'cascade' }),
    idMobilemed: integer('id_mobilemed').notNull().unique(),
    observacao: text('observacao'),
    criadoEm: criadoEm(),
  },
  (t) => [index('medicos_contas_mobilemed_medico_idx').on(t.medicoId)],
);

export const equipes = pgTable('equipes', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull().unique(),
  /** Plantão: o recorte do arranjo da equipe é laudado à mão; o robô não o entrega. */
  plantao: boolean('plantao').notNull().default(false),
  ...colunasDeLista(),
});

export const equipesMembros = pgTable(
  'equipes_membros',
  {
    equipeId: uuid('equipe_id')
      .notNull()
      .references(() => equipes.id, { onDelete: 'cascade' }),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.equipeId, t.medicoId] }),
    index('equipes_membros_medico_idx').on(t.medicoId),
  ],
);
