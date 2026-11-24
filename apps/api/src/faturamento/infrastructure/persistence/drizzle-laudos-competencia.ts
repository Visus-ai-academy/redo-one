import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, isNull, notInArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { laudos } from '../../../database/schema';
import type {
  LaudoParaPrevia,
  LaudosCompetencia,
  LotePrevia,
} from '../../application/ports/laudos-competencia';

/** Leitura dos `laudos` (da `ingestao`) para a prévia do corte: só as colunas da conta. */
@Injectable()
export class DrizzleLaudosCompetencia implements LaudosCompetencia {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  lerParaPrevia(lote: LotePrevia): Promise<LaudoParaPrevia[]> {
    return this.db
      .select({
        id: laudos.id,
        clienteId: laudos.clienteId,
        dataRealizacao: laudos.dataRealizacao,
        dataLaudo: laudos.dataLaudo,
        competencia: laudos.competencia,
      })
      .from(laudos)
      .where(
        and(
          isNull(laudos.removidoEm),
          gte(laudos.competencia, lote.aPartirDe),
          lote.depoisDe ? gt(laudos.id, lote.depoisDe) : undefined,
          lote.clienteId !== null ? eq(laudos.clienteId, lote.clienteId) : undefined,
          lote.competenciasBloqueadas.length
            ? notInArray(laudos.competencia, lote.competenciasBloqueadas)
            : undefined,
        ),
      )
      .orderBy(asc(laudos.id))
      .limit(lote.limite);
  }
}
