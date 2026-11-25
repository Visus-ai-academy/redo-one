import type { ExecutorSql } from '../../comum/jobs/adicionar-job';

export const EQUIPES_ALTERADAS = Symbol('EQUIPES_ALTERADAS');

/**
 * Quem depende dos membros e da situação das equipes (a tipificação do faturamento filtra laudos
 * por equipe) é avisado na mesma transação que muda a equipe. Implementado fora do `medicos`, que
 * só conhece esta porta.
 */
export interface EquipesAlteradas {
  aoAlterar(executor: ExecutorSql): Promise<void>;
}
