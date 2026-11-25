import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Client, type Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { DATABASE, PG_POOL } from './database';
import { DatabaseModule, PRAZO_FECHAR_POOL_MS } from './database.module';

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

  it('não pendura o desligamento quando uma conexão emprestada nunca volta ao pool', async () => {
    const app = await createApp();
    await app.init();
    // O `end` do pg espera todas as conexões emprestadas voltarem; uma consulta presa numa
    // conexão morta (ex.: a do trabalhador da fila) nunca volta.
    vi.spyOn(app.get<Pool>(PG_POOL), 'end').mockImplementation(
      (() => new Promise<void>(() => {})) as never,
    );
    vi.useFakeTimers();
    let fechou = false;

    void app.close().then(() => {
      fechou = true;
    });
    await vi.advanceTimersByTimeAsync(PRAZO_FECHAR_POOL_MS);
    vi.useRealTimers();

    expect(fechou).toBe(true);
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

  it('não derruba a aplicação quando o banco corta uma conexão parada', async () => {
    const app = await createApp();
    const pool = app.get<Pool>(PG_POOL);

    // Sem ouvinte, o `error` de um cliente ocioso vira exceção e mata o processo.
    expect(() => pool.emit('error', new Error('read ECONNRESET'))).not.toThrow();
    await app.close();
  });

  it('não derruba a aplicação quando cai a conexão de um cliente emprestado do pool', async () => {
    const app = await createApp();
    const pool = app.get<Pool>(PG_POOL);
    // Cliente emprestado (ex.: o que segura a trava do trabalhador, ou o do LISTEN do
    // graphile-worker depois de soltar o próprio ouvinte): o pool não ouve o `error` dele.
    const cliente = new Client();
    pool.emit('connect', cliente);

    expect(() => cliente.emit('error', new Error('read ECONNRESET'))).not.toThrow();
    expect(() => cliente.emit('error', new Error('read EADDRNOTAVAIL'))).not.toThrow();
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
