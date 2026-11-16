import { Inject, Injectable } from '@nestjs/common';

import { ItemNaoEncontradoError } from '../../catalogo/comum/catalogo.errors';
import type { Pagina } from '../../catalogo/comum/paginacao';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { FRENTES_REPOSITORY, type Frente, type FrentesRepository } from './frentes.repository';

export const ROTULO_FRENTE = {
  entidade: 'frente_escala',
  singular: 'Frente',
  genero: 'f',
} as const;

/**
 * Frentes da escala: as colunas em que se escala um médico. Não são cadastro: cada uma é uma
 * especialidade ou modalidade do catálogo, criada pelo sistema quando um turno passa a usá-la.
 */
@Injectable()
export class FrentesService {
  constructor(@Inject(FRENTES_REPOSITORY) private readonly repo: FrentesRepository) {}

  listar(filtro: FiltroLista): Promise<Pagina<Frente>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<Frente> {
    const frente = await this.repo.buscar(id);
    if (!frente) throw new ItemNaoEncontradoError(ROTULO_FRENTE);
    return frente;
  }
}
