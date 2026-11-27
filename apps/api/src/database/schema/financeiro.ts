import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { clientes, contratados, tipoPessoa } from './catalogo';
import { usuarios } from './identidade';
import { medicos, tipoChavePix } from './medicos';

// Contexto `financeiro`: plano de categorias, contas bancárias, fornecedores e, depois, títulos e
// baixas. Valores em centavos (`bigint`), datas de vencimento e pagamento como `date` (dia de
// Brasília), carimbos em UTC.

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const tipoCategoriaFinanceira = pgEnum('tipo_categoria_financeira', ['receita', 'despesa']);

/**
 * Plano de categorias de receita e despesa, o mesmo para todas as empresas. Dois níveis: a
 * categoria com `pai_id` vazio é um grupo (ou uma categoria solta); a filha aponta para o grupo,
 * que é do mesmo tipo e não tem pai.
 */
export const categoriasFinanceiras = pgTable(
  'categorias_financeiras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoCategoriaFinanceira('tipo').notNull(),
    nome: text('nome').notNull(),
    /** Grupo da categoria; vazio = nível de cima. Sem cascata: grupo com filhas não se exclui. */
    paiId: uuid('pai_id').references((): AnyPgColumn => categoriasFinanceiras.id),
    /** Para a exportação à contabilidade (fase seguinte). */
    codigoContabil: text('codigo_contabil'),
    ativa: boolean('ativa').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    // O mesmo nome não se repete no mesmo grupo (nem no nível de cima) do mesmo tipo.
    uniqueIndex('categorias_financeiras_nome_key').on(
      t.tipo,
      sql`coalesce(${t.paiId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.nome})`,
    ),
    index('categorias_financeiras_pai_idx').on(t.paiId),
    index('categorias_financeiras_tipo_ativa_idx').on(t.tipo, t.ativa),
    check('categorias_financeiras_pai_check', sql`${t.paiId} <> ${t.id}`),
  ],
);

export const tipoContaBancaria = pgEnum('tipo_conta_bancaria', ['corrente', 'aplicacao', 'caixa']);
export const integracaoBancaria = pgEnum('integracao_bancaria', ['nenhuma', 'itau']);

/** Conta da empresa (contratado que usa o financeiro do One) onde o dinheiro entra e sai. */
export const contasBancarias = pgTable(
  'contas_bancarias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contratadoId: uuid('contratado_id')
      .notNull()
      .references(() => contratados.id),
    apelido: text('apelido').notNull(),
    tipo: tipoContaBancaria('tipo').notNull(),
    /** Código do banco (3 dígitos, ex.: 341). */
    bancoCodigo: text('banco_codigo'),
    agencia: text('agencia'),
    conta: text('conta'),
    digito: text('digito'),
    /** Pode ser negativo. */
    saldoInicialCentavos: bigint('saldo_inicial_centavos', { mode: 'number' }).notNull(),
    /** A partir desse dia (de Brasília) o One conta o saldo. */
    saldoInicialEm: date('saldo_inicial_em').notNull(),
    integracao: integracaoBancaria('integracao').notNull().default('nenhuma'),
    /** Prefixo das variáveis de ambiente da credencial (ex.: ITAU_TELEIMAGEM); nunca o segredo. */
    credencial: text('credencial'),
    /** No máximo uma por empresa; só ativa. */
    padraoRecebimento: boolean('padrao_recebimento').notNull().default(false),
    ativa: boolean('ativa').notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex('contas_bancarias_apelido_key').on(t.contratadoId, sql`lower(${t.apelido})`),
    uniqueIndex('contas_bancarias_padrao_key')
      .on(t.contratadoId)
      .where(sql`${t.padraoRecebimento}`),
    index('contas_bancarias_ativa_idx').on(t.ativa),
    check(
      'contas_bancarias_credencial_check',
      sql`(${t.integracao} = 'nenhuma') = (${t.credencial} is null)`,
    ),
    check('contas_bancarias_padrao_ativa_check', sql`not ${t.padraoRecebimento} or ${t.ativa}`),
  ],
);

/**
 * Empresa ou pessoa a quem a empresa paga e que não é médico (aluguel, software, contador...).
 * Retenção: enquanto houver título ligado; sem título, o cadastro pode ser excluído.
 */
export const fornecedores = pgTable(
  'fornecedores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipoPessoa: tipoPessoa('tipo_pessoa').notNull(),
    /** Razão social (PJ) ou nome (PF). */
    razaoSocial: text('razao_social').notNull(),
    nomeFantasia: text('nome_fantasia'),
    /** Só dígitos; só na pessoa jurídica. */
    cnpj: text('cnpj'),
    /** Só dígitos; só na pessoa física. */
    cpf: text('cpf'), // LGPD: pessoal
    email: text('email'), // LGPD: pessoal
    /** Só dígitos, com DDD. */
    telefone: text('telefone'), // LGPD: pessoal
    cep: text('cep'),
    logradouro: text('logradouro'),
    numero: text('numero'),
    complemento: text('complemento'),
    bairro: text('bairro'),
    cidade: text('cidade'),
    uf: text('uf'),
    tipoChavePix: tipoChavePix('tipo_chave_pix'),
    chavePix: text('chave_pix'), // LGPD: pessoal
    bancoCodigo: text('banco_codigo'),
    agencia: text('agencia'),
    conta: text('conta'),
    /** Sugerida ao lançar uma despesa do fornecedor. */
    categoriaPadraoId: uuid('categoria_padrao_id').references(() => categoriasFinanceiras.id),
    ativo: boolean('ativo').notNull().default(true),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex('fornecedores_cnpj_key').on(t.cnpj).where(sql`${t.cnpj} is not null`),
    uniqueIndex('fornecedores_cpf_key').on(t.cpf).where(sql`${t.cpf} is not null`),
    index('fornecedores_razao_social_idx').on(sql`lower(${t.razaoSocial})`),
    index('fornecedores_ativo_idx').on(t.ativo),
    index('fornecedores_categoria_padrao_idx').on(t.categoriaPadraoId),
    check(
      'fornecedores_documento_check',
      sql`(${t.tipoPessoa} = 'PJ' and ${t.cnpj} is not null and ${t.cpf} is null) or (${t.tipoPessoa} = 'PF' and ${t.cpf} is not null and ${t.cnpj} is null)`,
    ),
  ],
);

export const tipoTitulo = pgEnum('tipo_titulo', ['receber', 'pagar']);
export const situacaoTitulo = pgEnum('situacao_titulo', [
  'aberto',
  'parcial',
  'liquidado',
  'cancelado',
]);
export const origemTitulo = pgEnum('origem_titulo', [
  'manual',
  'faturamento',
  'pre_pago',
  'repasse',
  'carga_omie',
  'recorrencia',
]);
export const formaBaixa = pgEnum('forma_baixa', [
  'pix',
  'boleto',
  'ted',
  'dinheiro',
  'cartao',
  'outro',
]);
export const origemBaixa = pgEnum('origem_baixa', ['manual', 'banco']);
export const ajusteDiaNaoUtil = pgEnum('ajuste_dia_nao_util', ['antecipa', 'posterga', 'mantem']);

/** Último número de título de cada empresa e tipo (R-0001, P-0001...). */
export const titulosNumeracao = pgTable(
  'titulos_numeracao',
  {
    contratadoId: uuid('contratado_id')
      .notNull()
      .references(() => contratados.id),
    tipo: tipoTitulo('tipo').notNull(),
    ultimo: integer('ultimo').notNull(),
  },
  (t) => [primaryKey({ columns: [t.contratadoId, t.tipo] })],
);

/**
 * Conta a receber (de um cliente) ou a pagar (a um fornecedor ou médico). "Vencido" não é
 * gravado: é aberto ou parcial com vencimento antes de hoje. `pago_centavos` é a soma do principal
 * das baixas não estornadas, mantida na mesma transação da baixa e do estorno.
 */
export const titulos = pgTable(
  'titulos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoTitulo('tipo').notNull(),
    contratadoId: uuid('contratado_id')
      .notNull()
      .references(() => contratados.id),
    /** Sequencial por empresa e tipo. */
    numero: integer('numero').notNull(),
    /** A receber: sempre o cliente principal (os laudos da unidade são do principal). */
    clienteId: uuid('cliente_id').references(() => clientes.id),
    fornecedorId: uuid('fornecedor_id').references(() => fornecedores.id),
    /** Os dados de pagamento ficam no `medicos`, com permissão própria. */
    medicoId: uuid('medico_id').references(() => medicos.id),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categoriasFinanceiras.id),
    descricao: text('descricao').notNull(),
    /** Nº da NF ou do boleto. */
    documento: text('documento'),
    /** AAAA-MM. */
    competencia: text('competencia'),
    emissaoEm: date('emissao_em').notNull(),
    vencimento: date('vencimento').notNull(),
    /** O primeiro vencimento, guardado quando o vencimento é prorrogado. */
    vencimentoOriginal: date('vencimento_original'),
    valorCentavos: bigint('valor_centavos', { mode: 'number' }).notNull(),
    pagoCentavos: bigint('pago_centavos', { mode: 'number' }).notNull().default(0),
    contaPrevistaId: uuid('conta_prevista_id').references(() => contasBancarias.id),
    situacao: situacaoTitulo('situacao').notNull().default('aberto'),
    origem: origemTitulo('origem').notNull().default('manual'),
    /** O demonstrativo, a recarga ou o demonstrativo de repasse de origem. */
    origemId: uuid('origem_id'),
    origemVersao: integer('origem_versao'),
    observacoes: text('observacoes'),
    /** A recorrência que gerou o título e a ocorrência (1ª, 2ª...) dela. */
    recorrenciaId: uuid('recorrencia_id').references((): AnyPgColumn => recorrencias.id),
    ocorrencia: integer('ocorrencia'),
    /** Mudado à mão depois de gerado: a edição da recorrência não mexe mais nele. */
    editadoAMao: boolean('editado_a_mao').notNull().default(false),
    canceladoEm: timestamp('cancelado_em', { withTimezone: true }),
    canceladoPorId: uuid('cancelado_por_id').references(() => usuarios.id),
    motivoCancelamento: text('motivo_cancelamento'),
    /** Vazio quando o sistema gerou (job). */
    criadoPorId: uuid('criado_por_id').references(() => usuarios.id),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex('titulos_numero_key').on(t.contratadoId, t.tipo, t.numero),
    // A mesma origem (ex.: o demonstrativo) não gera dois títulos: deixa o job idempotente.
    uniqueIndex('titulos_origem_key')
      .on(t.origem, t.origemId)
      .where(sql`${t.origemId} is not null`),
    index('titulos_lista_idx').on(t.contratadoId, t.tipo, t.situacao, t.vencimento),
    index('titulos_tipo_situacao_vencimento_idx').on(t.tipo, t.situacao, t.vencimento),
    index('titulos_cliente_idx').on(t.clienteId, t.situacao),
    index('titulos_fornecedor_idx').on(t.fornecedorId),
    index('titulos_medico_idx').on(t.medicoId),
    index('titulos_categoria_idx').on(t.categoriaId),
    // Cada ocorrência da recorrência gera um título só: deixa o job idempotente.
    uniqueIndex('titulos_recorrencia_ocorrencia_key')
      .on(t.recorrenciaId, t.ocorrencia)
      .where(sql`${t.recorrenciaId} is not null`),
    check(
      'titulos_recorrencia_check',
      sql`(${t.recorrenciaId} is null) = (${t.ocorrencia} is null)`,
    ),
    check(
      'titulos_favorecido_check',
      sql`(${t.tipo} = 'receber' and ${t.clienteId} is not null and ${t.fornecedorId} is null and ${t.medicoId} is null) or (${t.tipo} = 'pagar' and ${t.clienteId} is null and num_nonnulls(${t.fornecedorId}, ${t.medicoId}) = 1)`,
    ),
    check('titulos_valor_check', sql`${t.valorCentavos} > 0`),
    check(
      'titulos_pago_check',
      sql`${t.pagoCentavos} >= 0 and ${t.pagoCentavos} <= ${t.valorCentavos}`,
    ),
    check('titulos_competencia_check', sql`${t.competencia} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

/**
 * Pagamento ou recebimento de um título, numa conta e numa data. O estorno não apaga: marca a
 * baixa, com quem, quando e o motivo, e o título volta a ter saldo.
 */
export const baixas = pgTable(
  'baixas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tituloId: uuid('titulo_id')
      .notNull()
      .references(() => titulos.id),
    pagoEm: date('pago_em').notNull(),
    contaBancariaId: uuid('conta_bancaria_id')
      .notNull()
      .references(() => contasBancarias.id),
    /** Quanto abate do saldo. */
    principalCentavos: bigint('principal_centavos', { mode: 'number' }).notNull(),
    jurosCentavos: bigint('juros_centavos', { mode: 'number' }).notNull().default(0),
    multaCentavos: bigint('multa_centavos', { mode: 'number' }).notNull().default(0),
    descontoCentavos: bigint('desconto_centavos', { mode: 'number' }).notNull().default(0),
    /** Principal + juros + multa − desconto: o que entrou ou saiu do banco. */
    valorMovimentadoCentavos: bigint('valor_movimentado_centavos', { mode: 'number' }).notNull(),
    forma: formaBaixa('forma').notNull(),
    observacao: text('observacao'),
    origem: origemBaixa('origem').notNull().default('manual'),
    estornadaEm: timestamp('estornada_em', { withTimezone: true }),
    estornadaPorId: uuid('estornada_por_id').references(() => usuarios.id),
    motivoEstorno: text('motivo_estorno'),
    criadoPorId: uuid('criado_por_id').references(() => usuarios.id),
    criadoEm: criadoEm(),
  },
  (t) => [
    index('baixas_titulo_idx').on(t.tituloId),
    index('baixas_conta_idx').on(t.contaBancariaId, t.pagoEm),
    check('baixas_principal_check', sql`${t.principalCentavos} > 0`),
    check(
      'baixas_acrescimos_check',
      sql`${t.jurosCentavos} >= 0 and ${t.multaCentavos} >= 0 and ${t.descontoCentavos} >= 0`,
    ),
    check(
      'baixas_movimentado_check',
      sql`${t.valorMovimentadoCentavos} = ${t.principalCentavos} + ${t.jurosCentavos} + ${t.multaCentavos} - ${t.descontoCentavos} and ${t.valorMovimentadoCentavos} >= 0`,
    ),
  ],
);

/**
 * Regras financeiras de cada empresa que não dependem de vigência (por enquanto, as faixas da
 * inadimplência). Sem linha, a empresa usa o padrão (`CONFIGURACAO_PADRAO` do domínio).
 */
export const configuracoesFinanceiras = pgTable('configuracoes_financeiras', {
  contratadoId: uuid('contratado_id')
    .primaryKey()
    .references(() => contratados.id),
  /** Começo (em dias de atraso) de cada faixa, em ordem, a primeira no dia 1. */
  faixasInadimplencia: integer('faixas_inadimplencia').array().notNull(),
  /** Quantos meses à frente as recorrências geram os títulos. */
  horizonteRecorrenciaMeses: integer('horizonte_recorrencia_meses').notNull().default(3),
  /** Vencimento em fim de semana ou feriado, nas recorrências que não escolhem o seu. */
  ajusteDiaNaoUtil: ajusteDiaNaoUtil('ajuste_dia_nao_util').notNull().default('posterga'),
  atualizadoPorId: uuid('atualizado_por_id').references(() => usuarios.id),
  atualizadoEm: atualizadoEm(),
});

export const frequenciaRecorrencia = pgEnum('frequencia_recorrencia', [
  'semanal',
  'mensal',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
]);
export const terminoRecorrencia = pgEnum('termino_recorrencia', ['sem', 'data', 'ocorrencias']);
export const modoValorRecorrencia = pgEnum('modo_valor_recorrencia', ['fixo', 'previsto']);
export const situacaoRecorrencia = pgEnum('situacao_recorrencia', [
  'ativa',
  'pausada',
  'encerrada',
]);

/**
 * Conta recorrente (aluguel, contador, mensalidade de cliente): gera títulos independentes de
 * tempos em tempos, até o horizonte das regras financeiras. Cada título guarda a ocorrência.
 */
export const recorrencias = pgTable(
  'recorrencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoTitulo('tipo').notNull(),
    contratadoId: uuid('contratado_id')
      .notNull()
      .references(() => contratados.id),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    fornecedorId: uuid('fornecedor_id').references(() => fornecedores.id),
    medicoId: uuid('medico_id').references(() => medicos.id),
    categoriaId: uuid('categoria_id')
      .notNull()
      .references(() => categoriasFinanceiras.id),
    descricao: text('descricao').notNull(),
    valorCentavos: bigint('valor_centavos', { mode: 'number' }).notNull(),
    modoValor: modoValorRecorrencia('modo_valor').notNull().default('fixo'),
    frequencia: frequenciaRecorrencia('frequencia').notNull(),
    /** Dia do mês (1 a 31); vazio na semanal. */
    diaVencimento: integer('dia_vencimento'),
    primeiroVencimento: date('primeiro_vencimento').notNull(),
    /** Vazio = o padrão da empresa nas regras financeiras. */
    ajusteDiaNaoUtil: ajusteDiaNaoUtil('ajuste_dia_nao_util'),
    termino: terminoRecorrencia('termino').notNull().default('sem'),
    terminoEm: date('termino_em'),
    terminoOcorrencias: integer('termino_ocorrencias'),
    contaPrevistaId: uuid('conta_prevista_id').references(() => contasBancarias.id),
    observacoes: text('observacoes'),
    situacao: situacaoRecorrencia('situacao').notNull().default('ativa'),
    /** Gera só as ocorrências a partir deste dia (o primeiro vencimento; ao retomar, a retomada). */
    geraAPartirDe: date('gera_a_partir_de').notNull(),
    encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
    encerradaPorId: uuid('encerrada_por_id').references(() => usuarios.id),
    motivoEncerramento: text('motivo_encerramento'),
    criadoPorId: uuid('criado_por_id').references(() => usuarios.id),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('recorrencias_lista_idx').on(t.contratadoId, t.tipo, t.situacao),
    index('recorrencias_tipo_situacao_idx').on(t.tipo, t.situacao),
    index('recorrencias_cliente_idx').on(t.clienteId),
    index('recorrencias_fornecedor_idx').on(t.fornecedorId),
    index('recorrencias_medico_idx').on(t.medicoId),
    check(
      'recorrencias_favorecido_check',
      sql`(${t.tipo} = 'receber' and ${t.clienteId} is not null and ${t.fornecedorId} is null and ${t.medicoId} is null) or (${t.tipo} = 'pagar' and ${t.clienteId} is null and num_nonnulls(${t.fornecedorId}, ${t.medicoId}) = 1)`,
    ),
    check('recorrencias_valor_check', sql`${t.valorCentavos} > 0`),
    check(
      'recorrencias_dia_check',
      sql`(${t.frequencia} = 'semanal') = (${t.diaVencimento} is null) and coalesce(${t.diaVencimento} between 1 and 31, true)`,
    ),
    check(
      'recorrencias_termino_check',
      sql`(${t.termino} = 'data') = (${t.terminoEm} is not null) and (${t.termino} = 'ocorrencias') = (${t.terminoOcorrencias} is not null)`,
    ),
  ],
);
