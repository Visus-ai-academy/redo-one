import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleListaRepository } from '../../catalogo/listas/drizzle-lista.repository';
import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { TABELA_NIVEIS } from '../niveis/tabela';
import { DrizzlePagamentoMedicoRepository } from '../pagamento/drizzle-pagamento-medico.repository';
import { DrizzleEquipesRepository } from './drizzle-equipes.repository';
import type { EquipesAlteradas } from './equipes-alteradas';

const url = process.env.TEST_DATABASE_URL;

const semAviso: EquipesAlteradas = { aoAlterar: async () => undefined };

describe.skipIf(!url)('repositórios de equipes, níveis e pagamento', () => {
  let pool: Pool;
  let db: Database;
  let ana: string;
  let bruno: string;

  const equipe = (nome: string, medicoIds: string[]) => ({
    nome,
    descricao: null,
    cor: '#1F7A4D',
    ordem: 1,
    ativo: true,
    plantao: true,
    medicoIds,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table medicos, niveis_medico, equipes cascade`);
    const [a, b] = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana Reis', chaveNormalizada: 'ana reis' },
        { nome: 'Bruno Alves', chaveNormalizada: 'bruno alves' },
      ])
      .returning();
    ana = a?.id ?? '';
    bruno = b?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('alterar a equipe avisa quem depende dela na mesma transação; se o aviso falha, nada muda', async () => {
    const avisos: unknown[] = [];
    const repo = new DrizzleEquipesRepository(db, {
      aoAlterar: async (tx) => {
        avisos.push(tx);
      },
    });
    const id = await repo.criar(equipe('Equipe 1', [ana]));
    expect(avisos).toHaveLength(0);
    await repo.atualizar(id, equipe('Equipe 1', [ana, bruno]));
    expect(avisos).toHaveLength(1);
    // O aviso recebe a transação, não o banco: enfileirar e trocar os membros andam juntos.
    expect(avisos[0]).not.toBe(db);

    const falha = new DrizzleEquipesRepository(db, {
      aoAlterar: async () => {
        throw new Error('fila fora');
      },
    });
    await expect(falha.atualizar(id, equipe('Equipe 1', [bruno]))).rejects.toThrow('fila fora');
    expect((await repo.buscar(id))?.medicoIds.sort()).toEqual([ana, bruno].sort());
  });

  it('equipe: grava e troca os membros junto, e lista com eles', async () => {
    const repo = new DrizzleEquipesRepository(db, semAviso);
    const id = await repo.criar(equipe('Equipe 1', [ana, bruno]));

    expect(await repo.buscar(id)).toMatchObject({
      nome: 'Equipe 1',
      plantao: true,
      medicoIds: [ana, bruno].sort(),
    });

    await repo.atualizar(id, equipe('Equipe 1', [bruno]));
    expect((await repo.listar({ pagina: 1, porPagina: 10 })).itens).toEqual([
      expect.objectContaining({ id, medicoIds: [bruno] }),
    ]);

    await repo.atualizar(id, equipe('Equipe 1', []));
    expect((await repo.buscar(id))?.medicoIds).toEqual([]);
    expect(await repo.excluir(id)).toBe(true);
  });

  it('nível: lista do catálogo; em uso, não exclui', async () => {
    const repo = new DrizzleListaRepository(db, TABELA_NIVEIS);
    const id = await repo.criar({
      nome: 'Nível 1',
      descricao: null,
      cor: null,
      ordem: 1,
      ativo: true,
    });
    await db.update(schema.medicos).set({ nivelId: id });

    expect(await repo.buscarPorNome('nível 1')).toEqual({ id });
    expect(await repo.excluir(id)).toBe(false);
  });

  it('pagamento: nulo antes do primeiro salvar; salvar cria e depois substitui', async () => {
    const repo = new DrizzlePagamentoMedicoRepository(db);
    const vazio = {
      cpf: null,
      cnpj: null,
      razaoSocial: null,
      tipoChavePix: null,
      chavePix: null,
      socio: null,
      optanteSimples: null,
    };

    expect(await repo.buscar(ana)).toBeNull();
    await repo.salvar(ana, { ...vazio, cpf: '12345678901', socio: true });
    await repo.salvar(ana, { ...vazio, tipoChavePix: 'EMAIL', chavePix: 'a@b.com' });

    expect(await repo.buscar(ana)).toEqual({
      ...vazio,
      tipoChavePix: 'EMAIL',
      chavePix: 'a@b.com',
    });
    expect(await repo.buscar(bruno)).toBeNull();
  });
});
