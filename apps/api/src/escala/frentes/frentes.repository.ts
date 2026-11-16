import type { Pagina } from '../../catalogo/comum/paginacao';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import type { DestinoFrente, TipoFrente } from './frente';

export const FRENTES_REPOSITORY = Symbol('FRENTES_REPOSITORY');

/** O que se grava da frente, já validado. */
export interface DadosFrente {
  tipo: TipoFrente;
  especialidadeId: string | null;
  modalidadeId: string | null;
  /** Nome na escala ("TC", "MSK"). */
  rotulo: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
}

export interface Frente extends DadosFrente {
  id: string;
  /** Nome da especialidade ou código da modalidade no catálogo. */
  destinoNome: string;
}

export interface FrentesRepository {
  /** Por ordem e rótulo; a busca olha rótulo e descrição. */
  listar(filtro: FiltroLista): Promise<Pagina<Frente>>;
  buscar(id: string): Promise<Frente | null>;
  /** Comparação sem diferenciar maiúsculas. */
  buscarPorRotulo(rotulo: string): Promise<{ id: string } | null>;
  buscarPorDestino(destino: DestinoFrente): Promise<{ id: string; rotulo: string } | null>;
  /** Nome do item do catálogo; `null` se não existe. */
  nomeDoDestino(destino: DestinoFrente): Promise<string | null>;
  criar(dados: DadosFrente): Promise<string>;
  atualizar(id: string, dados: DadosFrente): Promise<void>;
  /** Algum turno, alocação, ausência ou recorte de gestora usa a frente? */
  estaEmUso(id: string): Promise<boolean>;
  /** `false` quando um turno, alocação, ausência ou recorte de gestora usa a frente. */
  excluir(id: string): Promise<boolean>;
}
