import { Module } from '@nestjs/common';

import { CLOCK, systemClock } from '../../identidade/clock';
import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from '../escopo/escopo';
import { OcorrenciasModule } from '../ocorrencias/ocorrencias.module';
import { AjustesProdutividadeService } from './ajustes.service';
import { AlocacoesController, CoberturasController } from './alocacoes.controller';
import { ALOCACOES_REPOSITORY } from './alocacoes.repository';
import { AlocacoesService } from './alocacoes.service';
import { DrizzleAlocacoesRepository } from './drizzle-alocacoes.repository';

/** Alocações, coberturas e ajustes de produtividade do dia. */
@Module({
  imports: [OcorrenciasModule],
  controllers: [AlocacoesController, CoberturasController],
  providers: [
    AlocacoesService,
    AjustesProdutividadeService,
    { provide: ALOCACOES_REPOSITORY, useClass: DrizzleAlocacoesRepository },
    { provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class AlocacoesModule {}
