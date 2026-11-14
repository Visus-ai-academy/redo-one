import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleContratadosRepository } from './drizzle-contratados.repository';

const url = process.env.TEST_DATABASE_URL;
const base = {
  cnpj: null,
  endereco: null,
  cidade: null,
  uf: null,
  cep: null,
  contratadoRepasseId: null,
  ativo: true,
};

describe.skipIf(!url)('DrizzleContratadosRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleContratadosRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleContratadosRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table contratados, clientes cascade`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lista com o nome do contratado de repasse e busca por razão social ou CNPJ', async () => {
    const tele = await repo.criar({
      ...base,
      razaoSocial: '001 TELEIMAGEM',
      cnpj: '12345678000190',
    });
    await repo.criar({
      ...base,
      razaoSocial: '002 RADIOLOGIA NACIONAL',
      contratadoRepasseId: tele,
    });

    const pagina = await repo.listar({ pagina: 1, porPagina: 10 });
    expect(pagina.total).toBe(2);
    expect(pagina.itens[1]).toMatchObject({
      contratadoRepasseId: tele,
      contratadoRepasseNome: '001 TELEIMAGEM',
    });
    expect((await repo.listar({ busca: 'radio', pagina: 1, porPagina: 10 })).total).toBe(1);
    expect(
      (await repo.listar({ busca: '12.345.678/0001-90', pagina: 1, porPagina: 10 })).total,
    ).toBe(1);
    expect(await repo.consolidadosEm(tele)).toEqual(['002 RADIOLOGIA NACIONAL']);
    expect((await repo.buscarPorRazaoSocial('001 teleimagem'))?.id).toBe(tele);
  });

  it('não exclui contratado com cliente', async () => {
    const id = await repo.criar({ ...base, razaoSocial: 'TELE' });
    await db
      .insert(schema.clientes)
      .values({ nome: 'CLINICA', chaveNormalizada: 'clinica', contratadoId: id });

    expect(await repo.excluir(id)).toBe(false);
  });
});
