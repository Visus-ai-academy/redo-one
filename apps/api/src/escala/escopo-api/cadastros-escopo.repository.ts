import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { RecorteEscala } from '../escopo/escopo';

export const CADASTROS_ESCOPO_REPOSITORY = Symbol('CADASTROS_ESCOPO_REPOSITORY');

export interface Referencia {
  id: string;
  nome: string;
}

/**
 * O que a tela do recorte consulta nos cadastros (o usuário e os nomes dos turnos e frentes) e a
 * gravação do recorte com a auditoria.
 */
export interface CadastrosEscopoRepository {
  /** Troca o recorte inteiro do usuário e grava os eventos de auditoria na mesma transação. */
  gravarRecorte(
    usuarioId: string,
    escopo: RecorteEscala,
    eventos: EventoAuditoria[],
  ): Promise<void>;
  usuarioExiste(id: string): Promise<boolean>;
  /** Só os que existem, na ordem da escala. */
  turnos(ids: string[]): Promise<Referencia[]>;
  /** Só as que existem, na ordem da escala; o nome é o rótulo da frente. */
  frentes(ids: string[]): Promise<Referencia[]>;
}
