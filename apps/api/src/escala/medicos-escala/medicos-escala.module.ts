import { Module } from '@nestjs/common';

import { DrizzleMedicosEscalaRepository } from './drizzle-medicos-escala.repository';
import { MedicosEscalaController } from './medicos-escala.controller';
import { MEDICOS_ESCALA_REPOSITORY } from './medicos-escala.repository';
import { MedicosEscalaService } from './medicos-escala.service';

/** Lista mínima de médicos (id, nome, situação) para a escala, com `escala.ver`. */
@Module({
  controllers: [MedicosEscalaController],
  providers: [
    MedicosEscalaService,
    { provide: MEDICOS_ESCALA_REPOSITORY, useClass: DrizzleMedicosEscalaRepository },
  ],
})
export class MedicosEscalaModule {}
