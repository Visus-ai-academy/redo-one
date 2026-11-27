import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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
