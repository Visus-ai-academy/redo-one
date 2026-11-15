import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import type { DadosCliente } from './clientes.repository';
import { DrizzleClientesRepository } from './drizzle-clientes.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleClientesRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleClientesRepository;
  let tele: string;

  const dados = (nome: string, extra: Partial<DadosCliente> = {}) => ({
    nome,
    chaveNormalizada: nome.toLowerCase(),
    nomeFantasia: null,
    razaoSocial: null,
    tipoPessoa: 'PJ' as const,
    cnpj: null,
    cpf: null,
    contratadoId: tele,
    ativo: true,
    ocultoDashboards: false,
    observacoes: null,
    ...extra,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleClientesRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table clientes, contratados cascade`);
    const [c] = await db.insert(schema.contratados).values({ razaoSocial: 'TELE' }).returning();
    tele = c?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lista com contratado e total de apelidos, filtrando por busca, CNPJ e contratado', async () => {
    const prn = await repo.criar(
      dados('PRN', { nomeFantasia: 'Rede Nacional', cnpj: '12345678000190' }),
    );
    await repo.criar(dados('CEDIDIAG'));
    await repo.criarAlias(prn, {
      tipo: 'prefixo',
      padrao: 'PRN TELE_',
      chave: 'PRN TELE_',
      observacoes: null,
    });

    const pagina = await repo.listar({ pagina: 1, porPagina: 10 });
    expect(pagina.total).toBe(2);
    expect(pagina.itens[1]).toMatchObject({
      nome: 'PRN',
      contratado: { id: tele, razaoSocial: 'TELE' },
      totalAliases: 1,
    });
    expect((await repo.listar({ busca: 'nacional', pagina: 1, porPagina: 10 })).total).toBe(1);
    expect(
      (await repo.listar({ busca: '12.345.678/0001-90', pagina: 1, porPagina: 10 })).total,
    ).toBe(1);
    expect((await repo.listar({ contratadoId: tele, pagina: 1, porPagina: 10 })).total).toBe(2);
  });

  it('detalhe traz os apelidos; busca apelido e cliente pela chave', async () => {
    const prn = await repo.criar(dados('PRN'));
    const alias = await repo.criarAlias(prn, {
      tipo: 'exato',
      padrao: 'prn2',
      chave: 'PRN2',
      observacoes: 'x',
    });

    expect((await repo.buscar(prn))?.aliases).toEqual([
      { id: alias, tipo: 'exato', padrao: 'prn2', observacoes: 'x' },
    ]);
    expect(await repo.buscarAlias('exato', 'PRN2')).toEqual({
      id: alias,
      clienteId: prn,
      clienteNome: 'PRN',
    });
    expect(await repo.buscarAlias('prefixo', 'PRN2')).toBeNull();
    expect(await repo.buscarClientePorChave('prn')).toEqual({ id: prn, nome: 'PRN' });

    await repo.excluirAlias(alias);
    expect(await repo.buscarAliasDoCliente(prn, alias)).toBeNull();
  });

  it('excluir o cliente leva os apelidos junto', async () => {
    const prn = await repo.criar(dados('PRN'));
    await repo.criarAlias(prn, { tipo: 'exato', padrao: 'P', chave: 'P', observacoes: null });

    expect(await repo.excluir(prn)).toBe(true);
    expect(await db.select().from(schema.clientesAliases)).toEqual([]);
  });
  it('unifica: a unidade aponta o principal, o principal lista as unidades, e desfaz', async () => {
    const prn = await repo.criar(dados('PRN'));
    const unidade = await repo.criar(dados('PRN TELE_ARARAQUARA'));

    await repo.definirPrincipal(unidade, prn);

    expect(await repo.buscarVinculo(prn)).toMatchObject({ unificadoEm: null, totalUnidades: 1 });
    expect(await repo.buscarVinculo(unidade)).toMatchObject({
      unificadoEm: { id: prn, nome: 'PRN' },
      totalUnidades: 0,
    });
    expect((await repo.buscar(prn))?.unidades).toEqual([
      { id: unidade, nome: 'PRN TELE_ARARAQUARA' },
    ]);
    const { itens } = await repo.listar({ busca: 'ARARAQUARA', pagina: 1, porPagina: 10 });
    expect(itens[0]?.unificadoEm).toEqual({ id: prn, nome: 'PRN' });
    expect(await repo.excluir(prn)).toBe(false);

    await repo.definirPrincipal(unidade, null);
    expect((await repo.buscar(unidade))?.unificadoEm).toBeNull();
  });
});
