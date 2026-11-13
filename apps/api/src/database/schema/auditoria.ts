import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Eventos de auditoria das entidades críticas (usuários, papéis, chaves, competência, preços,
 * crédito, escala...). Só inserção: nunca se atualiza nem apaga um evento.
 */
export const eventosAuditoria = pgTable(
  'eventos_auditoria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ocorridoEm: timestamp('ocorrido_em', { withTimezone: true }).notNull(),
    /** `usuario`, `robo` ou `sistema`. */
    atorTipo: text('ator_tipo').notNull(),
    /** Id do usuário ou da chave do robô; nulo para o sistema. */
    atorId: uuid('ator_id'),
    entidade: text('entidade').notNull(),
    entidadeId: text('entidade_id').notNull(),
    acao: text('acao').notNull(),
    antes: jsonb('antes'),
    depois: jsonb('depois'),
  },
  (t) => [
    index('eventos_auditoria_entidade_idx').on(t.entidade, t.entidadeId, t.ocorridoEm),
    index('eventos_auditoria_ator_idx').on(t.atorId, t.ocorridoEm),
  ],
);
