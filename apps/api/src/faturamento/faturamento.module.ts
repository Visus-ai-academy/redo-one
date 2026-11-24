import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { COMPETENCIAS_BLOQUEADAS } from '../ingestao/application/ports/competencias-bloqueadas';
import { CORTES_COMPETENCIA } from '../ingestao/application/ports/cortes-competencia';
import { COMPETENCIAS_REPOSITORY } from './application/ports/competencias.repository';
import { CORTES_REPOSITORY, type CortesRepository } from './application/ports/cortes.repository';
import { DrizzleCompetenciasRepository } from './infrastructure/persistence/drizzle-competencias.repository';
import { DrizzleCortesRepository } from './infrastructure/persistence/drizzle-cortes.repository';

/**
 * Contexto `faturamento` (hexagonal): competências e cortes. Implementa as portas da `ingestao`
 * (`COMPETENCIAS_BLOQUEADAS`, `CORTES_COMPETENCIA`); não importa o `IngestaoModule`, para não
 * criar ciclo.
 */
@Module({
  providers: [
    { provide: COMPETENCIAS_REPOSITORY, useClass: DrizzleCompetenciasRepository },
    { provide: CORTES_REPOSITORY, useClass: DrizzleCortesRepository },
    { provide: COMPETENCIAS_BLOQUEADAS, useExisting: COMPETENCIAS_REPOSITORY },
    { provide: CORTES_COMPETENCIA, useExisting: CORTES_REPOSITORY },
  ],
  exports: [COMPETENCIAS_BLOQUEADAS, CORTES_COMPETENCIA],
})
export class FaturamentoModule implements OnModuleInit {
  constructor(@Inject(CORTES_REPOSITORY) private readonly cortes: CortesRepository) {}

  /** A vigência padrão inicial (dia 7, mês seguinte) fica gravada, para a tela mostrar e o histórico começar dela. */
  async onModuleInit() {
    await this.cortes.garantirPadraoInicial();
  }
}
