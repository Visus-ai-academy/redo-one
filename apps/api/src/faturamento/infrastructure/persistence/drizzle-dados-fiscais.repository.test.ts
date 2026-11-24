import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DADOS_FISCAIS_VAZIOS } from '../../domain/dados-fiscais';
import { DrizzleDadosFiscaisRepository } from './drizzle-dados-fiscais.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleDadosFiscaisRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleDadosFiscaisRepository;
  let clienteId: string;
  let anaId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleDadosFiscaisRepository(db);
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Ana', email: `dados-fiscais-${Math.random()}@exemplo.com` })
      .returning();
    anaId = u?.id ?? '';
  });

  beforeEach(async () => {
    const nome = `CLIENTE_FISCAL_${Math.random()}`;
    const [cliente] = await db
      .insert(schema.clientes)
      .values({ nome, chaveNormalizada: nome })
      .returning();
    clienteId = cliente?.id ?? '';
  });

  afterAll(async () => {
    await db.delete(schema.clientes).where(sql`${schema.clientes.nome} like 'CLIENTE_FISCAL_%'`);
    await db.delete(schema.usuarios).where(sql`${schema.usuarios.email} like 'dados-fiscais-%'`);
    await pool.end();
  });

  it('cliente existe ou não', async () => {
    expect(await repo.clienteExiste(clienteId)).toBe(true);
    expect(await repo.clienteExiste('00000000-0000-4000-8000-000000000000')).toBe(false);
  });

  it('sem linha: nulo; salvar cria e salvar de novo troca, com quem e quando', async () => {
    expect(await repo.obter(clienteId)).toBeNull();
    const em = new Date('2026-11-24T18:00:00Z');
    await repo.salvar(
      clienteId,
      { ...DADOS_FISCAIS_VAZIOS, emailsNf: ['b@x.com', 'a@x.com'], cep: '01310100', uf: 'SP' },
      { usuarioId: anaId, em },
    );
    await repo.salvar(
      clienteId,
      { ...DADOS_FISCAIS_VAZIOS, emailsNf: ['b@x.com', 'a@x.com'], exclusaoFiscal: true },
      { usuarioId: anaId, em },
    );
    expect(await repo.obter(clienteId)).toEqual({
      dados: { ...DADOS_FISCAIS_VAZIOS, emailsNf: ['b@x.com', 'a@x.com'], exclusaoFiscal: true },
      omie: { codigoCliente: null, sincronizadoEm: null },
      atualizadoEm: em,
      atualizadoPor: 'Ana',
    });
  });

  it('salvar não mexe no que veio do Omie', async () => {
    const sincronizadoEm = new Date('2026-03-11T03:23:09.850Z');
    await db.insert(schema.clientesDadosFiscais).values({
      clienteId,
      omieCodigoCliente: '8556006877',
      omieSincronizadoEm: sincronizadoEm,
    });
    await repo.salvar(
      clienteId,
      { ...DADOS_FISCAIS_VAZIOS, email: 'a@x.com' },
      { usuarioId: anaId, em: new Date() },
    );
    expect((await repo.obter(clienteId))?.omie).toEqual({
      codigoCliente: '8556006877',
      sincronizadoEm,
    });
  });

  it('excluir o cliente leva os dados junto', async () => {
    await repo.salvar(clienteId, DADOS_FISCAIS_VAZIOS, { usuarioId: anaId, em: new Date() });
    await db.delete(schema.clientes).where(eq(schema.clientes.id, clienteId));
    expect(await repo.obter(clienteId)).toBeNull();
  });
});
