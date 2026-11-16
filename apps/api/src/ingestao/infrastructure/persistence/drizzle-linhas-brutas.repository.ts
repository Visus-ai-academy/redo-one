import { Inject, Injectable } from '@nestjs/common';
import { lt } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { laudosLinhasBrutas } from '../../../database/schema';
import type { LinhasBrutasRepository } from '../../application/ports/linhas-brutas.repository';

@Injectable()
export class DrizzleLinhasBrutasRepository implements LinhasBrutasRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async expurgarAntesDe(instante: Date): Promise<number> {
    const apagadas = await this.db
      .delete(laudosLinhasBrutas)
      .where(lt(laudosLinhasBrutas.criadoEm, instante))
      .returning({ laudoId: laudosLinhasBrutas.laudoId });
    return apagadas.length;
  }
}
