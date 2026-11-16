import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleEscopoEscalaRepository } from './drizzle-escopo.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('repositório do recorte da escala', () => {
  let pool: Pool;
  let db: Database;
  let usuarioId: string;
  let manha: string;
  let tarde: string;
  let neuro: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table usuarios_escopos_escala, turnos, frentes_escala, especialidades, usuarios, papeis cascade`,
    );
    const [papel] = await db.insert(schema.papeis).values({ nome: 'Gestão de escala' }).returning();
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br', papelId: papel?.id ?? '' })
      .returning();
    usuarioId = usuario?.id ?? '';
    const [m, t] = await db
      .insert(schema.turnos)
      .values([
        { nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00' },
        { nome: 'Tarde', horarioInicio: '13:00', horarioFim: '19:00' },
      ])
      .returning();
    manha = m?.id ?? '';
    tarde = t?.id ?? '';
    const [especialidade] = await db
      .insert(schema.especialidades)
      .values({ nome: 'NEURO' })
      .returning();
    const [frente] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'especialidade', especialidadeId: especialidade?.id ?? '', rotulo: 'NEURO' })
      .returning();
    neuro = frente?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sem linhas, o usuário não tem recorte', async () => {
    const repo = new DrizzleEscopoEscalaRepository(db);
    expect(await repo.doUsuario(usuarioId)).toBeNull();
  });

  it('grava, lê e troca o recorte inteiro; listas vazias tiram o recorte', async () => {
    const repo = new DrizzleEscopoEscalaRepository(db);

    await repo.definir(usuarioId, { turnoIds: [manha, tarde], frenteIds: [neuro] });
    expect(await repo.doUsuario(usuarioId)).toEqual({
      turnoIds: new Set([manha, tarde]),
      frenteIds: new Set([neuro]),
    });

    await repo.definir(usuarioId, { turnoIds: [tarde, tarde], frenteIds: [] });
    expect(await repo.doUsuario(usuarioId)).toEqual({
      turnoIds: new Set([tarde]),
      frenteIds: new Set(),
    });

    await repo.definir(usuarioId, { turnoIds: [], frenteIds: [] });
    expect(await repo.doUsuario(usuarioId)).toBeNull();
  });
});
