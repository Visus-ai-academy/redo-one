import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleListaRepository, LISTAS } from './drizzle-lista.repository';
import type { DadosPrioridade } from './lista.repository';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleListaRepository', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table modalidades, prioridades, exames cascade`);
  });

  afterAll(async () => {
    await pool.end();
  });

  const base = { descricao: null, cor: null, ordem: 0, ativo: true };

  it('grava o nome da modalidade na coluna do código e lista por ordem e nome', async () => {
    const repo = new DrizzleListaRepository(db, LISTAS.modalidades);
    await repo.criar({ ...base, nome: 'RX', ordem: 2 });
    const ct = await repo.criar({ ...base, nome: 'CT', ordem: 1, descricao: 'Tomografia' });

    const [linha] = await db.select().from(schema.modalidades).where(sql`id = ${ct}`);
    expect(linha?.codigo).toBe('CT');

    const pagina = await repo.listar({ pagina: 1, porPagina: 10 });
    expect(pagina).toMatchObject({ total: 2, itens: [{ nome: 'CT' }, { nome: 'RX' }] });
    expect((await repo.listar({ busca: 'tomo', pagina: 1, porPagina: 10 })).total).toBe(1);
    expect((await repo.buscarPorNome('ct'))?.id).toBe(ct);
  });

  it('lê e grava os campos a mais da lista (urgente da prioridade)', async () => {
    const repo = new DrizzleListaRepository<DadosPrioridade>(db, LISTAS.prioridades);
    const id = await repo.criar({ ...base, nome: 'URGÊNCIA', urgente: true });

    await repo.atualizar(id, { ...base, nome: 'URGENTE', urgente: false });

    expect(await repo.buscar(id)).toMatchObject({ nome: 'URGENTE', urgente: false });
  });

  it('prioridade e especialidade contam as variações que chegam da MobileMed', async () => {
    const repo = new DrizzleListaRepository<DadosPrioridade>(db, LISTAS.prioridades);
    const id = await repo.criar({ ...base, nome: 'URGÊNCIA', urgente: true });
    await db.insert(schema.prioridadesDePara).values([
      { origem: 'Urgência', prioridadeId: id },
      { origem: 'URGENCIA', prioridadeId: id },
    ]);

    expect(await repo.buscar(id)).toMatchObject({ totalVariacoes: 2 });
    expect((await repo.listar({ pagina: 1, porPagina: 10 })).itens[0]).toMatchObject({
      totalVariacoes: 2,
    });
  });

  it('não exclui item referenciado por outro cadastro', async () => {
    const repo = new DrizzleListaRepository(db, LISTAS.modalidades);
    const id = await repo.criar({ ...base, nome: 'MR' });
    await db
      .insert(schema.exames)
      .values({ nome: 'RM CRANIO', chaveNormalizada: 'rm cranio', modalidadeId: id });

    expect(await repo.excluir(id)).toBe(false);
    expect(await repo.buscar(id)).not.toBeNull();
  });
});
