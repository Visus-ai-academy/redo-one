import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { normalizarNomeMedico } from '../../medicos/comum/nome-medico';
import { DrizzleMedicosEscalaRepository } from './drizzle-medicos-escala.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('repositório de médicos da escala', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleMedicosEscalaRepository;
  const ids: Record<string, string> = {};
  const pagina = { pagina: 1, porPagina: 25 };
  const nomes = (itens: { nome: string }[]) => itens.map((i) => i.nome);

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleMedicosEscalaRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table medicos cascade`);
    const linhas = await db
      .insert(schema.medicos)
      .values(
        [
          { nome: 'Dra. Márcia Souza', ativo: true, crm: '1234-SP', email: 'marcia@x.com' },
          { nome: 'Dr. Augusto Lima', ativo: true },
          { nome: 'Bruno Marcial', ativo: false },
          { nome: 'Carla Dias', ativo: true },
        ].map((m) => ({ ...m, chaveNormalizada: normalizarNomeMedico(m.nome) })),
      )
      .returning({ id: schema.medicos.id, nome: schema.medicos.nome });
    for (const l of linhas) ids[l.nome] = l.id;
  });

  it('lista só id, nome e situação, por nome (sem contar o "Dr.")', async () => {
    const { itens, total } = await repo.listar(pagina);

    expect(total).toBe(4);
    expect(nomes(itens)).toEqual([
      'Dr. Augusto Lima',
      'Bruno Marcial',
      'Carla Dias',
      'Dra. Márcia Souza',
    ]);
    expect(itens[3]).toEqual({
      id: ids['Dra. Márcia Souza'],
      nome: 'Dra. Márcia Souza',
      ativo: true,
    });
    expect(Object.keys(itens[0] ?? {}).sort()).toEqual(['ativo', 'id', 'nome']);
  });

  it('busca pela grafia normalizada, com a mais parecida primeiro', async () => {
    const { itens, total } = await repo.listar({ ...pagina, busca: 'marci' });

    expect(total).toBe(2);
    expect(nomes(itens)).toEqual(['Dra. Márcia Souza', 'Bruno Marcial']);
  });

  it('filtra pela situação', async () => {
    expect(nomes((await repo.listar({ ...pagina, ativo: false })).itens)).toEqual([
      'Bruno Marcial',
    ]);
    expect((await repo.listar({ ...pagina, ativo: true, busca: 'marci' })).total).toBe(1);
  });

  it('pagina mantendo o total', async () => {
    const { itens, total } = await repo.listar({ pagina: 2, porPagina: 3 });

    expect(total).toBe(4);
    expect(nomes(itens)).toEqual(['Dra. Márcia Souza']);
  });

  it('busca pelo id só id, nome e situação; nulo se não existe', async () => {
    await expect(repo.buscar(ids['Bruno Marcial'] ?? '')).resolves.toEqual({
      id: ids['Bruno Marcial'],
      nome: 'Bruno Marcial',
      ativo: false,
    });
    await expect(repo.buscar('00000000-0000-0000-0000-000000000000')).resolves.toBeNull();
  });
});
