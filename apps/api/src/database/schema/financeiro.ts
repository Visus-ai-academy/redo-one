import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { contratados } from './catalogo';

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
