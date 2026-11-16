import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleSessoesRepository } from './drizzle-sessoes.repository';

// Roda contra um Postgres de verdade (banco só de teste). Sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

const CRIADA = new Date('2026-11-13T12:00:00Z');

describe.skipIf(!url)('DrizzleSessoesRepository.buscarParaAutenticar', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleSessoesRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleSessoesRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table sessoes, usuarios, papeis_permissoes, papeis cascade`);
  });

  async function sessaoDe(papel: { nome: string; acessoTotal?: boolean }, permissoes: string[]) {
    const [p] = await db.insert(schema.papeis).values(papel).returning();
    if (!p) throw new Error('papel não criado');
    if (permissoes.length) {
      await db
        .insert(schema.papeisPermissoes)
        .values(permissoes.map((permissao) => ({ papelId: p.id, permissao })));
    }
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Maria Souza', email: `${papel.nome}@empresa.com.br`, papelId: p.id })
      .returning();
    if (!u) throw new Error('usuário não criado');
    const tokenHash = `hash-${papel.nome}`;
    await repo.criar({
      usuarioId: u.id,
      tokenHash,
      criadaEm: CRIADA,
      expiraEm: new Date('2026-11-20T12:00:00Z'),
      expiraAbsolutoEm: new Date('2026-12-13T12:00:00Z'),
      ip: null,
      userAgent: null,
    });
    return { papelId: p.id, usuarioId: u.id, tokenHash };
  }

  it('traz sessão, dono, papel e permissões numa consulta só', async () => {
    const { papelId, usuarioId, tokenHash } = await sessaoDe({ nome: 'Financeiro' }, [
      'repasse.ver',
      'faturamento.ver',
    ]);

    const sessao = await repo.buscarParaAutenticar(tokenHash);

    expect(sessao).toMatchObject({
      usuarioId,
      expiraEm: new Date('2026-11-20T12:00:00Z'),
      expiraAbsolutoEm: new Date('2026-12-13T12:00:00Z'),
      ultimoUsoEm: CRIADA,
      encerradaEm: null,
      usuario: { nome: 'Maria Souza', email: 'Financeiro@empresa.com.br', papelId, ativo: true },
      acesso: { papel: 'Financeiro', acessoTotal: false },
    });
    expect(sessao?.acesso.permissoes.sort()).toEqual(['faturamento.ver', 'repasse.ver']);
  });

  it('papel de acesso total vem sem lista de permissões', async () => {
    const { tokenHash } = await sessaoDe({ nome: 'Administrador', acessoTotal: true }, [
      'sobra.ver',
    ]);

    await expect(repo.buscarParaAutenticar(tokenHash)).resolves.toMatchObject({
      acesso: { papel: 'Administrador', acessoTotal: true, permissoes: [] },
    });
  });

  it('papel sem permissões vem com lista vazia', async () => {
    const { tokenHash } = await sessaoDe({ nome: 'Leitor' }, []);

    await expect(repo.buscarParaAutenticar(tokenHash)).resolves.toMatchObject({
      acesso: { papel: 'Leitor', acessoTotal: false, permissoes: [] },
    });
  });

  it('devolve encerramento e situação do usuário para o autenticador recusar', async () => {
    const { usuarioId, tokenHash } = await sessaoDe({ nome: 'Financeiro' }, []);
    await db.update(schema.usuarios).set({ ativo: false }).where(sql`id = ${usuarioId}`);
    const [{ id } = { id: '' }] = await db.select({ id: schema.sessoes.id }).from(schema.sessoes);
    await repo.encerrar(id, CRIADA);

    await expect(repo.buscarParaAutenticar(tokenHash)).resolves.toMatchObject({
      encerradaEm: CRIADA,
      usuario: { ativo: false },
    });
    await expect(repo.buscarParaAutenticar('desconhecido')).resolves.toBeNull();
  });
});
