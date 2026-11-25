import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reclassificarAoAlterarEquipe } from './gatilhos-tipificacao.module';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('gatilhos da tipificação', () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool });
    await runMigrations({ pgPool: pool });
  });
  beforeEach(async () => {
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('equipe alterada enfileira a reclassificação de todos na transação de quem chama', async () => {
    await db
      .transaction(async (tx) => {
        await reclassificarAoAlterarEquipe.aoAlterar(tx);
        throw new Error('desfaz');
      })
      .catch(() => undefined);
    expect((await db.execute(sql`select key from graphile_worker.jobs`)).rows).toEqual([]);

    await db.transaction((tx) => reclassificarAoAlterarEquipe.aoAlterar(tx));
    expect((await db.execute(sql`select key from graphile_worker.jobs`)).rows).toEqual([
      { key: 'ingestao.reclassificar-tipificacao:todos' },
    ]);
  });
});
