import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { DrizzleTentativasLoginRepository } from './autenticacao/drizzle-tentativas-login.repository';
import { DrizzleSessoesRepository } from './sessoes/drizzle-sessoes.repository';
import { DrizzleUsuariosRepository } from './usuarios/drizzle-usuarios.repository';

// Roda contra um Postgres de verdade (ex.: o do docker-compose, num banco só de teste).
// Sem TEST_DATABASE_URL, os testes aparecem como "skipped".
const url = process.env.TEST_DATABASE_URL;

function primeira<T>(linhas: T[]): T {
  const [linha] = linhas;
  if (!linha) throw new Error('o insert não devolveu a linha');
  return linha;
}

describe.skipIf(!url)('repositórios Drizzle do contexto identidade', () => {
  let pool: Pool;
  let db: Database;
  let papelId: string;
  let usuarioId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table tentativas_login, sessoes, usuarios, papeis_permissoes, papeis cascade`,
    );
    papelId = primeira(
      await db.insert(schema.papeis).values({ nome: 'Financeiro' }).returning(),
    ).id;
    usuarioId = primeira(
      await db
        .insert(schema.usuarios)
        .values({
          nome: 'Maria Souza',
          email: 'maria@empresa.com.br',
          cpf: '12345678901',
          senhaHash: 'hash',
          papelId,
        })
        .returning(),
    ).id;
  });

  it('busca o usuário pelo e-mail e pelo CPF', async () => {
    const repo = new DrizzleUsuariosRepository(db);

    await expect(repo.buscarParaLogin({ email: 'maria@empresa.com.br' })).resolves.toMatchObject({
      id: usuarioId,
      papelId,
      senhaHash: 'hash',
      ativo: true,
      tentativasFalhas: 0,
      bloqueadoAte: null,
    });
    await expect(repo.buscarParaLogin({ cpf: '12345678901' })).resolves.toMatchObject({
      id: usuarioId,
    });
    await expect(repo.buscarParaLogin({ email: 'outra@empresa.com.br' })).resolves.toBeNull();
  });

  it('grava falhas e bloqueio, e o sucesso zera os dois', async () => {
    const repo = new DrizzleUsuariosRepository(db);
    const ate = new Date('2026-11-13T12:15:00Z');

    await repo.registrarFalha(usuarioId, 0, ate);
    await expect(repo.buscarParaLogin({ cpf: '12345678901' })).resolves.toMatchObject({
      bloqueadoAte: ate,
    });

    await repo.registrarSucesso(usuarioId);
    await expect(repo.buscarParaLogin({ cpf: '12345678901' })).resolves.toMatchObject({
      tentativasFalhas: 0,
      bloqueadoAte: null,
    });
  });

  it('cria a sessão com o hash do token', async () => {
    const criada = new Date('2026-11-13T12:00:00Z');

    await new DrizzleSessoesRepository(db).criar({
      usuarioId,
      tokenHash: 'abc123',
      criadaEm: criada,
      expiraEm: new Date('2026-11-20T12:00:00Z'),
      expiraAbsolutoEm: new Date('2026-12-13T12:00:00Z'),
      ip: '177.32.0.1',
      userAgent: 'Chrome',
    });

    const [sessao] = await db.select().from(schema.sessoes);
    expect(sessao).toMatchObject({ usuarioId, tokenHash: 'abc123', ultimoUsoEm: criada });
  });

  it('conta só as falhas do IP a partir do instante pedido', async () => {
    const repo = new DrizzleTentativasLoginRepository(db);
    const base = { usuarioId: null, userAgent: null };
    await repo.registrar({
      ...base,
      ip: '1.1.1.1',
      sucesso: false,
      em: new Date('2026-11-13T11:00:00Z'),
    });
    await repo.registrar({
      ...base,
      ip: '1.1.1.1',
      sucesso: false,
      em: new Date('2026-11-13T11:50:00Z'),
    });
    await repo.registrar({
      ...base,
      ip: '1.1.1.1',
      sucesso: true,
      em: new Date('2026-11-13T11:55:00Z'),
    });
    await repo.registrar({
      ...base,
      ip: '2.2.2.2',
      sucesso: false,
      em: new Date('2026-11-13T11:55:00Z'),
    });

    await expect(repo.contarFalhasPorIp('1.1.1.1', new Date('2026-11-13T11:45:00Z'))).resolves.toBe(
      1,
    );
  });
});
