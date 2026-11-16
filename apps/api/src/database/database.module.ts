import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DATABASE, PG_POOL } from './database';
import * as schema from './schema';

/** Abaixo dos 15 clientes que o pooler do Supabase aceita em modo sessão (`EMAXCONNSESSION`). */
const POOL_MAX_PADRAO = 10;
/** Abrir conexão custa ~0,5 s no banco remoto: conexões paradas ficam 5 min antes de fechar. */
const POOL_OCIOSO_MS = 5 * 60 * 1000;

function maximoDeConexoes(config: ConfigService): number {
  const valor = config.get<string>('DATABASE_POOL_MAX');
  if (valor === undefined || valor === '') return POOL_MAX_PADRAO;
  if (!/^[1-9]\d*$/.test(valor)) {
    throw new Error('DATABASE_POOL_MAX: precisa ser um número inteiro maior que zero');
  }
  return Number(valor);
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      // O pool só abre conexão na primeira query; subir a aplicação não exige o banco no ar.
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: maximoDeConexoes(config),
          idleTimeoutMillis: POOL_OCIOSO_MS,
          // Evita que NAT/proxy no caminho derrube em silêncio a conexão parada.
          keepAlive: true,
        }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle({ client: pool, schema }),
    },
  ],
  exports: [DATABASE, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
