import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { COMPETENCIAS_BLOQUEADAS } from '../ingestao/application/ports/competencias-bloqueadas';
import { CORTES_COMPETENCIA } from '../ingestao/application/ports/cortes-competencia';
import {
  COMPETENCIAS_REPOSITORY,
  type CompetenciasRepository,
} from './application/ports/competencias.repository';
import { CORTES_REPOSITORY, type CortesRepository } from './application/ports/cortes.repository';
import { LAUDOS_COMPETENCIA, type LaudosCompetencia } from './application/ports/laudos-competencia';
import { CriarCorte } from './application/use-cases/criar-corte';
import { FecharCompetencia } from './application/use-cases/fechar-competencia';
import { ListarCompetencias } from './application/use-cases/listar-competencias';
import { ListarCortes } from './application/use-cases/listar-cortes';
import { PreviaCorte } from './application/use-cases/previa-corte';
import { ReabrirCompetencia } from './application/use-cases/reabrir-competencia';
import { DestravarImportacao, TravarImportacao } from './application/use-cases/travar-importacao';
import { CompetenciasController } from './infrastructure/http/competencias.controller';
import { CortesController } from './infrastructure/http/cortes.controller';
import { DrizzleCompetenciasRepository } from './infrastructure/persistence/drizzle-competencias.repository';
import { DrizzleCortesRepository } from './infrastructure/persistence/drizzle-cortes.repository';
import { DrizzleLaudosCompetencia } from './infrastructure/persistence/drizzle-laudos-competencia';

const agora = () => new Date();

/** Casos de uso de uma ação sobre a competência: repositório, auditoria e relógio. */
const ACOES_COMPETENCIA = [
  FecharCompetencia,
  ReabrirCompetencia,
  TravarImportacao,
  DestravarImportacao,
] as const;

/**
 * Contexto `faturamento` (hexagonal): competências e cortes. Implementa as portas da `ingestao`
 * (`COMPETENCIAS_BLOQUEADAS`, `CORTES_COMPETENCIA`); não importa o `IngestaoModule`, para não
 * criar ciclo.
 */
@Module({
  controllers: [CompetenciasController, CortesController],
  providers: [
    { provide: COMPETENCIAS_REPOSITORY, useClass: DrizzleCompetenciasRepository },
    { provide: CORTES_REPOSITORY, useClass: DrizzleCortesRepository },
    { provide: LAUDOS_COMPETENCIA, useClass: DrizzleLaudosCompetencia },
    { provide: COMPETENCIAS_BLOQUEADAS, useExisting: COMPETENCIAS_REPOSITORY },
    { provide: CORTES_COMPETENCIA, useExisting: CORTES_REPOSITORY },
    {
      provide: ListarCompetencias,
      inject: [COMPETENCIAS_REPOSITORY],
      useFactory: (competencias: CompetenciasRepository) => new ListarCompetencias(competencias),
    },
    ...ACOES_COMPETENCIA.map((Caso) => ({
      provide: Caso,
      inject: [COMPETENCIAS_REPOSITORY, AUDITORIA],
      useFactory: (competencias: CompetenciasRepository, auditoria: Auditoria) =>
        new Caso(competencias, auditoria, agora),
    })),
    {
      provide: ListarCortes,
      inject: [CORTES_REPOSITORY],
      useFactory: (cortes: CortesRepository) => new ListarCortes(cortes),
    },
    {
      provide: PreviaCorte,
      inject: [CORTES_REPOSITORY, COMPETENCIAS_REPOSITORY, LAUDOS_COMPETENCIA],
      useFactory: (
        cortes: CortesRepository,
        competencias: CompetenciasRepository,
        laudos: LaudosCompetencia,
      ) => new PreviaCorte(cortes, competencias, laudos),
    },
    {
      provide: CriarCorte,
      inject: [CORTES_REPOSITORY, COMPETENCIAS_REPOSITORY, AUDITORIA],
      useFactory: (
        cortes: CortesRepository,
        competencias: CompetenciasRepository,
        auditoria: Auditoria,
      ) => new CriarCorte(cortes, competencias, auditoria, agora),
    },
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
