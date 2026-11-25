import { EventEmitter } from 'node:events';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { adicionarJob } from './adicionar-job';
import { assumirTrabalho, PRAZO_CONSULTA_MS, VERIFICACAO_TRAVA_MS } from './travas-orfas';

/** Cliente do pg de mentira: responde pelo `responder` e guarda como foi devolvido ao pool. */
class ClienteFalso extends EventEmitter {
  devolvido: { erro?: unknown } | undefined;
  responder: (sql: string) => Promise<{ rows: unknown[] }> = async (sql) =>
    sql.includes('locked_by') ? { rows: [] } : { rows: [{ ok: true }] };
  consultas: string[] = [];
  query = vi.fn(async (sql: string) => {
    this.consultas.push(sql);
    return this.responder(sql);
  });
  release = vi.fn((erro?: unknown) => {
    this.devolvido = { erro };
  });
}

const nuncaResponde = () => new Promise<never>(() => {});

describe('sessão do trabalhador (conexão que segura a trava)', () => {
  let cliente: ClienteFalso;
  const assumir = () =>
    assumirTrabalho({ connect: async () => cliente } as unknown as Pool).then((s) => {
      if (!s) throw new Error('não assumiu');
      return s;
    });

  beforeEach(() => {
    vi.useFakeTimers();
    cliente = new ClienteFalso();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa que a trava se perdeu quando a conexão dá erro', async () => {
    const sessao = await assumir();

    cliente.emit('error', new Error('read ECONNRESET'));

    await expect(sessao.perdida).resolves.toMatch(/ECONNRESET/);
  });

  it('avisa que a trava se perdeu quando a conexão termina', async () => {
    const sessao = await assumir();

    cliente.emit('end');

    await expect(sessao.perdida).resolves.toMatch(/conexão/);
  });

  it('confere de tempos em tempos e avisa quando o banco já não registra a trava', async () => {
    const sessao = await assumir();
    let perdida: string | undefined;
    void sessao.perdida.then((m) => {
      perdida = m;
    });
    await vi.advanceTimersByTimeAsync(VERIFICACAO_TRAVA_MS);
    expect(perdida).toBeUndefined();

    cliente.responder = async () => ({ rows: [{ ok: false }] });
    await vi.advanceTimersByTimeAsync(VERIFICACAO_TRAVA_MS);

    expect(perdida).toMatch(/trava/);
  });

  it('avisa que a trava se perdeu quando a conferência não responde no prazo', async () => {
    const sessao = await assumir();
    cliente.responder = nuncaResponde;

    await vi.advanceTimersByTimeAsync(VERIFICACAO_TRAVA_MS + PRAZO_CONSULTA_MS);

    await expect(sessao.perdida).resolves.toMatch(/prazo/);
  });

  it('ao encerrar, solta a trava e devolve a conexão ao pool', async () => {
    const sessao = await assumir();

    await sessao.encerrar();

    expect(cliente.consultas.at(-1)).toMatch(/pg_advisory_unlock/);
    expect(cliente.devolvido).toEqual({ erro: undefined });
  });

  it('com a conexão morta, encerra dentro do prazo e descarta a conexão', async () => {
    const sessao = await assumir();
    cliente.emit('error', new Error('read ECONNRESET'));
    cliente.responder = nuncaResponde;
    let encerrou = false;

    void sessao.encerrar().then(() => {
      encerrou = true;
    });
    await vi.advanceTimersByTimeAsync(PRAZO_CONSULTA_MS);

    expect(encerrou).toBe(true);
    expect(cliente.devolvido?.erro).toBeInstanceOf(Error);
  });

  it('depois de encerrar, para de conferir a trava', async () => {
    const sessao = await assumir();
    await sessao.encerrar();
    const consultas = cliente.consultas.length;

    await vi.advanceTimersByTimeAsync(VERIFICACAO_TRAVA_MS * 3);

    expect(cliente.consultas.length).toBe(consultas);
  });
});

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
