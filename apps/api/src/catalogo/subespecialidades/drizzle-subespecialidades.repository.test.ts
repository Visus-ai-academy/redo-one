import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleListaRepository, LISTAS } from '../listas/drizzle-lista.repository';
import { DrizzleSubespecialidadesRepository } from './drizzle-subespecialidades.repository';

const url = process.env.TEST_DATABASE_URL;
const base = { descricao: null, cor: null, ordem: 0, ativo: true };

describe.skipIf(!url)('DrizzleSubespecialidadesRepository', () => {
  let pool: Pool;
  let db: Database;
  let neuro: string;
  let msk: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table subespecialidades, especialidades cascade`);
    const especialidades = new DrizzleListaRepository(db, LISTAS.especialidades);
    neuro = await especialidades.criar({ ...base, nome: 'NEURO' });
    msk = await especialidades.criar({ ...base, nome: 'MSK' });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava e troca as especialidades da subespecialidade', async () => {
    const repo = new DrizzleSubespecialidadesRepository(db);
    const id = await repo.criar({ ...base, nome: 'COLUNAS', especialidadeIds: [neuro, msk] });
    expect((await repo.buscar(id))?.especialidadeIds.sort()).toEqual([neuro, msk].sort());

    await repo.atualizar(id, { ...base, nome: 'COLUNAS', especialidadeIds: [msk] });

    const pagina = await repo.listar({ pagina: 1, porPagina: 10 });
    expect(pagina.itens).toEqual([
      expect.objectContaining({ nome: 'COLUNAS', especialidadeIds: [msk] }),
    ]);
  });

  it('especialidade com subespecialidade não se exclui', async () => {
    await new DrizzleSubespecialidadesRepository(db).criar({
      ...base,
      nome: 'AVC',
      especialidadeIds: [neuro],
    });

    expect(await new DrizzleListaRepository(db, LISTAS.especialidades).excluir(neuro)).toBe(false);
  });
});
