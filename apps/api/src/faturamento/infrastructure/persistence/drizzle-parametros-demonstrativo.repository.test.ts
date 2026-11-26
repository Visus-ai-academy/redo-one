import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleParametrosDemonstrativoRepository } from './drizzle-parametros-demonstrativo.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleParametrosDemonstrativoRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleParametrosDemonstrativoRepository;
  let usuarioId: string;
  let plantao: string;
  let urgencia: string;
  let sc: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleParametrosDemonstrativoRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table parametros_demonstrativo, prioridades_alternativas_preco`);
    await db.delete(schema.usuarios).where(sql`${schema.usuarios.email} like 'parametros-%'`);
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Bia', email: `parametros-${Math.random()}@exemplo.com` })
      .returning();
    usuarioId = u?.id ?? '';
    const n = Math.random();
    const ps = await db
      .insert(schema.prioridades)
      .values([{ nome: `PLANTAO ${n}` }, { nome: `URGENCIA ${n}` }])
      .returning();
    [plantao, urgencia] = ps.map((p) => p.id) as [string, string];
    const [c] = await db
      .insert(schema.categoriasExame)
      .values({ nome: `SC ${n}` })
      .returning();
    sc = c?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava e lista as versões dos parâmetros com quem criou', async () => {
    const em = new Date('2026-11-26T15:00:00Z');
    const id = await repo.criarParametros(
      '2026-12',
      {
        cobraDuplicados: true,
        cobraClientesInativos: false,
        categoriaPadraoId: sc,
        prioridadePadraoId: null,
      },
      { usuarioId, em },
    );
    expect(await repo.listarParametros()).toEqual([
      {
        id,
        desde: '2026-12',
        criadoEm: em,
        criadoPor: 'Bia',
        cobraDuplicados: true,
        cobraClientesInativos: false,
        categoriaPadraoId: sc,
        prioridadePadraoId: null,
      },
    ]);
  });

  it('grava e lista as prioridades alternativas; confere o catálogo', async () => {
    const em = new Date('2026-11-26T15:00:00Z');
    const id = await repo.criarAlternativa(
      '2026-12',
      { prioridadeId: plantao, alternativaId: urgencia },
      { usuarioId, em },
    );
    expect(await repo.listarAlternativas()).toEqual([
      {
        id,
        desde: '2026-12',
        criadoEm: em,
        criadoPor: 'Bia',
        prioridadeId: plantao,
        alternativaId: urgencia,
      },
    ]);
    expect(await repo.prioridadeExiste(plantao)).toBe(true);
    expect(await repo.categoriaExiste(sc)).toBe(true);
    expect(await repo.categoriaExiste('00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});
