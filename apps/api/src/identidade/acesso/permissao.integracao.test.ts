import { resolve } from 'node:path';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { PG_POOL } from '../../database/database';
import { DatabaseModule } from '../../database/database.module';
import * as schema from '../../database/schema';
import { IdentidadeModule } from '../identidade.module';
import { Argon2PasswordHasher } from '../senha/argon2-password-hasher';

// De ponta a ponta: login de verdade (POST /sessao), cookie, guard de autenticação e o
// PermissaoGuard reais contra o Postgres de teste. Sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

const SENHA = 'senha-de-teste-1';

describe.skipIf(!url)('permissão de leitura de uma tela (HTTP real)', () => {
  let pool: Pool;
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    const db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    await runMigrations({ pgPool: pool });

    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuditoriaModule,
        IdentidadeModule,
      ],
    })
      // O app usa um pool próprio no banco de teste (o DatabaseModule o fecha no app.close()).
      .overrideProvider(PG_POOL)
      .useValue(new Pool({ connectionString: url }))
      .compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query(
      'truncate table tentativas_login, sessoes, usuarios, papeis_permissoes, papeis cascade',
    );
  });

  /** Usuário ativo com um papel que tem só estas permissões; devolve o cookie do login real. */
  const entrarCom = async (permissoes: string[]) => {
    const db = drizzle({ client: pool, schema });
    const [papel] = await db.insert(schema.papeis).values({ nome: 'Papel de teste' }).returning();
    if (!papel) throw new Error('papel não criado');
    if (permissoes.length) {
      await db
        .insert(schema.papeisPermissoes)
        .values(permissoes.map((permissao) => ({ papelId: papel.id, permissao })));
    }
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({
        nome: 'Usuário de teste',
        email: 'teste-403@exemplo.com',
        senhaHash: await new Argon2PasswordHasher().hash(SENHA),
      })
      .returning();
    if (!usuario) throw new Error('usuário não criado');
    await db.insert(schema.usuariosPapeis).values({ usuarioId: usuario.id, papelId: papel.id });

    const login = await fetch(`${base}/sessao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: 'teste-403@exemplo.com', senha: SENHA }),
    });
    expect(login.status).toBe(201);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('login sem cookie');
    return cookie;
  };

  it('autenticado sem usuarios.ver: GET /usuarios responde 403', async () => {
    const cookie = await entrarCom(['escala.ver']);

    // Autenticado de verdade: a própria sessão abre.
    expect((await fetch(`${base}/sessao`, { headers: { cookie } })).status).toBe(200);

    const resposta = await fetch(`${base}/usuarios`, { headers: { cookie } });
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ statusCode: 403 });
  });

  it('com usuarios.ver: GET /usuarios responde 200', async () => {
    const cookie = await entrarCom(['usuarios.ver']);

    const resposta = await fetch(`${base}/usuarios`, { headers: { cookie } });
    expect(resposta.status).toBe(200);
  });
});
