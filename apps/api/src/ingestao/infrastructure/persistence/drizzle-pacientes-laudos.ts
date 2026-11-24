import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { laudosPacientes } from '../../../database/schema';
import type {
  PacienteDoLaudoLido,
  PacientesLaudos,
} from '../../application/ports/pacientes-laudos';

/** Leitura de `laudos_pacientes` (a permissão e a auditoria ficam em `LerPacientesDosLaudos`). */
@Injectable()
export class DrizzlePacientesLaudos implements PacientesLaudos {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async porLaudos(laudoIds: string[]): Promise<Map<string, PacienteDoLaudoLido>> {
    if (!laudoIds.length) return new Map();
    const linhas = await this.db
      .select({
        laudoId: laudosPacientes.laudoId,
        nome: laudosPacientes.nome,
        codigo: laudosPacientes.codigo,
      })
      .from(laudosPacientes)
      .where(inArray(laudosPacientes.laudoId, laudoIds));
    return new Map(linhas.map(({ laudoId, ...p }) => [laudoId, p]));
  }
}
