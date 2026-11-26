export const RECALCULO_REPASSE = Symbol('RECALCULO_REPASSE');

/**
 * O mecanismo do `faturamento` para refazer uma competência fechada com motivo (histórico em
 * `recalculos_competencia`), no contexto do repasse.
 */
export interface RecalculoRepasse {
  /** Grava o pedido (motivo, quem, quando) e enfileira o job do repasse. Devolve o id. */
  solicitar(usuarioId: string, competencia: string, motivo: string): Promise<string>;
  /** O pedido, para o job conferir que é do repasse e da competência. */
  obter(id: string): Promise<{ competencia: string; contexto: string } | null>;
  /** O job terminou de gravar o resultado. */
  concluir(id: string, em: Date): Promise<void>;
}
