import { Module } from '@nestjs/common';

import { CLOCK, systemClock } from '../../identidade/clock';
import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from '../escopo/escopo';
import { CADASTROS_ESCOPO_REPOSITORY } from './cadastros-escopo.repository';
import { DrizzleCadastrosEscopoRepository } from './drizzle-cadastros-escopo.repository';
import { EscopoApiController } from './escopo-api.controller';
import { EscopoApiService } from './escopo-api.service';

/** Rotas do recorte da gestora de escala (tela Usuários e a própria escala). */
@Module({
  controllers: [EscopoApiController],
  providers: [
    EscopoApiService,
    { provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository },
    { provide: CADASTROS_ESCOPO_REPOSITORY, useClass: DrizzleCadastrosEscopoRepository },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class EscopoApiModule {}
