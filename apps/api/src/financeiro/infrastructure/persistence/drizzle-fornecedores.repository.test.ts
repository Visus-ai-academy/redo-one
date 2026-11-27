import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { type DadosFornecedor, FORNECEDOR_VAZIO } from '../../domain/fornecedor';
import { DrizzleCategoriasRepository } from './drizzle-categorias.repository';
import { DrizzleFornecedoresRepository } from './drizzle-fornecedores.repository';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;
const pj = (parcial: Partial<DadosFornecedor> = {}): DadosFornecedor => ({
  ...FORNECEDOR_VAZIO,
  razaoSocial: 'Ômega Contábil',
  cnpj: '12345678000190',
  ...parcial,
});

describe.skipIf(!url)('DrizzleFornecedoresRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleFornecedoresRepository;
  let categorias: DrizzleCategoriasRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleFornecedoresRepository(db);
    categorias = new DrizzleCategoriasRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table fornecedores, categorias_financeiras cascade`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lista com a categoria padrão (com o grupo) e o CPF só com os dois últimos dígitos', async () => {
    const servicos = await categorias.criar({
      tipo: 'despesa',
      nome: 'Serviços',
      paiId: null,
      codigoContabil: null,
      ativa: true,
    });
    const contab = await categorias.criar({
      tipo: 'despesa',
      nome: 'Contabilidade',
      paiId: servicos,
      codigoContabil: null,
      ativa: true,
    });
    await repo.criar(pj({ categoriaPadraoId: contab }));
    await repo.criar(
      pj({
        tipoPessoa: 'PF',
        razaoSocial: 'Ana Prado',
        cnpj: null,
        cpf: '12345678909',
        ativo: false,
      }),
    );

    const pagina = await repo.listar({
      situacao: 'todas',
      categoria: 'todas',
      pagina: 1,
      porPagina: 10,
    });
    expect(pagina.total).toBe(2);
    expect(pagina.itens).toEqual([
      expect.objectContaining({ razaoSocial: 'Ana Prado', cnpj: null, cpfFinal: '09' }),
      expect.objectContaining({
        razaoSocial: 'Ômega Contábil',
        categoriaPadraoNome: 'Serviços › Contabilidade',
        cpfFinal: null,
      }),
    ]);
    expect(JSON.stringify(pagina.itens)).not.toContain('12345678909');

    const daCategoria = await repo.listar({
      situacao: 'ativas',
      categoria: { id: contab },
      pagina: 1,
      porPagina: 10,
    });
    expect(daCategoria.itens.map((i) => i.razaoSocial)).toEqual(['Ômega Contábil']);
  });

  it('busca por nome, pelo CNPJ inteiro e pelo CPF inteiro (nunca por pedaço do CPF)', async () => {
    await repo.criar(pj({ nomeFantasia: 'Contabilidade Ômega' }));
    await repo.criar(
      pj({ tipoPessoa: 'PF', razaoSocial: 'Ana Prado', cnpj: null, cpf: '12345678909' }),
    );
    const buscar = (busca: string) =>
      repo
        .listar({ situacao: 'todas', categoria: 'todas', busca, pagina: 1, porPagina: 10 })
        .then((p) => p.itens.map((i) => i.razaoSocial));

    expect(await buscar('contabilidade')).toEqual(['Ômega Contábil']);
    expect(await buscar('12.345.678/0001-90')).toEqual(['Ômega Contábil']);
    expect(await buscar('123.456.789-09')).toEqual(['Ana Prado']);
    expect(await buscar('45678')).toEqual([]);
  });

  it('lê o cadastro completo e acha pelo documento; o banco não deixa repetir o CNPJ', async () => {
    const id = await repo.criar(
      pj({ cep: '01310100', uf: 'SP', tipoChavePix: 'CNPJ', chavePix: '12345678000190' }),
    );

    expect(await repo.buscar(id)).toMatchObject({ id, cep: '01310100', tipoChavePix: 'CNPJ' });
    expect(await repo.buscarPorDocumento({ cnpj: '12345678000190' })).toEqual({
      id,
      razaoSocial: 'Ômega Contábil',
    });
    await expect(repo.criar(pj({ razaoSocial: 'Outro' }))).rejects.toThrow();
    await expect(repo.criar(pj({ cnpj: null }))).rejects.toThrow();
  });

  it('a categoria padrão em uso não se exclui; o fornecedor se exclui', async () => {
    const contab = await categorias.criar({
      tipo: 'despesa',
      nome: 'Contabilidade',
      paiId: null,
      codigoContabil: null,
      ativa: true,
    });
    const id = await repo.criar(pj({ categoriaPadraoId: contab }));

    expect(await categorias.excluir(contab)).toBe(false);
    expect(await repo.excluir(id)).toBe(true);
    expect(await repo.buscar(id)).toBeNull();
  });
});
