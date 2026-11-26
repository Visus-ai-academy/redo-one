import type { ExecutorSql } from '../../comum/jobs/adicionar-job';
import type { ContextoRecalculo } from '../domain/recalculo-competencia';

/**
 * Como um contexto refaz o cálculo de uma competência fechada: enfileira o próprio job na
 * transação que grava o pedido (o pedido e o job entram juntos ou não entram). O job grava o
 * resultado como versão nova, sem sobrescrever nem apagar a anterior, e chama
 * `RecalculosCompetencia.concluir` no fim.
 */
export interface RecalculadorCompetencia {
  contexto: ContextoRecalculo;
  enfileirar(
    executor: ExecutorSql,
    pedido: { recalculoId: string; competencia: string },
  ): Promise<void>;
}

/**
 * Recalculadores de cada contexto (faturamento, repasse). Cada módulo registra o seu no
 * `onModuleInit`; o `FaturamentoModule` exporta o registro.
 */
export class RegistroRecalculadores {
  private readonly porContexto = new Map<ContextoRecalculo, RecalculadorCompetencia>();

  registrar(recalculador: RecalculadorCompetencia): void {
    if (this.porContexto.has(recalculador.contexto)) {
      throw new Error(`Recalculador do contexto "${recalculador.contexto}" registrado duas vezes.`);
    }
    this.porContexto.set(recalculador.contexto, recalculador);
  }

  obter(contexto: ContextoRecalculo): RecalculadorCompetencia | null {
    return this.porContexto.get(contexto) ?? null;
  }
}
