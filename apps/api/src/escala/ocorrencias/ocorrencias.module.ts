import { Module } from '@nestjs/common';

import { CLOCK, systemClock } from '../../identidade/clock';
import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from '../escopo/escopo';
import { CARREGADOR_ESCALA } from './carregador-escala';
import { ConsultaOcorrenciasEscala, OCORRENCIAS_ESCALA } from './consulta-ocorrencias';
import { DrizzleCarregadorEscala } from './drizzle-carregador-escala';
import { DrizzleMedicoDoUsuarioRepository } from './drizzle-medico-do-usuario.repository';
import { MEDICO_DO_USUARIO_REPOSITORY } from './medico-do-usuario.repository';
import { MinhaEscalaController } from './minha-escala.controller';
import { OcorrenciasController } from './ocorrencias.controller';
import { OcorrenciasService } from './ocorrencias.service';

/**
 * Ocorrências da escala (a expansão das alocações em plantões-dia). Exporta `OCORRENCIAS_ESCALA`
 * para outros contextos (distribuição, portal, indicadores).
 */
@Module({
  controllers: [OcorrenciasController, MinhaEscalaController],
  providers: [
    OcorrenciasService,
    { provide: CLOCK, useValue: systemClock },
    { provide: CARREGADOR_ESCALA, useClass: DrizzleCarregadorEscala },
    { provide: OCORRENCIAS_ESCALA, useClass: ConsultaOcorrenciasEscala },
    { provide: MEDICO_DO_USUARIO_REPOSITORY, useClass: DrizzleMedicoDoUsuarioRepository },
    { provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository },
  ],
  exports: [OCORRENCIAS_ESCALA],
})
export class OcorrenciasModule {}
