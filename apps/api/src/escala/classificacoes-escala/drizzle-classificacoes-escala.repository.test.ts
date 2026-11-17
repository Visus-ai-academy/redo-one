import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleListaRepository, LISTAS } from '../../catalogo/listas/drizzle-lista.repository';
import { DrizzleSubespecialidadesRepository } from '../../catalogo/subespecialidades/drizzle-subespecialidades.repository';
import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleClassificacoesEscalaRepository } from './drizzle-classificacoes-escala.repository';

const url = process.env.TEST_DATABASE_URL;
const base = { descricao: 'x', cor: '#123456', ordem: 0, ativo: true };

describe.skipIf(!url)('repositório de classificações da escala', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleClassificacoesEscalaRepository;
  let neuro: string;
  let msk: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleClassificacoesEscalaRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table subespecialidades, especialidades, prioridades cascade`);
    const especialidades = new DrizzleListaRepository(db, LISTAS.especialidades);
    neuro = await especialidades.criar({ ...base, nome: 'NEURO' });
    msk = await especialidades.criar({ ...base, nome: 'MSK' });
  });

  it('lista todas as prioridades, inativas inclusive, por ordem e nome, só id, nome e situação', async () => {
    const prioridades = new DrizzleListaRepository(db, LISTAS.prioridades);
    const rotina = await prioridades.criar({ ...base, nome: 'Rotina', ordem: 2 });
    const urgente = await prioridades.criar({ ...base, nome: 'Urgente', ordem: 1 });
    const antiga = await prioridades.criar({ ...base, nome: 'Antiga', ordem: 2, ativo: false });

    const { prioridades: lista } = await repo.listar();

    expect(lista).toEqual([
      { id: urgente, nome: 'Urgente', ativo: true },
      { id: antiga, nome: 'Antiga', ativo: false },
      { id: rotina, nome: 'Rotina', ativo: true },
    ]);
  });

  it('lista todas as subespecialidades com as especialidades, por ordem e nome', async () => {
    const subs = new DrizzleSubespecialidadesRepository(db);
    const colunas = await subs.criar({
      ...base,
      nome: 'COLUNAS',
      ordem: 1,
      especialidadeIds: [neuro, msk],
    });
    const avc = await subs.criar({
      ...base,
      nome: 'AVC',
      ordem: 1,
      ativo: false,
      especialidadeIds: [neuro],
    });
    const joelho = await subs.criar({ ...base, nome: 'JOELHO', especialidadeIds: [msk] });

    const { subespecialidades } = await repo.listar();

    expect(subespecialidades).toEqual([
      { id: joelho, nome: 'JOELHO', ativo: true, especialidadeIds: [msk] },
      { id: avc, nome: 'AVC', ativo: false, especialidadeIds: [neuro] },
      { id: colunas, nome: 'COLUNAS', ativo: true, especialidadeIds: [neuro, msk].sort() },
    ]);
  });

  it('sem nada cadastrado, listas vazias', async () => {
    await expect(repo.listar()).resolves.toEqual({ prioridades: [], subespecialidades: [] });
  });
});
