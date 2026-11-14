import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { ReferenciaInexistenteError } from '../comum/catalogo.errors';
import { DrizzleExamesRepository } from './drizzle-exames.repository';
import type { DadosExame } from './exames.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleExamesRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleExamesRepository;
  let ct: string;
  let neuro: string;

  const dados = (nome: string, extra: Partial<DadosExame> = {}) => ({
    nome,
    chaveNormalizada: nome.toLowerCase(),
    codigo: null,
    descricao: null,
    modalidadeId: null,
    especialidadeId: null,
    subespecialidadeId: null,
    categoriaId: null,
    prioridadeId: null,
    permiteQuebra: false,
    exigeRevisaoManual: false,
    ativo: true,
    ...extra,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleExamesRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table exames, modalidades, especialidades cascade`);
    const [m] = await db.insert(schema.modalidades).values({ codigo: 'CT' }).returning();
    const [e] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    ct = m?.id ?? '';
    neuro = e?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lista com os nomes dos cadastros ligados e filtra por busca e modalidade', async () => {
    await repo.criar(
      dados('TC CRANIO', { codigo: '123', modalidadeId: ct, especialidadeId: neuro }),
    );
    await repo.criar(dados('RX TORAX'));

    const pagina = await repo.listar({ modalidadeId: ct, pagina: 1, porPagina: 10 });
    expect(pagina).toMatchObject({
      total: 1,
      itens: [
        {
          nome: 'TC CRANIO',
          modalidade: { id: ct, nome: 'CT' },
          especialidade: { id: neuro, nome: 'NEURO' },
        },
      ],
    });
    expect((await repo.listar({ busca: 'torax', pagina: 1, porPagina: 10 })).total).toBe(1);
    expect((await repo.listar({ busca: '123', pagina: 1, porPagina: 10 })).total).toBe(1);
  });

  it('detalhe traz as regras de quebra; o destino de uma regra não se exclui', async () => {
    const origem = await repo.criar(dados('TC TORAX E ABDOME'));
    const destino = await repo.criar(dados('TC ABDOME'));
    const regra = await repo.criarRegraQuebra(origem, {
      exameDestinoId: destino,
      categoriaId: null,
      ativo: true,
    });

    expect((await repo.buscar(origem))?.regrasQuebra).toEqual([
      { id: regra, exameDestino: { id: destino, nome: 'TC ABDOME' }, categoria: null, ativo: true },
    ]);
    expect(await repo.excluir(destino)).toBe(false);
    await repo.atualizarRegraQuebra(regra, {
      exameDestinoId: destino,
      categoriaId: null,
      ativo: false,
    });
    expect((await repo.buscar(origem))?.regrasQuebra[0]?.ativo).toBe(false);
    expect(await repo.excluir(origem)).toBe(true);
  });

  it('cadastro ligado inexistente vira erro de domínio', async () => {
    await expect(
      repo.criar(dados('X', { modalidadeId: '00000000-0000-4000-8000-000000000000' })),
    ).rejects.toThrow(ReferenciaInexistenteError);
  });
});
