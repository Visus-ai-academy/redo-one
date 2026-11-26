import type { RecalculoRepasse } from '../ports/recalculo-repasse';

/**
 * Pede o recálculo do repasse de uma competência fechada, com motivo (o mecanismo do
 * `faturamento` grava quem, quando e por quê, e enfileira o job do repasse).
 */
export class RecalcularRepasse {
  constructor(private readonly recalculo: RecalculoRepasse) {}

  executar(usuarioId: string, competencia: string, motivo: string): Promise<string> {
    return this.recalculo.solicitar(usuarioId, competencia, motivo);
  }
}
