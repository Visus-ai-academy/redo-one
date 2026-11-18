import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { medicos, medicosDistribuicao } from '../../../database/schema';
import type { MedicoDaConta, MedicosRodada } from '../../application/ports/insumos-rodada';

/** O cadastro dos médicos como a rodada o consulta na hora (conta na MobileMed, ativo, robô). */
@Injectable()
export class DrizzleMedicosRodada implements MedicosRodada {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async habilitados(): Promise<number> {
    const [linha] = await this.db
      .select({ n: count() })
      .from(medicos)
      .innerJoin(medicosDistribuicao, eq(medicosDistribuicao.medicoId, medicos.id))
      .where(and(eq(medicos.ativo, true), eq(medicosDistribuicao.habilitadoRobo, true)));
    return linha?.n ?? 0;
  }

  async doCadastro(ids: readonly string[]): Promise<Map<string, MedicoDaConta>> {
    if (!ids.length) return new Map();
    const linhas = await this.db
      .select({
        id: medicos.id,
        nome: medicos.nome,
        ativo: medicos.ativo,
        idMobilemed: medicos.idMobilemed,
        habilitadoRobo: medicosDistribuicao.habilitadoRobo,
      })
      .from(medicos)
      .leftJoin(medicosDistribuicao, eq(medicosDistribuicao.medicoId, medicos.id))
      .where(inArray(medicos.id, [...ids]));
    return new Map(linhas.map((m) => [m.id, { ...m, habilitadoRobo: m.habilitadoRobo ?? false }]));
  }
}
