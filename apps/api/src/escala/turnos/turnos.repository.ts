import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Pagina } from '../../catalogo/comum/paginacao';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import type { DestinosFrentes } from '../frentes/garantir-frentes';
import type { AlocacaoVigente, DadosTurno, FrenteDoTurno } from './turno';

export const TURNOS_REPOSITORY = Symbol('TURNOS_REPOSITORY');

export type { FrenteDoTurno };

/** O turno gravado, com as frentes (especialidades e depois modalidades, pela ordem do catálogo). */
export interface TurnoGravado extends DadosTurno {
  id: string;
  frentes: FrenteDoTurno[];
}

export interface TurnosRepository {
  /** Por ordem e nome; a busca olha nome e descrição. */
  listar(filtro: FiltroLista): Promise<Pagina<TurnoGravado>>;
  buscar(id: string): Promise<TurnoGravado | null>;
  /** Comparação sem diferenciar maiúsculas. */
  buscarPorNome(nome: string): Promise<{ id: string } | null>;
  /** As especialidades e modalidades que existem no catálogo, entre as pedidas. */
  noCatalogo(destinos: DestinosFrentes): Promise<DestinosFrentes>;
  /** Alocações do turno sem fim ou com fim a partir de `hoje` ("YYYY-MM-DD"). */
  alocacoesVigentes(turnoId: string, hoje: string): Promise<AlocacaoVigente[]>;
  /**
   * Grava o turno e as frentes dele, garantindo (na mesma transação) a frente de cada
   * especialidade e modalidade. Devolve os ids das frentes, ordenados. Os eventos de auditoria,
   * montados por `eventosDe` com o id e as frentes gravadas, entram na mesma transação.
   */
  criar(
    dados: DadosTurno,
    eventosDe: (gravado: { id: string; frenteIds: string[] }) => EventoAuditoria[],
  ): Promise<{ id: string; frenteIds: string[] }>;
  atualizar(
    id: string,
    dados: DadosTurno,
    eventosDe: (gravado: { frenteIds: string[] }) => EventoAuditoria[],
  ): Promise<{ frenteIds: string[] }>;
  /**
   * `false` quando uma alocação, ausência ou recorte de gestora usa o turno (e nada é gravado).
   * Os eventos entram na transação do delete.
   */
  excluir(id: string, eventos: EventoAuditoria[]): Promise<boolean>;
}
