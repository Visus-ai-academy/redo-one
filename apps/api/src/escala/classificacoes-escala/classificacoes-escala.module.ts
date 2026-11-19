import { Module } from '@nestjs/common';

import { ClassificacoesEscalaController } from './classificacoes-escala.controller';
import { CLASSIFICACOES_ESCALA_REPOSITORY } from './classificacoes-escala.repository';
import { ClassificacoesEscalaService } from './classificacoes-escala.service';
import { DrizzleClassificacoesEscalaRepository } from './drizzle-classificacoes-escala.repository';

/** Prioridades da operação e subespecialidades para a alocação, com `escala.ver`. */
@Module({
  controllers: [ClassificacoesEscalaController],
  providers: [
    ClassificacoesEscalaService,
    { provide: CLASSIFICACOES_ESCALA_REPOSITORY, useClass: DrizzleClassificacoesEscalaRepository },
  ],
})
export class ClassificacoesEscalaModule {}
