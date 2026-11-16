import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleMedicosRepository } from './drizzle-medicos.repository';
import type { DadosMedico } from './medicos.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleMedicosRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleMedicosRepository;
  let nivel2: string;

  const dados = (nome: string, extra: Partial<DadosMedico> = {}) => ({
    nome,
    chaveNormalizada: nome.toLowerCase(),
    crm: null,
    idMobilemed: null,
    email: null,
    telefone: null,
    ativo: true,
    ocultoDashboards: false,
    senior: false,
    fellowship: false,
    funcao: null,
    nivelId: null,
    dataInicioVinculo: null,
    observacoes: null,
    ...extra,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleMedicosRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table medicos, niveis_medico, equipes cascade`);
    const [n] = await db.insert(schema.niveisMedico).values({ nome: 'Nível 2' }).returning();
    nivel2 = n?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava e lê o detalhe com nível, apelidos e equipes', async () => {
    const id = await repo.criar(
      dados('augusto lima', {
        crm: '1234',
        idMobilemed: 77,
        funcao: 'STAFF',
        nivelId: nivel2,
        dataInicioVinculo: '2024-03-01',
        senior: true,
      }),
    );
    await repo.criarAlias(id, {
      nomeOrigem: 'Dr. A. Lima',
      chaveNormalizada: 'a lima',
      observacoes: null,
    });
    const [eq1] = await db.insert(schema.equipes).values({ nome: 'Equipe 1' }).returning();
    await db.insert(schema.equipesMembros).values({ equipeId: eq1?.id ?? '', medicoId: id });

    expect(await repo.buscar(id)).toMatchObject({
      id,
      nome: 'augusto lima',
      crm: '1234',
      idMobilemed: 77,
      funcao: 'STAFF',
      senior: true,
      dataInicioVinculo: '2024-03-01',
      nivel: { id: nivel2, nome: 'Nível 2' },
      aliases: [
        {
          nomeOrigem: 'Dr. A. Lima',
          origem: 'manual',
          verificadoManualmente: true,
          observacoes: null,
        },
      ],
      equipes: [{ id: eq1?.id, nome: 'Equipe 1' }],
    });
    expect(await repo.buscar('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('lista pela chave, com nível e total de apelidos, filtrando por busca, nível e equipe', async () => {
    const carla = await repo.criar(dados('carla souza', { crm: '999', nivelId: nivel2 }));
    const bruno = await repo.criar(dados('bruno alves', { idMobilemed: 42 }));
    await repo.criar(dados('ana reis', { ativo: false }));
    await repo.criarAlias(carla, {
      nomeOrigem: 'C Souza',
      chaveNormalizada: 'c souza',
      observacoes: null,
    });
    const [eq1] = await db.insert(schema.equipes).values({ nome: 'Equipe 1' }).returning();
    await db.insert(schema.equipesMembros).values({ equipeId: eq1?.id ?? '', medicoId: bruno });

    const todos = await repo.listar({ pagina: 1, porPagina: 2 });
    expect(todos.total).toBe(3);
    expect(todos.itens.map((m) => m.nome)).toEqual(['ana reis', 'bruno alves']);

    const porCrm = await repo.listar({ busca: '999', pagina: 1, porPagina: 10 });
    expect(porCrm.itens).toEqual([
      expect.objectContaining({
        id: carla,
        nivel: { id: nivel2, nome: 'Nível 2' },
        totalAliases: 1,
      }),
    ]);
    expect((await repo.listar({ busca: '42', pagina: 1, porPagina: 10 })).itens[0]?.id).toBe(bruno);
    expect((await repo.listar({ busca: 'SOUZ', pagina: 1, porPagina: 10 })).total).toBe(1);
    expect((await repo.listar({ nivelId: nivel2, pagina: 1, porPagina: 10 })).total).toBe(1);
    expect((await repo.listar({ equipeId: eq1?.id, pagina: 1, porPagina: 10 })).itens[0]?.id).toBe(
      bruno,
    );
    expect((await repo.listar({ ativo: false, pagina: 1, porPagina: 10 })).total).toBe(1);
  });

  it('busca pelo nome sem acento, maiúscula nem "Dr.", pela chave do médico', async () => {
    const joao = await repo.criar({
      ...dados('Dr. João Paulo Ávila'),
      chaveNormalizada: 'joao paulo avila',
    });
    await repo.criar(dados('bruno alves'));

    for (const busca of ['joao', 'JOÃO', 'Dr. João Paulo', 'avila']) {
      const pagina = await repo.listar({ busca, pagina: 1, porPagina: 10 });
      expect(
        pagina.itens.map((m) => m.id),
        busca,
      ).toEqual([joao]);
    }
  });

  it('acha pela chave e pelo id da MobileMed', async () => {
    const id = await repo.criar(dados('ana reis', { idMobilemed: 5 }));

    expect(await repo.buscarPorChave('ana reis')).toEqual({ id, nome: 'ana reis' });
    expect(await repo.buscarPorIdMobilemed(5)).toEqual({ id, nome: 'ana reis' });
    expect(await repo.buscarPorChave('outro')).toBeNull();
  });

  it('atualiza', async () => {
    const id = await repo.criar(dados('ana reis'));

    await repo.atualizar(id, dados('ana reis', { ocultoDashboards: true, nivelId: nivel2 }));

    expect(await repo.buscar(id)).toMatchObject({ ocultoDashboards: true, nivel: { id: nivel2 } });
  });

  it('apelidos: acha de qualquer médico, só exclui pelo médico dono', async () => {
    const ana = await repo.criar(dados('ana reis'));
    const bruno = await repo.criar(dados('bruno alves'));
    const alias = await repo.criarAlias(ana, {
      nomeOrigem: 'A Reis',
      chaveNormalizada: 'a reis',
      observacoes: 'ok',
    });

    expect(await repo.buscarAlias('a reis')).toEqual({
      id: alias,
      medicoId: ana,
      medicoNome: 'ana reis',
    });
    expect(await repo.buscarAliasDoMedico(bruno, alias)).toBeNull();
    expect(await repo.buscarAliasDoMedico(ana, alias)).toMatchObject({ nomeOrigem: 'A Reis' });

    await repo.excluirAlias(alias);
    expect(await repo.buscarAlias('a reis')).toBeNull();
  });

  it('exclui junto os apelidos e o pagamento', async () => {
    const id = await repo.criar(dados('ana reis'));
    await repo.criarAlias(id, {
      nomeOrigem: 'A Reis',
      chaveNormalizada: 'a reis',
      observacoes: null,
    });
    await db.insert(schema.medicosDadosPagamento).values({ medicoId: id, cpf: '12345678901' });

    expect(await repo.excluir(id)).toBe(true);
    expect(await repo.buscar(id)).toBeNull();
    expect(await db.select().from(schema.medicosAliases)).toEqual([]);
    expect(await db.select().from(schema.medicosDadosPagamento)).toEqual([]);
  });

  it('nível em uso não sai do banco', async () => {
    await repo.criar(dados('ana reis', { nivelId: nivel2 }));

    await expect(db.delete(schema.niveisMedico)).rejects.toThrow();
  });
});
