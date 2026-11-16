import { Module } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { DrizzleListaRepository } from '../../catalogo/listas/drizzle-lista.repository';
import { DATABASE, type Database } from '../../database/database';
import { CLOCK, type Clock, systemClock } from '../../identidade/clock';
import { DrizzleFrentesRepository } from '../frentes/drizzle-frentes.repository';
import { FrentesController } from '../frentes/frentes.controller';
import { FRENTES_REPOSITORY } from '../frentes/frentes.repository';
import { FrentesService } from '../frentes/frentes.service';
import { TABELA_TIPOS_AUSENCIA } from '../tipos-ausencia/tabela';
import { TiposAusenciaController } from '../tipos-ausencia/tipos-ausencia.controller';
import {
  type DadosTipoAusencia,
  TiposAusenciaService,
} from '../tipos-ausencia/tipos-ausencia.service';
import { TIPOS_AUSENCIA_SERVICE } from '../tipos-ausencia/tokens';
import { DrizzleTurnosRepository } from '../turnos/drizzle-turnos.repository';
import { TurnosController } from '../turnos/turnos.controller';
import { TURNOS_REPOSITORY } from '../turnos/turnos.repository';
import { TurnosService } from '../turnos/turnos.service';

/** Cadastros da escala: frentes, turnos (com as frentes de cada um) e tipos de ausência. */
@Module({
  controllers: [FrentesController, TurnosController, TiposAusenciaController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    FrentesService,
    { provide: FRENTES_REPOSITORY, useClass: DrizzleFrentesRepository },
    TurnosService,
    { provide: TURNOS_REPOSITORY, useClass: DrizzleTurnosRepository },
    {
      provide: TIPOS_AUSENCIA_SERVICE,
      inject: [DATABASE, AUDITORIA, CLOCK],
      useFactory: (db: Database, auditoria: Auditoria, clock: Clock) =>
        new TiposAusenciaService(
          new DrizzleListaRepository<DadosTipoAusencia>(db, TABELA_TIPOS_AUSENCIA),
          auditoria,
          clock,
        ),
    },
  ],
})
export class CadastrosEscalaModule {}
