import type { Pagina } from '../../catalogo/comum/paginacao';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import type { AlocacaoVigente, DadosTurno } from './turno';

export const TURNOS_REPOSITORY = Symbol('TURNOS_REPOSITORY');

/** Frente do turno, como aparece na tela. */
export interface FrenteDoTurno {
  id: string;
  rotulo: string;
}

/** O turno gravado, com as frentes (pela ordem delas). */
export interface TurnoGravado extends Omit<DadosTurno, 'frenteIds'> {
  id: string;
  frentes: FrenteDoTurno[];
}

export interface TurnosRepository {
  /** Por ordem e nome; a busca olha nome e descrição. */
  listar(filtro: FiltroLista): Promise<Pagina<TurnoGravado>>;
  buscar(id: string): Promise<TurnoGravado | null>;
  /** Comparação sem diferenciar maiúsculas. */
  buscarPorNome(nome: string): Promise<{ id: string } | null>;
  /** As frentes que existem entre os ids pedidos. */
  frentes(ids: string[]): Promise<FrenteDoTurno[]>;
  /** Alocações do turno sem fim ou com fim a partir de `hoje` ("YYYY-MM-DD"). */
  alocacoesVigentes(turnoId: string, hoje: string): Promise<AlocacaoVigente[]>;
  /** Grava o turno e o conjunto de frentes dele. */
  criar(dados: DadosTurno): Promise<string>;
  atualizar(id: string, dados: DadosTurno): Promise<void>;
  /** `false` quando uma alocação, ausência ou recorte de gestora usa o turno. */
  excluir(id: string): Promise<boolean>;
}
