import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import type { AgendadorRepasse } from '../../application/ports/agendador-repasse';
import { enfileirarPrevias, enfileirarRepasse } from './enfileirar-repasse';

/** O agendador do repasse pela fila de jobs. */
@Injectable()
export class AgendadorRepasseFila implements AgendadorRepasse {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  previa(competencia: string): Promise<void> {
    return enfileirarRepasse(this.db, competencia);
  }

  previas(): Promise<void> {
    return enfileirarPrevias(this.db);
  }
}
