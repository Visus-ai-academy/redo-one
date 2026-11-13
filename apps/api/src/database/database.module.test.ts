import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { DATABASE, PG_POOL } from './database';
import { DatabaseModule } from './database.module';

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), DatabaseModule],
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
});
