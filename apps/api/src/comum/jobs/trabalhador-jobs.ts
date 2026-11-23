import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Runner, run } from 'graphile-worker';
import type { Pool } from 'pg';

import { PG_POOL } from '../../database/database';
import { RegistroTarefas } from './registro-tarefas';
import { assumirTrabalho, type SessaoTrabalho } from './travas-orfas';

/**
 * Trabalhador da fila no mesmo processo da API. Sobe no bootstrap (depois de todos os módulos
 * registrarem as tarefas) só com `JOBS_WORKER=true`, e para no shutdown terminando o job atual.
 * Na primeira subida, o graphile-worker cria o schema `graphile_worker` no banco. Antes de subir,
 * libera as travas que um processo anterior deixou ao morrer no meio de um job (ver
 * `assumirTrabalho`): sem isso, a fila serial daquele job ficaria parada por 4 horas.
 */
@Injectable()
export class TrabalhadorJobs implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(TrabalhadorJobs.name);
  private runner?: Runner;
  private sessao?: SessaoTrabalho | null;

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
    this.sessao = await assumirTrabalho(this.pool);
    if (this.sessao?.liberados.length) {
      this.logger.warn(
        `Travas de ${this.sessao.liberados.length} worker(s) morto(s) liberadas; os jobs voltam à fila.`,
      );
    } else if (!this.sessao) {
      this.logger.warn('Outro trabalhador da fila está vivo: travas órfãs não verificadas.');
    }
    this.runner = await run({
      pgPool: this.pool,
      taskList: this.registro.listar(),
      crontab: this.registro.agenda(),
      concurrency: 2,
      noHandleSignals: true,
    });
    this.logger.log(
      `Fila de jobs rodando (${Object.keys(this.registro.listar()).length} tarefas).`,
    );
  }

  // Antes do onApplicationShutdown, que fecha o pool: parar o trabalhador ainda precisa do banco.
  async beforeApplicationShutdown() {
    await this.runner?.stop();
    await this.sessao?.encerrar();
  }
}
