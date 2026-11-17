import { Inject, Injectable } from '@nestjs/common';

import {
  CLASSIFICACOES_ESCALA_REPOSITORY,
  type ClassificacoesEscala,
  type ClassificacoesEscalaRepository,
} from './classificacoes-escala.repository';

/** Prioridades e subespecialidades para marcar na alocação, sem o recorte da gestora. */
@Injectable()
export class ClassificacoesEscalaService {
  constructor(
    @Inject(CLASSIFICACOES_ESCALA_REPOSITORY)
    private readonly classificacoes: ClassificacoesEscalaRepository,
  ) {}

  listar(): Promise<ClassificacoesEscala> {
    return this.classificacoes.listar();
  }
}
