import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { DadosCategoria } from '../../domain/categoria-financeira';
import { DrizzleCategoriasRepository } from './drizzle-categorias.repository';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;
const base: DadosCategoria = {
  tipo: 'despesa',
  nome: 'X',
  paiId: null,
  codigoContabil: null,
  ativa: true,
};

describe.skipIf(!url)('DrizzleCategoriasRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleCategoriasRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleCategoriasRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table categorias_financeiras cascade`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lista em árvore: cada grupo e logo abaixo as categorias dele, com o nome do grupo', async () => {
    const pessoal = await repo.criar({ ...base, nome: 'Pessoal' });
    const ocupacao = await repo.criar({ ...base, nome: 'Ocupação', codigoContabil: '3.1' });
    await repo.criar({ ...base, nome: 'Condomínio', paiId: ocupacao });
    await repo.criar({ ...base, nome: 'Aluguel', paiId: ocupacao });
    await repo.criar({ ...base, nome: 'Encargos', paiId: pessoal, ativa: false });
    await repo.criar({ ...base, tipo: 'receita', nome: 'Laudos' });

    const pagina = await repo.listar({
      tipo: 'despesa',
      situacao: 'todas',
      pagina: 1,
      porPagina: 10,
    });
    expect(pagina.total).toBe(5);
    expect(pagina.itens.map((i) => [i.nome, i.grupoNome, i.totalFilhas])).toEqual([
      ['Ocupação', null, 2],
      ['Aluguel', 'Ocupação', 0],
      ['Condomínio', 'Ocupação', 0],
      ['Pessoal', null, 1],
      ['Encargos', 'Pessoal', 0],
    ]);

    const ativas = await repo.listar({
      tipo: 'despesa',
      situacao: 'ativas',
      pagina: 1,
      porPagina: 10,
    });
    expect(ativas.itens.map((i) => i.nome)).not.toContain('Encargos');
    const inativas = await repo.listar({
      tipo: 'despesa',
      situacao: 'inativas',
      pagina: 1,
      porPagina: 10,
    });
    expect(inativas.itens.map((i) => i.nome)).toEqual(['Encargos']);
  });

  it('busca pelo nome, pelo grupo ou pelo código, e pagina com o total', async () => {
    const ocupacao = await repo.criar({ ...base, nome: 'Ocupação', codigoContabil: '3.1' });
    await repo.criar({ ...base, nome: 'Aluguel', paiId: ocupacao, codigoContabil: '3.1.01' });
    await repo.criar({ ...base, nome: 'Software' });

    const peloGrupo = await repo.listar({
      tipo: 'despesa',
      situacao: 'todas',
      busca: 'ocupa',
      pagina: 1,
      porPagina: 1,
    });
    expect(peloGrupo.total).toBe(2);
    expect(peloGrupo.itens.map((i) => i.nome)).toEqual(['Ocupação']);
    const peloCodigo = await repo.listar({
      tipo: 'despesa',
      situacao: 'todas',
      busca: '3.1.01',
      pagina: 1,
      porPagina: 10,
    });
    expect(peloCodigo.itens.map((i) => i.nome)).toEqual(['Aluguel']);
  });

  it('acha pelo nome sem diferenciar maiúsculas, no mesmo grupo; o banco também não deixa repetir', async () => {
    const ocupacao = await repo.criar({ ...base, nome: 'Ocupação' });
    const aluguel = await repo.criar({ ...base, nome: 'Aluguel', paiId: ocupacao });

    expect(await repo.buscarPorNome('despesa', ocupacao, 'ALUGUEL')).toEqual({ id: aluguel });
    expect(await repo.buscarPorNome('despesa', null, 'aluguel')).toBeNull();
    await expect(repo.criar({ ...base, nome: 'ocupação' })).rejects.toThrow();
  });

  it('opções: só as ativas, do tipo pedido', async () => {
    await repo.criar({ ...base, nome: 'Aluguel' });
    await repo.criar({ ...base, nome: 'Velha', ativa: false });
    await repo.criar({ ...base, tipo: 'receita', nome: 'Laudos' });

    expect((await repo.opcoes('despesa')).map((o) => o.nome)).toEqual(['Aluguel']);
    expect((await repo.opcoes()).map((o) => o.nome)).toEqual(['Aluguel', 'Laudos']);
  });

  it('não exclui o grupo com categorias dentro; exclui a categoria solta', async () => {
    const ocupacao = await repo.criar({ ...base, nome: 'Ocupação' });
    const aluguel = await repo.criar({ ...base, nome: 'Aluguel', paiId: ocupacao });

    expect(await repo.excluir(ocupacao)).toBe(false);
    expect(await repo.excluir(aluguel)).toBe(true);
    expect(await repo.buscar(aluguel)).toBeNull();
  });
});
