import { Module } from '@nestjs/common';

import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from '../escopo/escopo';
import { DrizzleHistoricoEscalaRepository } from './drizzle-historico.repository';
import { HistoricoEscalaController } from './historico.controller';
import { HISTORICO_ESCALA_REPOSITORY } from './historico.repository';
import { HistoricoEscalaService } from './historico.service';

/** Histórico (log de alterações) da escala, lido de `eventos_auditoria`. */
@Module({
  controllers: [HistoricoEscalaController],
  providers: [
    HistoricoEscalaService,
    { provide: HISTORICO_ESCALA_REPOSITORY, useClass: DrizzleHistoricoEscalaRepository },
    { provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository },
  ],
})
export class HistoricoModule {}
