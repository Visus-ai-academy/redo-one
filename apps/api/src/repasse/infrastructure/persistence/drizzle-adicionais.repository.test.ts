import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleAdicionaisRepository } from './drizzle-adicionais.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleAdicionaisRepository.listar', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleAdicionaisRepository;
  let ana = '';
  let caio = '';
  let usuario = '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleAdicionaisRepository(db);
  });

  afterAll(async () => {
    await db.execute(sql`truncate table adicionais_repasse, medicos, usuarios cascade`);
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table adicionais_repasse, medicos, usuarios cascade`);
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Bruno', email: 'b@exemplo.com.br' })
      .returning();
    usuario = u?.id ?? '';
    const [a, c] = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana', chaveNormalizada: 'ANA' },
        { nome: 'Caio', chaveNormalizada: 'CAIO' },
      ])
      .returning();
    ana = a?.id ?? '';
    caio = c?.id ?? '';
    const base = {
      competencia: '2026-11',
      data: '2026-11-05',
      descricao: 'x',
      quantidade: null,
      valorUnitarioCentavos: null,
      referenciaDesde: null,
      referenciaAte: null,
      lancadoPorId: usuario,
    };
    await db.insert(schema.adicionaisRepasse).values([
      {
        ...base,
        medicoId: ana,
        tipo: 'avulso',
        valorCentavos: -12000,
        lancadoEm: new Date('2026-11-10T10:00:00Z'),
      },
      {
        ...base,
        medicoId: ana,
        tipo: 'plantao',
        valorCentavos: 180000,
        quantidade: 3,
        valorUnitarioCentavos: 60000,
        lancadoEm: new Date('2026-11-11T10:00:00Z'),
        canceladoEm: new Date('2026-11-12T10:00:00Z'),
        canceladoPorId: usuario,
        motivoCancelamento: 'lançado em dobro',
      },
      {
        ...base,
        medicoId: caio,
        tipo: 'plantao',
        valorCentavos: 60000,
        quantidade: 1,
        valorUnitarioCentavos: 60000,
        lancadoEm: new Date('2026-11-12T10:00:00Z'),
      },
      { ...base, competencia: '2026-10', medicoId: caio, tipo: 'avulso', valorCentavos: 100 },
    ]);
  });

  const f = { competencia: '2026-11', pagina: 1, porPagina: 25 };

  it('da competência, os cancelados também, mais novos primeiro, com o total', async () => {
    const r = await repo.listar(f);
    expect(r.total).toBe(3);
    expect(r.itens.map((a) => [a.medico, a.tipo])).toEqual([
      ['Caio', 'plantao'],
      ['Ana', 'plantao'],
      ['Ana', 'avulso'],
    ]);
    expect(r.itens[1]).toMatchObject({
      motivoCancelamento: 'lançado em dobro',
      canceladoPor: 'Bruno',
    });
  });

  it('filtra por médico e por tipo e pagina', async () => {
    expect((await repo.listar({ ...f, medicoId: ana })).total).toBe(2);
    expect((await repo.listar({ ...f, tipo: 'plantao' })).total).toBe(2);
    expect((await repo.listar({ ...f, medicoId: ana, tipo: 'avulso' })).itens).toHaveLength(1);
    const p2 = await repo.listar({ ...f, pagina: 2, porPagina: 2 });
    expect(p2).toMatchObject({ total: 3, pagina: 2, porPagina: 2 });
    expect(p2.itens.map((a) => a.tipo)).toEqual(['avulso']);
  });
});
