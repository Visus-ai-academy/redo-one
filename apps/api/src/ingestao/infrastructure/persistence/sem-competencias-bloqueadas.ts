import type { CompetenciasBloqueadas } from '../../application/ports/competencias-bloqueadas';

/** Até o `faturamento` existir (com a tabela de competências), nenhuma está fechada. */
export class SemCompetenciasBloqueadas implements CompetenciasBloqueadas {
  async listar(): Promise<string[]> {
    return [];
  }
}
