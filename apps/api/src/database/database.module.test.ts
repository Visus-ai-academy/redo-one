import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { DATABASE, PG_POOL } from './database';
import { DatabaseModule } from './database.module';

async function createApp(env: Record<string, string> = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
      DatabaseModule,
    ],
  }).compile();
  return moduleRef.createNestApplication();
}

describe('DatabaseModule', () => {
  it('provê uma instância do Drizzle pelo token DATABASE', async () => {
    const app = await createApp();
    await app.init();

    const db = app.get(DATABASE);
    expect(typeof db.select).toBe('function');

    await app.close();
  });

  it('encerra o pool de conexões quando a aplicação fecha', async () => {
    const app = await createApp();
    await app.init();
    const pool = app.get<Pool>(PG_POOL);

    await app.close();

    expect(pool.ended).toBe(true);
  });

  it('mantém as conexões abertas e vivas entre requisições, até 10 por padrão', async () => {
    const app = await createApp();
    const pool = app.get<Pool>(PG_POOL);

    expect(pool.options).toMatchObject({
      max: 10,
      idleTimeoutMillis: 5 * 60 * 1000,
      keepAlive: true,
    });
    await app.close();
  });

  it('lê o máximo de conexões de DATABASE_POOL_MAX', async () => {
    const app = await createApp({ DATABASE_POOL_MAX: '4' });

    expect(app.get<Pool>(PG_POOL).options.max).toBe(4);
    await app.close();
  });

  it.each(['0', 'abc', '2.5'])(
    'recusa DATABASE_POOL_MAX inválido (%s) na subida',
    async (valor) => {
      await expect(createApp({ DATABASE_POOL_MAX: valor })).rejects.toThrow(/DATABASE_POOL_MAX/);
    },
  );
});
