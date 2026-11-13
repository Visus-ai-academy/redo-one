import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { DrizzleAuditoria } from './drizzle-auditoria';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleAuditoria', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    await db.execute(sql`truncate table eventos_auditoria`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava o evento com ator, entidade, ação e os valores antes e depois', async () => {
    const em = new Date('2026-11-13T12:00:00Z');
    const atorId = '6d1f8a52-0f7c-4a3e-9d55-1f2b3c4d5e6f';

    await new DrizzleAuditoria(db).registrar({
      ator: { tipo: 'usuario', id: atorId },
      entidade: 'usuario',
      entidadeId: 'u-1',
      acao: 'papel_trocado',
      antes: { papelId: 'p-1' },
      depois: { papelId: 'p-2' },
      em,
    });

    const [evento] = await db.select().from(schema.eventosAuditoria);
    expect(evento).toMatchObject({
      ocorridoEm: em,
      atorTipo: 'usuario',
      atorId,
      entidade: 'usuario',
      entidadeId: 'u-1',
      acao: 'papel_trocado',
      antes: { papelId: 'p-1' },
      depois: { papelId: 'p-2' },
    });
  });
});
