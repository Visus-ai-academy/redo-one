import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { recalculosCompetencia, usuarios } from '../../../database/schema';
import type {
  NovoRecalculo,
  RecalculoComAutor,
  RecalculosCompetencia,
} from '../../application/ports/recalculos-competencia';
import type { RecalculadorCompetencia } from '../../application/recalculadores';
import type { PedidoRecalculo } from '../../domain/recalculo-competencia';

const colunas = {
  id: recalculosCompetencia.id,
  competencia: recalculosCompetencia.competencia,
  contexto: recalculosCompetencia.contexto,
  motivo: recalculosCompetencia.motivo,
  solicitadoPorId: recalculosCompetencia.solicitadoPorId,
  solicitadoEm: recalculosCompetencia.solicitadoEm,
  concluidoEm: recalculosCompetencia.concluidoEm,
};

@Injectable()
export class DrizzleRecalculosCompetencia implements RecalculosCompetencia {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  solicitar(pedido: NovoRecalculo, recalculador: RecalculadorCompetencia): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(recalculosCompetencia)
        .values(pedido)
        .returning({ id: recalculosCompetencia.id });
      if (!linha) throw new Error('recálculo não gravado');
      await recalculador.enfileirar(tx, { recalculoId: linha.id, competencia: pedido.competencia });
      return linha.id;
    });
  }

  listar(competencia: string): Promise<RecalculoComAutor[]> {
    return this.db
      .select({ ...colunas, solicitadoPor: usuarios.nome })
      .from(recalculosCompetencia)
      .leftJoin(usuarios, eq(usuarios.id, recalculosCompetencia.solicitadoPorId))
      .where(eq(recalculosCompetencia.competencia, competencia))
      .orderBy(desc(recalculosCompetencia.solicitadoEm), desc(recalculosCompetencia.id));
  }

  async obter(id: string): Promise<PedidoRecalculo | null> {
    const [linha] = await this.db
      .select(colunas)
      .from(recalculosCompetencia)
      .where(eq(recalculosCompetencia.id, id));
    return linha ?? null;
  }

  async concluir(id: string, em: Date): Promise<void> {
    await this.db
      .update(recalculosCompetencia)
      .set({ concluidoEm: em })
      .where(and(eq(recalculosCompetencia.id, id), isNull(recalculosCompetencia.concluidoEm)));
  }
}
