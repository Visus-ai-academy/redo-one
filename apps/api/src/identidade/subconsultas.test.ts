import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { DrizzleGestaoPapeisRepository } from './papeis/drizzle-gestao-papeis.repository';

// Numa consulta de uma tabela só, o Drizzle escreve as colunas sem o nome da tabela ("id"). Dentro
// de uma subconsulta correlacionada, o Postgres resolve esse "id" na tabela de dentro e a contagem
// sai sempre 0. Este teste não precisa de banco: confere o SQL gerado.
const db = drizzle.mock({ schema }) as unknown as Database;
const sqlDe = (consulta: unknown) => (consulta as { toSQL(): { sql: string } }).toSQL().sql;

describe('subconsultas correlacionadas', () => {
  it('os totais dos papéis comparam com "papeis"."id"', () => {
    const sql = sqlDe(new DrizzleGestaoPapeisRepository(db).listar());
    expect(sql).toContain('"usuarios_papeis"."papel_id" = "papeis"."id"');
    expect(sql).toContain('"papeis_permissoes"."papel_id" = "papeis"."id"');
  });
});
