import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adicionarJob } from './adicionar-job';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('adicionarJob', () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;

  const jobs = async () => {
    const resultado = await db.execute<{ task_identifier: string; payload: unknown }>(
      sql`select task_identifier, payload from graphile_worker.jobs`,
    );
    return resultado.rows;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool });
    await runMigrations({ pgPool: pool });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`select graphile_worker.remove_job(key) from graphile_worker.jobs where key is not null`,
    );
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });

  it('com a transação confirmada, o job entra na fila', async () => {
    await db.transaction(async (tx) => {
      await adicionarJob(tx, 'email.enviar', { para: 'maria@empresa.com.br' });
    });

    expect(await jobs()).toEqual([
      { task_identifier: 'email.enviar', payload: { para: 'maria@empresa.com.br' } },
    ]);
  });

  it('com a transação desfeita, o job some junto com o dado', async () => {
    await db
      .transaction(async (tx) => {
        await adicionarJob(tx, 'email.enviar', { para: 'maria@empresa.com.br' });
        throw new Error('falhou depois de enfileirar');
      })
      .catch(() => undefined);

    expect(await jobs()).toEqual([]);
  });

  it('a mesma chave substitui o job pendente em vez de duplicar', async () => {
    await adicionarJob(db, 'email.enviar', { versao: 1 }, { chave: 'convite:u-1' });
    await adicionarJob(db, 'email.enviar', { versao: 2 }, { chave: 'convite:u-1' });

    expect(await jobs()).toEqual([{ task_identifier: 'email.enviar', payload: { versao: 2 } }]);
  });

  it('jobs da mesma fila entram nela, para rodar um de cada vez', async () => {
    await adicionarJob(db, 'ingestao.importar', { importacaoId: 'i-1' }, { fila: 'ingestao' });

    const resultado = await db.execute<{ task_identifier: string; queue_name: string | null }>(
      sql`select task_identifier, queue_name from graphile_worker.jobs`,
    );
    expect(resultado.rows).toEqual([
      { task_identifier: 'ingestao.importar', queue_name: 'ingestao' },
    ]);
  });
});
