import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { garantirFrentes } from './garantir-frentes';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('garantirFrentes', () => {
  let pool: Pool;
  let db: Database;
  let neuro: string;
  let mama: string;
  let ct: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table frentes_escala, turnos, especialidades, modalidades, usuarios, papeis, medicos, tipos_ausencia cascade`,
    );
    const [n, m] = await db
      .insert(schema.especialidades)
      .values([{ nome: 'NEURO' }, { nome: 'MAMA' }])
      .returning();
    const [c] = await db.insert(schema.modalidades).values({ codigo: 'CT' }).returning();
    neuro = n?.id ?? '';
    mama = m?.id ?? '';
    ct = c?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  const frentes = () =>
    db
      .select({
        id: schema.frentesEscala.id,
        tipo: schema.frentesEscala.tipo,
        especialidadeId: schema.frentesEscala.especialidadeId,
        modalidadeId: schema.frentesEscala.modalidadeId,
      })
      .from(schema.frentesEscala);

  it('cria a frente de cada especialidade e modalidade e devolve os ids, ordenados', async () => {
    const ids = await garantirFrentes(db, { especialidadeIds: [neuro], modalidadeIds: [ct] });

    const gravadas = await frentes();
    expect(gravadas).toHaveLength(2);
    expect(ids).toEqual(gravadas.map((f) => f.id).sort());
    expect(gravadas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tipo: 'especialidade', especialidadeId: neuro }),
        expect.objectContaining({ tipo: 'modalidade', modalidadeId: ct }),
      ]),
    );
  });

  it('é idempotente: a frente que já existe é reaproveitada', async () => {
    const primeira = await garantirFrentes(db, { especialidadeIds: [neuro], modalidadeIds: [] });
    const segunda = await garantirFrentes(db, {
      especialidadeIds: [neuro, mama],
      modalidadeIds: [],
    });

    expect(segunda).toContain(primeira[0]);
    expect(await frentes()).toHaveLength(2);
  });

  it('sem nada pedido, não grava nada', async () => {
    expect(await garantirFrentes(db, { especialidadeIds: [], modalidadeIds: [] })).toEqual([]);
    expect(await frentes()).toHaveLength(0);
  });

  it('roda dentro da transação de quem chama: se ela desfaz, a frente some', async () => {
    await expect(
      db.transaction(async (tx) => {
        await garantirFrentes(tx, { especialidadeIds: [neuro], modalidadeIds: [] });
        throw new Error('desfaz');
      }),
    ).rejects.toThrow('desfaz');

    expect(await frentes()).toHaveLength(0);
  });

  it('não duplica com chamadas concorrentes', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        db.transaction((tx) =>
          garantirFrentes(tx, { especialidadeIds: [neuro, mama], modalidadeIds: [ct] }),
        ),
      ),
    );

    expect(await frentes()).toHaveLength(3);
    for (const ids of resultados) expect(ids).toEqual(resultados[0]);
  });
});
