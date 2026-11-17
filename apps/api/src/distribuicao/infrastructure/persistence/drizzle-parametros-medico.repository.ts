import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { medicosDistribuicao } from '../../../database/schema';
import type {
  ParametrosMedico,
  ParametrosMedicoRepository,
} from '../../application/ports/parametros-medico.repository';

@Injectable()
export class DrizzleParametrosMedicoRepository implements ParametrosMedicoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async obter(medicoId: string): Promise<ParametrosMedico> {
    const [linha] = await this.db
      .select({ habilitadoRobo: medicosDistribuicao.habilitadoRobo })
      .from(medicosDistribuicao)
      .where(eq(medicosDistribuicao.medicoId, medicoId));
    return linha ?? { habilitadoRobo: false };
  }

  async salvar(medicoId: string, parametros: ParametrosMedico): Promise<void> {
    await this.db
      .insert(medicosDistribuicao)
      .values({ medicoId, ...parametros })
      .onConflictDoUpdate({ target: medicosDistribuicao.medicoId, set: parametros });
  }
}
