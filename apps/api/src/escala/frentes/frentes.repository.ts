import type { Pagina } from '../../catalogo/comum/paginacao';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';

export const FRENTES_REPOSITORY = Symbol('FRENTES_REPOSITORY');

/** A frente aponta para uma especialidade (NEURO) ou para uma modalidade (RX, TC), nunca as duas. */
export type TipoFrente = 'especialidade' | 'modalidade';

/** A frente como a tela recebe: tudo menos o id e o destino vem do catálogo. */
export interface Frente {
  id: string;
  tipo: TipoFrente;
  especialidadeId: string | null;
  modalidadeId: string | null;
  /** Nome da especialidade ou código da modalidade. */
  rotulo: string;
  /** O mesmo que `rotulo` (mantido no contrato). */
  destinoNome: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
}

export interface FrentesRepository {
  /** Especialidades e depois modalidades, pela ordem do catálogo; busca no nome e na descrição. */
  listar(filtro: FiltroLista): Promise<Pagina<Frente>>;
  buscar(id: string): Promise<Frente | null>;
}
