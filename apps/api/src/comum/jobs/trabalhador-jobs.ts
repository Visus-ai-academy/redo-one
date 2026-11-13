import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Runner, run } from 'graphile-worker';
import type { Pool } from 'pg';

import { PG_POOL } from '../../database/database';
import { RegistroTarefas } from './registro-tarefas';

/**
 * Trabalhador da fila no mesmo processo da API. Sobe no bootstrap (depois de todos os módulos
 * registrarem as tarefas) só com `JOBS_WORKER=true`, e para no shutdown terminando o job atual.
 * Na primeira subida, o graphile-worker cria o schema `graphile_worker` no banco.
 */
@Injectable()
export class TrabalhadorJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TrabalhadorJobs.name);
  private runner?: Runner;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly registro: RegistroTarefas,
    private readonly config: ConfigService,
  ) {}

  get rodando() {
    return this.runner !== undefined;
  }

  async onApplicationBootstrap() {
    if (this.config.get<string>('JOBS_WORKER') !== 'true') return;
    this.runner = await run({
      pgPool: this.pool,
      taskList: this.registro.listar(),
      concurrency: 2,
      noHandleSignals: true,
    });
    this.logger.log(
      `Fila de jobs rodando (${Object.keys(this.registro.listar()).length} tarefas).`,
    );
  }

  async onApplicationShutdown() {
    await this.runner?.stop();
  }
}
