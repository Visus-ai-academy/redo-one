import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { enfileirarReclassificacaoTipificacao } from './enfileirar-reclassificacao-tipificacao';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('enfileirarReclassificacaoTipificacao', () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;

  const jobs = async () =>
    (
      await db.execute<{
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
      )
    ).rows;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool });
    await runMigrations({ pgPool: pool });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });

  it('grava o job na fila da ingestão, com a chave pelo escopo; repetido não duplica', async () => {
    await db.transaction(async (tx) => {
      await enfileirarReclassificacaoTipificacao(tx, ['c-2', 'c-1']);
    });
    await enfileirarReclassificacaoTipificacao(db, ['c-1', 'c-2', 'c-1']);
    await enfileirarReclassificacaoTipificacao(db, null);
    await enfileirarReclassificacaoTipificacao(db, []);

    expect(await jobs()).toEqual([
      {
        tarefa: 'ingestao.reclassificar-tipificacao',
        fila: 'ingestao',
        chave: 'ingestao.reclassificar-tipificacao:c-1,c-2',
        payload: { clienteIds: ['c-1', 'c-2'] },
      },
      {
        tarefa: 'ingestao.reclassificar-tipificacao',
        fila: 'ingestao',
        chave: 'ingestao.reclassificar-tipificacao:todos',
        payload: { clienteIds: null },
      },
    ]);
  });
});
