import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adicionarJob } from './adicionar-job';
import { assumirTrabalho } from './travas-orfas';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('assumirTrabalho (travas de trabalhadores mortos)', () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;

  const travas = async () =>
    (
      await db.execute<{ job: string | null; fila: string | null }>(sql`
        select j.locked_by as job, q.locked_by as fila
        from graphile_worker._private_jobs j
        left join graphile_worker._private_job_queues q on q.id = j.job_queue_id
        order by j.id`)
    ).rows;

  /** Simula o worker que pegou o job e morreu no meio (o processo da API caiu). */
  const travarComoMorto = async (workerId: string) => {
    await adicionarJob(db, 'distribuicao:ler-retrato-fila', {}, { fila: 'distribuicao-retrato' });
    await db.execute(sql`
      update graphile_worker._private_jobs
      set locked_by = ${workerId}, locked_at = now(), attempts = 1`);
    await db.execute(sql`
      update graphile_worker._private_job_queues
      set locked_by = ${workerId}, locked_at = now()`);
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
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    await db.execute(sql`delete from graphile_worker._private_job_queues`);
  });

  it('sozinho, libera o job e a fila serial que um trabalhador morto deixou travados', async () => {
    await travarComoMorto('worker-morto');

    const sessao = await assumirTrabalho(pool);

    expect(sessao?.liberados).toEqual(['worker-morto']);
    expect(await travas()).toEqual([{ job: null, fila: null }]);
    await sessao?.encerrar();
  });

  it('com outro trabalhador vivo, não assume nem mexe nas travas dele', async () => {
    const vivo = await assumirTrabalho(pool);
    await travarComoMorto('worker-vivo');

    expect(await assumirTrabalho(pool)).toBeNull();
    expect(await travas()).toEqual([{ job: 'worker-vivo', fila: 'worker-vivo' }]);
    await vivo?.encerrar();
  });

  it('depois que o outro encerra, o próximo assume', async () => {
    const primeiro = await assumirTrabalho(pool);
    await primeiro?.encerrar();

    const segundo = await assumirTrabalho(pool);

    expect(segundo).toEqual(expect.objectContaining({ liberados: [] }));
    await segundo?.encerrar();
  });
});
