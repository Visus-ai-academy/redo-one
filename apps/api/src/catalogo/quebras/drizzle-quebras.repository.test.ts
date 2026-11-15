import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { ReferenciaInexistenteError } from '../comum/catalogo.errors';
import { DrizzleQuebrasRepository } from './drizzle-quebras.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleQuebrasRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleQuebrasRepository;
  let torax: string;
  let abdome: string;
  let onco: string;

  const exame = async (nome: string) => {
    const [e] = await db
      .insert(schema.exames)
      .values({ nome, chaveNormalizada: nome.toLowerCase() })
      .returning();
    return e?.id ?? '';
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleQuebrasRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table quebras_estudo, exames, categorias_exame cascade`);
    torax = await exame('TC TORAX');
    abdome = await exame('TC ABDOME');
    const [c] = await db.insert(schema.categoriasExame).values({ nome: 'ONCO' }).returning();
    onco = c?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('cria, acha pela chave, guarda as peças e lista com os nomes delas', async () => {
    const id = await repo.criar({
      estudoOrigem: 'TC TORAX E ABDOME',
      chaveNormalizada: 'tc torax e abdome',
    });
    await repo.criarPeca(id, { exameId: torax, categoriaId: null, ativo: true });
    const peca = await repo.criarPeca(id, { exameId: abdome, categoriaId: onco, ativo: false });

    expect(await repo.buscarPorChave('tc torax e abdome')).toEqual({
      id,
      estudoOrigem: 'TC TORAX E ABDOME',
    });
    expect(await repo.buscar(id)).toEqual({
      id,
      estudoOrigem: 'TC TORAX E ABDOME',
      chaveNormalizada: 'tc torax e abdome',
      exame: null,
      pecas: [
        {
          id: peca,
          exame: { id: abdome, nome: 'TC ABDOME' },
          categoria: { id: onco, nome: 'ONCO' },
          ativo: false,
        },
        expect.objectContaining({ exame: { id: torax, nome: 'TC TORAX' }, categoria: null }),
      ],
    });
    const { itens, total } = await repo.listar({ busca: 'abdome', pagina: 1, porPagina: 10 });
    expect(total).toBe(1);
    expect(itens[0]).toEqual({
      id,
      estudoOrigem: 'TC TORAX E ABDOME',
      exame: null,
      pecas: [
        { nome: 'TC ABDOME', ativo: false },
        { nome: 'TC TORAX', ativo: true },
      ],
    });
  });

  it('aponta o exame do cadastro com o mesmo nome do estudo', async () => {
    const proprio = await exame('TC TORAX E ABDOME');
    const id = await repo.criar({
      estudoOrigem: 'TC TÓRAX E ABDOME',
      chaveNormalizada: 'tc torax e abdome',
    });

    expect((await repo.buscar(id))?.exame).toEqual({ id: proprio, nome: 'TC TORAX E ABDOME' });
    expect((await repo.listar({ pagina: 1, porPagina: 10 })).itens[0]?.exame).toEqual({
      id: proprio,
      nome: 'TC TORAX E ABDOME',
    });
  });

  it('a busca acha também pelo nome da peça', async () => {
    const id = await repo.criar({
      estudoOrigem: 'RM CRANIO E SELA',
      chaveNormalizada: 'rm cranio e sela',
    });
    await repo.criarPeca(id, { exameId: torax, categoriaId: null, ativo: true });

    expect((await repo.listar({ busca: 'torax', pagina: 1, porPagina: 10 })).total).toBe(1);
  });

  it('altera e remove peça; excluir a quebra leva as peças; o exame da peça não se exclui', async () => {
    const id = await repo.criar({ estudoOrigem: 'X', chaveNormalizada: 'x' });
    const peca = await repo.criarPeca(id, { exameId: torax, categoriaId: null, ativo: true });

    await repo.atualizarPeca(peca, { exameId: abdome, categoriaId: onco, ativo: false });
    expect((await repo.buscar(id))?.pecas[0]).toMatchObject({ exame: { nome: 'TC ABDOME' } });
    await expect(db.delete(schema.exames).where(sql`id = ${abdome}`)).rejects.toThrow();
    await repo.excluirPeca(peca);
    expect((await repo.buscar(id))?.pecas).toEqual([]);

    await repo.criarPeca(id, { exameId: torax, categoriaId: null, ativo: true });
    await repo.excluir(id);
    expect(await repo.buscar(id)).toBeNull();
    expect(await db.select().from(schema.quebrasEstudoPecas)).toEqual([]);
  });

  it('busca o exame da peça; categoria inexistente vira erro de domínio', async () => {
    expect(await repo.buscarExame(torax)).toEqual({
      nome: 'TC TORAX',
      chaveNormalizada: 'tc torax',
    });
    expect(await repo.buscarExame('00000000-0000-4000-8000-000000000000')).toBeNull();
    const id = await repo.criar({ estudoOrigem: 'X', chaveNormalizada: 'x' });
    await expect(
      repo.criarPeca(id, {
        exameId: torax,
        categoriaId: '00000000-0000-4000-8000-000000000000',
        ativo: true,
      }),
    ).rejects.toThrow(ReferenciaInexistenteError);
  });
});
