import { Module } from '@nestjs/common';

import { DrizzleEscopoEscalaRepository } from './escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from './escopo/escopo';

/** Contexto `escala`: frentes, turnos, alocações, ausências e o recorte da gestora de escala. */
@Module({
  providers: [{ provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository }],
  exports: [ESCOPO_ESCALA_REPOSITORY],
})
export class EscalaModule {}
