import { Module } from '@nestjs/common';

import { CLOCK, systemClock } from '../../identidade/clock';
import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from '../escopo/escopo';
import { OcorrenciasModule } from '../ocorrencias/ocorrencias.module';
import { DrizzleEscalaFixaRepository } from './drizzle-escala-fixa.repository';
import { EscalaFixaController } from './escala-fixa.controller';
import { ESCALA_FIXA_REPOSITORY } from './escala-fixa.repository';
import { EscalaFixaService } from './escala-fixa.service';

/** "Montar escala do médico": a grade turnos × dias que vira alocações fixas. */
@Module({
  imports: [OcorrenciasModule],
  controllers: [EscalaFixaController],
  providers: [
    EscalaFixaService,
    { provide: ESCALA_FIXA_REPOSITORY, useClass: DrizzleEscalaFixaRepository },
    { provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class EscalaFixaModule {}
