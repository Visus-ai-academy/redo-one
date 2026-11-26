import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adicionarJob } from '../../../comum/jobs/adicionar-job';
import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { RecalculadorCompetencia } from '../../application/recalculadores';
import { DrizzleRecalculosCompetencia } from './drizzle-recalculos-competencia';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleRecalculosCompetencia', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleRecalculosCompetencia;
  let usuarioId: string;

  const recalculador = (falha = false): RecalculadorCompetencia => ({
    contexto: 'faturamento',
    enfileirar: async (executor, pedido) => {
      await adicionarJob(executor, 'teste.recalcular', pedido);
      if (falha) throw new Error('falhou ao enfileirar');
    },
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleRecalculosCompetencia(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table recalculos_competencia, competencias cascade`);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    await db.delete(schema.usuarios).where(sql`${schema.usuarios.email} like 'recalculos-%'`);
    await db.insert(schema.competencias).values({ competencia: '2026-09', status: 'fechada' });
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Ana Financeiro', email: `recalculos-${Math.random()}@exemplo.com` })
      .returning();
    usuarioId = u?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  const pedido = (motivo: string, em: Date) => ({
    competencia: '2026-09',
    contexto: 'faturamento' as const,
    motivo,
    solicitadoPorId: usuarioId,
    solicitadoEm: em,
  });

  const jobs = async () =>
    (
      await db.execute<{ payload: unknown }>(
        sql`select j.payload from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'teste.recalcular'`,
      )
    ).rows.map((r) => r.payload);

  it('grava o pedido e o job do contexto juntos e lista com o nome de quem pediu', async () => {
    const em = new Date('2026-11-26T15:00:00Z');
    const id = await repo.solicitar(pedido('valor errado', em), recalculador());

    expect(await jobs()).toEqual([{ recalculoId: id, competencia: '2026-09' }]);
    expect(await repo.listar('2026-09')).toEqual([
      {
        id,
        competencia: '2026-09',
        contexto: 'faturamento',
        motivo: 'valor errado',
        solicitadoPorId: usuarioId,
        solicitadoPor: 'Ana Financeiro',
        solicitadoEm: em,
        concluidoEm: null,
      },
    ]);
  });

  it('sem o job, o pedido não fica gravado', async () => {
    await expect(repo.solicitar(pedido('x', new Date()), recalculador(true))).rejects.toThrow(
      'falhou ao enfileirar',
    );
    expect(await repo.listar('2026-09')).toEqual([]);
    expect(await jobs()).toEqual([]);
  });

  it('lista o mais novo primeiro e conclui só uma vez', async () => {
    const um = await repo.solicitar(pedido('um', new Date('2026-11-26T10:00:00Z')), recalculador());
    const dois = await repo.solicitar(
      pedido('dois', new Date('2026-11-26T11:00:00Z')),
      recalculador(),
    );
    const fim = new Date('2026-11-26T12:00:00Z');
    await repo.concluir(um, fim);
    await repo.concluir(um, new Date('2026-11-26T13:00:00Z'));

    const lista = await repo.listar('2026-09');
    expect(lista.map((r) => [r.id, r.concluidoEm])).toEqual([
      [dois, null],
      [um, fim],
    ]);
    expect((await repo.obter(um))?.motivo).toBe('um');
    expect(await repo.obter('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
