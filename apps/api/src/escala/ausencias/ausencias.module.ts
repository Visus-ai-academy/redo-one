import { Module } from '@nestjs/common';

import { CLOCK, systemClock } from '../../identidade/clock';
import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from '../escopo/escopo';
import { AusenciasController } from './ausencias.controller';
import { AUSENCIAS_REPOSITORY } from './ausencias.repository';
import { AusenciasService } from './ausencias.service';
import { DrizzleAusenciasRepository } from './drizzle-ausencias.repository';
import { PortalAusenciasController } from './portal-ausencias.controller';
import { PortalAusenciasService } from './portal-ausencias.service';

/** Ausências: a tela do gestor (lançar, editar, aprovar e recusar) e o pedido pelo portal. */
@Module({
  controllers: [AusenciasController, PortalAusenciasController],
  providers: [
    AusenciasService,
    PortalAusenciasService,
    { provide: AUSENCIAS_REPOSITORY, useClass: DrizzleAusenciasRepository },
    { provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class AusenciasModule {}
