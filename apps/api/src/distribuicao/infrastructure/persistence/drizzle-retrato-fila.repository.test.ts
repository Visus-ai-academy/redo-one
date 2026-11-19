import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { FilaDoMomento } from '../../application/use-cases/rodadas/consultas';
import { DrizzleRetratoFilaRepository } from './drizzle-retrato-fila.repository';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-11-19T12:00:00Z');
const minutos = (n: number) => new Date(agora.getTime() + n * 60_000);

const fila = (lidaEm: Date): FilaDoMomento =>
  ({
    lidaEm,
    total: 4,
    primeiroVencimento: minutos(-30),
    proximoVencimento: null,
    turnos: [{ turnoId: 't1', nome: 'Manhã', inicio: minutos(-60), fim: minutos(300) }],
    medicosEmTurno: [],
  }) as unknown as FilaDoMomento;

describe.skipIf(!url)('repositório Drizzle do retrato da fila', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleRetratoFilaRepository;

  const jobs = async () =>
    (
      await db.execute<{ task_identifier: string; key: string | null; queue_name: string | null }>(
        sql`select task_identifier, key, queue_name from graphile_worker.jobs order by id`,
      )
    ).rows;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleRetratoFilaRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table retrato_fila_distribuicao`);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });

  it('nunca lida: tudo vazio', async () => {
    expect(await repo.obter()).toEqual({ fila: null, pedidaEm: null, falhouEm: null, erro: null });
  });

  it('grava o retrato com as datas de volta como Date; a falha fica até a próxima leitura boa', async () => {
    await repo.gravar(fila(agora));
    await repo.registrarFalha(minutos(5), 'fora do ar');
    expect(await repo.obter()).toMatchObject({
      fila: {
        lidaEm: agora,
        primeiroVencimento: minutos(-30),
        turnos: [{ inicio: minutos(-60), fim: minutos(300) }],
      },
      falhouEm: minutos(5),
      erro: 'fora do ar',
    });
    await repo.gravar(fila(minutos(10)));
    expect(await repo.obter()).toMatchObject({
      fila: { lidaEm: minutos(10) },
      falhouEm: null,
      erro: null,
    });
  });

  it('pedir a leitura duas vezes deixa um job só, na fila própria', async () => {
    await repo.pedirLeitura(agora);
    await repo.pedirLeitura(minutos(1));
    expect((await repo.obter()).pedidaEm).toEqual(minutos(1));
    expect(await jobs()).toEqual([
      {
        task_identifier: 'distribuicao:ler-retrato-fila',
        key: 'distribuicao:retrato-fila',
        queue_name: 'distribuicao-retrato',
      },
    ]);
  });
});
