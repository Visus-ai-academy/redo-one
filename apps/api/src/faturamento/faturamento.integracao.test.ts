import { resolve } from 'node:path';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PG_POOL } from '../database/database';
import { DatabaseModule } from '../database/database.module';
import * as schema from '../database/schema';
import { IdentidadeModule } from '../identidade/identidade.module';
import { Argon2PasswordHasher } from '../identidade/senha/argon2-password-hasher';
import { FaturamentoModule } from './faturamento.module';

// De ponta a ponta: login real, guard de permissão e as rotas do faturamento contra o Postgres de
// teste. Sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

const SENHA = 'senha-de-teste-1';
const PREFIXO = 'faturamento-403';

describe.skipIf(!url)('permissões das rotas do faturamento (HTTP real)', () => {
  let pool: Pool;
  let app: INestApplication;
  let base: string;
  const usuarios: string[] = [];
  const papeis: string[] = [];
  let clienteId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    await runMigrations({ pgPool: pool });

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuditoriaModule,
        IdentidadeModule,
        FaturamentoModule,
      ],
    })
      .overrideProvider(PG_POOL)
      .useValue(new Pool({ connectionString: url }))
      .compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
    const nome = `${PREFIXO}-cliente-${Math.random()}`;
    const [cliente] = await db
      .insert(schema.clientes)
      .values({ nome, chaveNormalizada: nome })
      .returning();
    if (!cliente) throw new Error('cliente não criado');
    clienteId = cliente.id;
  });

  afterAll(async () => {
    const db = drizzle({ client: pool, schema });
    if (clienteId) await db.delete(schema.clientes).where(eq(schema.clientes.id, clienteId));
    if (usuarios.length) {
      await db.execute(sql`delete from sessoes where usuario_id in ${usuarios}`);
      await db
        .delete(schema.usuariosPapeis)
        .where(inArray(schema.usuariosPapeis.usuarioId, usuarios));
      await db.delete(schema.usuarios).where(inArray(schema.usuarios.id, usuarios));
    }
    if (papeis.length) {
      await db
        .delete(schema.papeisPermissoes)
        .where(inArray(schema.papeisPermissoes.papelId, papeis));
      await db.delete(schema.papeis).where(inArray(schema.papeis.id, papeis));
    }
    await app?.close();
    await pool?.end();
  });

  /** Usuário ativo com um papel que tem só estas permissões; devolve o cookie do login real. */
  const entrarCom = async (permissoes: string[]) => {
    const db = drizzle({ client: pool, schema });
    const sufixo = Math.random().toString(36).slice(2);
    const [papel] = await db
      .insert(schema.papeis)
      .values({ nome: `${PREFIXO} ${sufixo}` })
      .returning();
    if (!papel) throw new Error('papel não criado');
    papeis.push(papel.id);
    await db
      .insert(schema.papeisPermissoes)
      .values(permissoes.map((permissao) => ({ papelId: papel.id, permissao })));
    const email = `${PREFIXO}-${sufixo}@exemplo.com`;
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({
        nome: 'Usuário de teste',
        email,
        senhaHash: await new Argon2PasswordHasher().hash(SENHA),
      })
      .returning();
    if (!usuario) throw new Error('usuário não criado');
    usuarios.push(usuario.id);
    await db.insert(schema.usuariosPapeis).values({ usuarioId: usuario.id, papelId: papel.id });

    const login = await fetch(`${base}/sessao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: email, senha: SENHA }),
    });
    expect(login.status).toBe(201);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('login sem cookie');
    return cookie;
  };

  const pedir = (cookie: string, metodo: string, caminho: string, corpo?: unknown) =>
    fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { cookie, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });

  const vigencia = {
    clienteId: null,
    desde: '2999-01',
    usaPadrao: false,
    dia: 7,
    ultimoDia: false,
    mes: 'seguinte',
    consideraExame: true,
  };

  it('só com faturamento.ver: lê, mas toda ação responde 403', async () => {
    const cookie = await entrarCom(['faturamento.ver']);

    expect((await pedir(cookie, 'GET', '/faturamento/competencias')).status).toBe(200);
    expect((await pedir(cookie, 'GET', '/faturamento/cortes')).status).toBe(200);
    for (const acao of ['fechar', 'reabrir', 'travar', 'destravar']) {
      const resposta = await pedir(cookie, 'POST', `/faturamento/competencias/2026-10/${acao}`);
      expect(resposta.status).toBe(403);
    }
    expect((await pedir(cookie, 'POST', '/faturamento/cortes/previa', vigencia)).status).toBe(403);
    expect((await pedir(cookie, 'POST', '/faturamento/cortes', vigencia)).status).toBe(403);
  });

  it('sem faturamento.ver: a lista responde 403', async () => {
    const cookie = await entrarCom(['escala.ver']);

    expect((await pedir(cookie, 'GET', '/faturamento/competencias')).status).toBe(403);
    expect((await pedir(cookie, 'GET', '/faturamento/cortes')).status).toBe(403);
  });

  describe('dados de faturamento do cliente', () => {
    const caminho = () => `/faturamento/clientes/${clienteId}/dados-fiscais`;
    const dados = {
      emailsNf: ['nf@cliente.com.br', 'administracao@teleimagem.com.br'],
      email: null,
      contatoNome: 'Ana',
      telefone: null,
      cep: '01310-100',
      logradouro: 'Av. Paulista',
      numero: '1000',
      complemento: null,
      bairro: null,
      cidade: 'São Paulo',
      uf: 'SP',
      bancoCodigo: null,
      bancoAgencia: null,
      bancoConta: null,
      exclusaoFiscal: false,
    };

    it('sem clientes.faturamento.ver: 403 ao ler', async () => {
      const cookie = await entrarCom(['clientes.ver', 'faturamento.ver']);
      expect((await pedir(cookie, 'GET', caminho())).status).toBe(403);
    });

    it('só ver: lê, mas salvar responde 403', async () => {
      const cookie = await entrarCom(['clientes.faturamento.ver']);
      expect((await pedir(cookie, 'GET', caminho())).status).toBe(200);
      expect((await pedir(cookie, 'PUT', caminho(), dados)).status).toBe(403);
    });

    it('com editar: salva, lê o que salvou (CEP só com dígitos) e audita', async () => {
      // O papel salvo pela tela leva o ver junto (editar implica ver).
      const cookie = await entrarCom(['clientes.faturamento.ver', 'clientes.faturamento.editar']);
      expect((await pedir(cookie, 'PUT', caminho(), dados)).status).toBe(204);
      const lido = (await (await pedir(cookie, 'GET', caminho())).json()) as Record<
        string,
        unknown
      >;
      expect(lido).toMatchObject({ ...dados, cep: '01310100', omieCodigoCliente: null });
      expect(lido.atualizadoPor).toBe('Usuário de teste');
      const db = drizzle({ client: pool, schema });
      const eventos = await db
        .select()
        .from(schema.eventosAuditoria)
        .where(eq(schema.eventosAuditoria.entidadeId, clienteId));
      expect(eventos.map((e) => [e.entidade, e.acao])).toEqual([
        ['cliente_dados_fiscais', 'alterado'],
      ]);
    });

    it('corpo fora do contrato: 400', async () => {
      const cookie = await entrarCom(['clientes.faturamento.editar']);
      const { exclusaoFiscal: _, ...semExclusao } = dados;
      expect((await pedir(cookie, 'PUT', caminho(), semExclusao)).status).toBe(400);
    });
  });
});
