import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleCompetenciasRepository } from './drizzle-competencias.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleCompetenciasRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleCompetenciasRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleCompetenciasRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table competencias`);
  });

  afterAll(async () => {
    await pool.end();
  });

  const status = async () =>
    (await db.select().from(schema.competencias)).map((c) => [c.competencia, c.status]).sort();

  it('lista as fechadas e as abertas com a importação travada, não as outras abertas', async () => {
    await db.insert(schema.competencias).values([
      { competencia: '2026-08', status: 'fechada', fechadaEm: new Date() },
      { competencia: '2026-09', status: 'aberta', importacaoTravadaEm: new Date() },
      { competencia: '2026-10', status: 'aberta' },
    ]);

    expect((await repo.listarBloqueadas()).sort()).toEqual(['2026-08', '2026-09']);
    // A porta da ingestão vê o mesmo.
    expect((await repo.listar()).sort()).toEqual(['2026-08', '2026-09']);
  });

  it('garante como aberta só as que não têm linha, e de novo não muda nada', async () => {
    await db.insert(schema.competencias).values({ competencia: '2026-09', status: 'fechada' });

    await repo.garantir(['2026-09', '2026-10', '2026-11', '2026-10']);
    await repo.garantir(['2026-09', '2026-10', '2026-11']);

    expect(await status()).toEqual([
      ['2026-09', 'fechada'],
      ['2026-10', 'aberta'],
      ['2026-11', 'aberta'],
    ]);
  });

  it('garantir sem competências não faz nada', async () => {
    await repo.garantir([]);

    expect(await status()).toEqual([]);
  });

  it('recusa status fora de aberta e fechada', async () => {
    await expect(
      db.execute(sql`insert into competencias (competencia, status) values ('2026-10', 'aberto')`),
    ).rejects.toThrow();
  });
});
