import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../database/database';
import { adicionarJob, type OpcoesJob } from './adicionar-job';

/**
 * Enfileira fora de transação. Quando o job depende de um dado gravado agora, o repositório usa
 * `adicionarJob(tx, ...)` dentro da própria transação.
 */
@Injectable()
export class FilaJobs {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  enfileirar(tarefa: string, payload: unknown, opcoes?: OpcoesJob): Promise<void> {
    return adicionarJob(this.db, tarefa, payload, opcoes);
  }
}
