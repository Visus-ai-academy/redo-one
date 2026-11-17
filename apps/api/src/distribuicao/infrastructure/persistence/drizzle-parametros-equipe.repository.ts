import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { equipes } from '../../../database/schema';
import type {
  ParametrosEquipe,
  ParametrosEquipeRepository,
} from '../../application/ports/parametros-equipe.repository';

/** O uso da equipe pelo robô, na coluna `equipes.plantao`. */
@Injectable()
export class DrizzleParametrosEquipeRepository implements ParametrosEquipeRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async obter(equipeId: string): Promise<ParametrosEquipe | null> {
    const [linha] = await this.db
      .select({ plantao: equipes.plantao })
      .from(equipes)
      .where(eq(equipes.id, equipeId));
    return linha ?? null;
  }

  async salvar(equipeId: string, parametros: ParametrosEquipe): Promise<void> {
    await this.db
      .update(equipes)
      .set({ plantao: parametros.plantao })
      .where(eq(equipes.id, equipeId));
  }
}
