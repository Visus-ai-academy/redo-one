import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { usuarios } from './identidade';

/**
 * Arquivo guardado no storage S3 (privado). O conteúdo nunca fica no banco nem no disco da API:
 * aqui ficam a chave do objeto e os metadados. O dono é o contexto que o criou (`contexto`).
 */
export const arquivos = pgTable(
  'arquivos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Chave do objeto no bucket. */
    chave: text('chave').notNull().unique(),
    nomeOriginal: text('nome_original').notNull(),
    tipoConteudo: text('tipo_conteudo').notNull(),
    tamanhoBytes: bigint('tamanho_bytes', { mode: 'number' }),
    /** Contexto dono (`ingestao`, `contratos`...). */
    contexto: text('contexto').notNull(),
    criadoPorId: uuid('criado_por_id').references(() => usuarios.id),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    /** Preenchido quando o envio para o storage foi confirmado. */
    enviadoEm: timestamp('enviado_em', { withTimezone: true }),
  },
  (t) => [index('arquivos_contexto_criado_idx').on(t.contexto, t.criadoEm)],
);
