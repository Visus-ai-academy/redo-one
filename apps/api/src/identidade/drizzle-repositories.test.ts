import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { DrizzleTentativasLoginRepository } from './autenticacao/drizzle-tentativas-login.repository';
import { DrizzleGestaoPapeisRepository } from './papeis/drizzle-gestao-papeis.repository';
import { DrizzlePapeisRepository } from './papeis/drizzle-papeis.repository';
import { DrizzleTokensSenhaRepository } from './senha/drizzle-tokens-senha.repository';
import { DrizzleSessoesRepository } from './sessoes/drizzle-sessoes.repository';
import { DrizzleGestaoUsuariosRepository } from './usuarios/drizzle-gestao-usuarios.repository';
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
    await runMigrations({ pgPool: pool });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table tokens_senha, tentativas_login, sessoes, usuarios, papeis_permissoes, papeis cascade`,
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

  it('acha a sessão pelo hash do token, com o dono, e renova e encerra', async () => {
    const repo = new DrizzleSessoesRepository(db);
    const criada = new Date('2026-11-13T12:00:00Z');
    await repo.criar({
      usuarioId,
      tokenHash: 'hash-do-token',
      criadaEm: criada,
      expiraEm: new Date('2026-11-20T12:00:00Z'),
      expiraAbsolutoEm: new Date('2026-12-13T12:00:00Z'),
      ip: null,
      userAgent: null,
    });

    const sessao = await repo.buscarPorTokenHash('hash-do-token');
    expect(sessao).toMatchObject({
      usuarioId,
      encerradaEm: null,
      usuario: { nome: 'Maria Souza', email: 'maria@empresa.com.br', papelId, ativo: true },
    });
    await expect(repo.buscarPorTokenHash('outro')).resolves.toBeNull();

    const depois = new Date('2026-11-15T12:00:00Z');
    await repo.renovar(sessao?.id ?? '', new Date('2026-11-22T12:00:00Z'), depois);
    await repo.encerrar(sessao?.id ?? '', depois);
    await expect(repo.buscarPorTokenHash('hash-do-token')).resolves.toMatchObject({
      expiraEm: new Date('2026-11-22T12:00:00Z'),
      ultimoUsoEm: depois,
      encerradaEm: depois,
    });
  });

  it('lê o acesso do papel: lista de permissões ou acesso total', async () => {
    const repo = new DrizzlePapeisRepository(db);
    await db.insert(schema.papeisPermissoes).values([
      { papelId, permissao: 'repasse.ver' },
      { papelId, permissao: 'faturamento.ver' },
    ]);
    const admin = primeira(
      await db
        .insert(schema.papeis)
        .values({ nome: 'Administrador', acessoTotal: true })
        .returning(),
    );

    const financeiro = await repo.acessoDoPapel(papelId);
    expect(financeiro.acessoTotal).toBe(false);
    expect(financeiro.permissoes.sort()).toEqual(['faturamento.ver', 'repasse.ver']);
    await expect(repo.acessoDoPapel(admin.id)).resolves.toEqual({
      acessoTotal: true,
      permissoes: [],
    });
  });

  it('gestão de papéis: cria, lista com totais, busca por nome, atualiza e exclui', async () => {
    const repo = new DrizzleGestaoPapeisRepository(db);

    const id = await repo.criar({
      nome: 'Operação',
      descricao: 'Fila',
      permissoes: ['distribuicao.ver', 'distribuicao.rodada.iniciar'],
    });
    await expect(repo.buscarPorNome('OPERAÇÃO')).resolves.toEqual({ id });
    await expect(repo.buscar(id)).resolves.toMatchObject({
      nome: 'Operação',
      totalUsuarios: 0,
      permissoes: ['distribuicao.rodada.iniciar', 'distribuicao.ver'],
    });

    await repo.atualizar(id, { nome: 'Operação 2', descricao: null, permissoes: ['sla.ver'] });
    const lista = await repo.listar();
    expect(lista.find((p) => p.id === id)).toMatchObject({
      nome: 'Operação 2',
      totalPermissoes: 1,
    });
    expect(lista.find((p) => p.id === papelId)).toMatchObject({ totalUsuarios: 1 });

    await repo.excluir(id);
    await expect(repo.buscar(id)).resolves.toBeNull();
  });

  it('encerra só as sessões abertas dos usuários do papel', async () => {
    const repo = new DrizzleSessoesRepository(db);
    const base = {
      usuarioId,
      criadaEm: new Date('2026-11-13T12:00:00Z'),
      expiraEm: new Date('2026-11-20T12:00:00Z'),
      expiraAbsolutoEm: new Date('2026-12-13T12:00:00Z'),
      ip: null,
      userAgent: null,
    };
    await repo.criar({ ...base, tokenHash: 'a' });
    await repo.criar({ ...base, tokenHash: 'b' });

    await expect(repo.encerrarDoPapel(papelId, new Date('2026-11-14T12:00:00Z'))).resolves.toBe(2);
    await expect(repo.encerrarDoPapel(papelId, new Date('2026-11-15T12:00:00Z'))).resolves.toBe(0);
  });

  it('tokens de senha: emite com o e-mail na fila, substitui o anterior e vale uma vez', async () => {
    const repo = new DrizzleTokensSenhaRepository(db);
    const email = { para: 'maria@empresa.com.br', assunto: 'Nova senha', texto: 't', html: 'h' };
    const base = {
      usuarioId,
      tipo: 'recuperacao' as const,
      criadoEm: new Date('2026-11-13T12:00:00Z'),
      expiraEm: new Date('2026-11-13T13:00:00Z'),
      criadoPorId: null,
    };

    await repo.emitir({ ...base, tokenHash: 'primeiro' }, email);
    await repo.emitir({ ...base, tokenHash: 'segundo' }, email);

    await expect(repo.buscarPorHash('primeiro')).resolves.toMatchObject({ usadoEm: base.criadoEm });
    const segundo = await repo.buscarPorHash('segundo');
    expect(segundo).toMatchObject({
      tipo: 'recuperacao',
      usadoEm: null,
      usuario: { nome: 'Maria Souza', papelNome: 'Financeiro', ativo: true },
      convidadoPorNome: null,
    });
    await expect(repo.ultimaEmissao(usuarioId, 'recuperacao')).resolves.toEqual(base.criadoEm);
    const jobs = await db.execute(
      sql`select count(*)::int as total from graphile_worker.jobs where task_identifier = 'email.enviar'`,
    );
    expect(jobs.rows[0]).toMatchObject({ total: 2 });

    await expect(repo.usar(segundo?.id ?? '', usuarioId, 'hash-novo', base.criadoEm)).resolves.toBe(
      true,
    );
    await expect(repo.usar(segundo?.id ?? '', usuarioId, 'outro', base.criadoEm)).resolves.toBe(
      false,
    );
    await expect(
      new DrizzleUsuariosRepository(db).buscarParaLogin({ cpf: '12345678901' }),
    ).resolves.toMatchObject({
      senhaHash: 'hash-novo',
    });
  });

  it('gestão de usuários: convida (conta, token e job juntos), filtra por situação e mascara o CPF', async () => {
    const repo = new DrizzleGestaoUsuariosRepository(db);
    const agora = new Date('2026-11-13T12:00:00Z');

    const id = await repo.convidar(
      { nome: 'Ana Lima', email: 'ana@empresa.com.br', cpf: null, papelId },
      {
        tipo: 'convite',
        tokenHash: 'convite-ana',
        criadoEm: agora,
        expiraEm: new Date('2026-11-20T12:00:00Z'),
        criadoPorId: usuarioId,
      },
      () => ({ para: 'ana@empresa.com.br', assunto: 'Convite', texto: 't', html: 'h' }),
    );
    await expect(
      new DrizzleTokensSenhaRepository(db).buscarPorHash('convite-ana'),
    ).resolves.toMatchObject({
      usuarioId: id,
      convidadoPorNome: 'Maria Souza',
    });
    await expect(repo.existeEmail('ana@empresa.com.br')).resolves.toBe(true);

    const pendentes = await repo.listar({
      situacao: 'convite_pendente',
      pagina: 1,
      porPagina: 25,
      agora,
    });
    expect(pendentes).toMatchObject({ total: 1, itens: [{ id, situacao: 'convite_pendente' }] });
    const busca = await repo.listar({ busca: 'mari', pagina: 1, porPagina: 25, agora });
    expect(busca.itens.map((u) => u.nome)).toEqual(['Maria Souza']);

    await repo.definirAtivo(usuarioId, false);
    await expect(repo.buscar(usuarioId, agora)).resolves.toMatchObject({
      situacao: 'desativado',
      cpfFinal: '01',
      papel: { id: papelId, nome: 'Financeiro' },
    });
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
