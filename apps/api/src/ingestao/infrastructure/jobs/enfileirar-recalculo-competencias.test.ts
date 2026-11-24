import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { enfileirarRecalculoCompetencias } from './enfileirar-recalculo-competencias';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('enfileirarRecalculoCompetencias', () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;

  // A view `graphile_worker.jobs` não expõe o payload: lê das tabelas privadas.
  const jobs = async () => {
    const resultado = await db.execute<{
      tarefa: string;
      fila: string | null;
      chave: string | null;
      payload: unknown;
    }>(
      sql`select t.identifier as tarefa, q.queue_name as fila, j.key as chave, j.payload
          from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
          left join graphile_worker._private_job_queues q on q.id = j.job_queue_id
          order by j.id`,
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

  it('grava o job na fila da ingestão, dentro da transação de quem chama', async () => {
    await db.transaction(async (tx) => {
      await enfileirarRecalculoCompetencias(tx, ['c-2', 'c-1']);
    });

    expect(await jobs()).toEqual([
      {
        tarefa: 'ingestao.recalcular-competencias',
        fila: 'ingestao',
        chave: 'ingestao.recalcular-competencias:c-1,c-2',
        payload: { clienteIds: ['c-1', 'c-2'] },
      },
    ]);
  });

  it('o mesmo escopo enfileirado de novo não duplica; escopos diferentes, sim', async () => {
    await enfileirarRecalculoCompetencias(db, ['c-1']);
    await enfileirarRecalculoCompetencias(db, ['c-1', 'c-1']);
    await enfileirarRecalculoCompetencias(db, null);
    await enfileirarRecalculoCompetencias(db, null);

    expect((await jobs()).map((j) => [j.chave, j.payload])).toEqual([
      ['ingestao.recalcular-competencias:c-1', { clienteIds: ['c-1'] }],
      ['ingestao.recalcular-competencias:todos', { clienteIds: null }],
    ]);
  });

  it('sem nenhum cliente, não enfileira nada', async () => {
    await enfileirarRecalculoCompetencias(db, []);

    expect(await jobs()).toEqual([]);
  });

  it('com a transação desfeita, o job some junto', async () => {
    await db
      .transaction(async (tx) => {
        await enfileirarRecalculoCompetencias(tx, null);
        throw new Error('falhou depois de enfileirar');
      })
      .catch(() => undefined);

    expect(await jobs()).toEqual([]);
  });
});
