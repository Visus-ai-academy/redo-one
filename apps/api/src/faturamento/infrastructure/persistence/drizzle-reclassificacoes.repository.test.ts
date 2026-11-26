import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleReclassificacoesRepository } from './drizzle-reclassificacoes.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleReclassificacoesRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleReclassificacoesRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleReclassificacoesRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table reclassificacoes_faturamento cascade`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava com os recortes ("todos" sem linha), lista e encerra uma vez', async () => {
    const s = Math.random().toString(36).slice(2, 8);
    const [cat] = await db
      .insert(schema.categoriasExame)
      .values({ nome: `COL${s}` })
      .returning();
    const [esp] = await db
      .insert(schema.especialidades)
      .values({ nome: `NEU${s}` })
      .returning();
    const [eq] = await db
      .insert(schema.equipes)
      .values({ nome: `Neuro ${s}` } as never)
      .returning();
    const id = await repo.criar(
      {
        ordem: 1,
        descricao: 'coluna',
        modalidadeIds: null,
        especialidadeIds: null,
        categoriaIds: [cat?.id as string],
        equipeIds: [eq?.id as string],
        especialidadeDestinoId: esp?.id as string,
        categoriaDestinoId: null,
        vigenciaDesde: '2026-11',
      },
      { usuarioId: null as never, em: new Date() },
    );
    expect(await repo.listar()).toEqual([
      {
        id,
        ordem: 1,
        descricao: 'coluna',
        modalidadeIds: null,
        especialidadeIds: null,
        categoriaIds: [cat?.id],
        equipeIds: [eq?.id],
        especialidadeDestinoId: esp?.id,
        categoriaDestinoId: null,
        vigenciaDesde: '2026-11',
        vigenciaAte: null,
      },
    ]);
    expect(await repo.encerrar(id, '2026-12')).toBe(true);
    expect(await repo.encerrar(id, '2027-01')).toBe(false);
    expect((await repo.listar())[0]?.vigenciaAte).toBe('2026-12');
  });
});
