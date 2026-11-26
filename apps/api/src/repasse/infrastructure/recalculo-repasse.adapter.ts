import type { RecalculosCompetencia } from '../../faturamento/application/ports/recalculos-competencia';
import type { RecalcularCompetenciaFechada } from '../../faturamento/application/use-cases/recalcular-competencia';
import type { RecalculoRepasse } from '../application/ports/recalculo-repasse';

/** O recálculo de competência fechada do `faturamento`, no contexto do repasse. */
export class RecalculoRepasseAdapter implements RecalculoRepasse {
  constructor(
    private readonly recalcular: RecalcularCompetenciaFechada,
    private readonly recalculos: RecalculosCompetencia,
  ) {}

  solicitar(usuarioId: string, competencia: string, motivo: string): Promise<string> {
    return this.recalcular.executar(usuarioId, competencia, 'repasse', motivo);
  }

  obter(id: string) {
    return this.recalculos.obter(id);
  }

  concluir(id: string, em: Date): Promise<void> {
    return this.recalculos.concluir(id, em);
  }
}
