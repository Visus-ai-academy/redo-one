import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import { parametrosIngestao } from '../../../database/schema';
import type {
  ParametrosIngestao,
  ParametrosIngestaoRepository,
} from '../../application/ports/parametros-ingestao.repository';

@Injectable()
export class DrizzleParametrosIngestaoRepository implements ParametrosIngestaoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Linha única; enquanto ninguém editou, valem os padrões da tabela. */
  async obter(): Promise<ParametrosIngestao> {
    const [linha] = await this.db
      .insert(parametrosIngestao)
      .values({})
      .onConflictDoUpdate({ target: parametrosIngestao.id, set: { id: 1 } })
      .returning();
    return {
      travaRemocaoMinimo: linha?.travaRemocaoMinimo ?? 500,
      travaRemocaoFator: linha?.travaRemocaoFator ?? 2,
      retencaoLinhasBrutasDias: linha?.retencaoLinhasBrutasDias ?? 90,
      mobilemedIntervaloMinutos: linha ? linha.mobilemedIntervaloMinutos : 15,
      mobilemedMesesAnteriores: linha?.mobilemedMesesAnteriores ?? 1,
      mobilemedJanelaDias: linha?.mobilemedJanelaDias ?? 7,
      mobilemedTeto: linha?.mobilemedTeto ?? 50_000,
      mobilemedCompartilhamentoUnidades: linha?.mobilemedCompartilhamentoUnidades ?? ['CRD_APOIO'],
    };
  }

  async salvar(p: ParametrosIngestao) {
    await this.db
      .insert(parametrosIngestao)
      .values({ id: 1, ...p })
      .onConflictDoUpdate({ target: parametrosIngestao.id, set: p });
  }
}
