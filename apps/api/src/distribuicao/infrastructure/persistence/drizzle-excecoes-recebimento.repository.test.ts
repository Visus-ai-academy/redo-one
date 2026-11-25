import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleExcecoesRecebimentoRepository } from './drizzle-excecoes-recebimento.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('exceções da grade de recebimento (banco)', () => {
  let pool: Pool;
  let db: Database;
  let lista = '';
  let neuro = '';
  let ct = '';
  let rot = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table excecoes_recebimento, turnos, especialidades, modalidades, prioridades_operacao cascade`,
    );
    const [t] = await db
      .insert(schema.turnos)
      .values({ nome: 'Lista', horarioInicio: '07:00', horarioFim: '07:00' })
      .returning();
    const [e] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    const [m] = await db.insert(schema.modalidades).values({ codigo: 'CT' }).returning();
    const [p] = await db
      .insert(schema.prioridadesOperacao)
      .values({ nome: 'ROTINA', posicao: 3, urgencia: 'nunca' })
      .returning();
    lista = t?.id ?? '';
    neuro = e?.id ?? '';
    ct = m?.id ?? '';
    rot = p?.id ?? '';
  });

  it('cria, lê, troca, filtra pelas que terminam desde o dia e exclui', async () => {
    const repo = new DrizzleExcecoesRecebimentoRepository(db);
    const criadoEm = new Date('2026-11-25T12:00:00Z');
    const toda = await repo.criar({
      turnoId: lista,
      frente: null,
      prioridadeOperacaoId: null,
      regra: { tipo: 'segue_sla' },
      de: '2026-11-25',
      ate: '2026-12-22',
      criadoEm,
    });
    const neuroRot = await repo.criar({
      turnoId: lista,
      frente: { tipo: 'especialidade', especialidadeId: neuro, modalidadeId: null },
      prioridadeOperacaoId: rot,
      regra: { tipo: 'prazo_minimo', horas: 12 },
      de: '2026-11-01',
      ate: '2026-11-10',
      criadoEm,
    });

    expect(await repo.obter(neuroRot)).toEqual({
      id: neuroRot,
      turnoId: lista,
      frente: { tipo: 'especialidade', especialidadeId: neuro, modalidadeId: null },
      prioridadeOperacaoId: rot,
      regra: { tipo: 'prazo_minimo', horas: 12 },
      de: '2026-11-01',
      ate: '2026-11-10',
      criadoEm,
    });
    expect((await repo.listar()).map((e) => e.id)).toEqual([toda, neuroRot]);
    expect((await repo.terminandoDesde('2026-11-25')).map((e) => e.id)).toEqual([toda]);

    await repo.salvar({
      id: toda,
      turnoId: lista,
      frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: ct },
      prioridadeOperacaoId: null,
      regra: { tipo: 'nao_recebe' },
      de: '2026-11-25',
      ate: '2026-11-30',
    });
    expect(await repo.obter(toda)).toMatchObject({
      frente: { tipo: 'modalidade', modalidadeId: ct },
      regra: { tipo: 'nao_recebe' },
      ate: '2026-11-30',
      criadoEm,
    });

    await repo.excluir(toda);
    expect(await repo.obter(toda)).toBeNull();
  });
});
