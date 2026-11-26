import type { ContextoRecalculo, PedidoRecalculo } from '../../domain/recalculo-competencia';
import type { RecalculadorCompetencia } from '../recalculadores';

export const RECALCULOS_COMPETENCIA = Symbol('RECALCULOS_COMPETENCIA');

export interface NovoRecalculo {
  competencia: string;
  contexto: ContextoRecalculo;
  motivo: string;
  solicitadoPorId: string;
  solicitadoEm: Date;
}

/** Pedido com o nome de quem pediu, para a tela. */
export interface RecalculoComAutor extends PedidoRecalculo {
  solicitadoPor: string | null;
}

/** Tabela `recalculos_competencia`: histórico dos recálculos de competências fechadas. */
export interface RecalculosCompetencia {
  /** Grava o pedido e, na mesma transação, o job do contexto. Devolve o id. */
  solicitar(pedido: NovoRecalculo, recalculador: RecalculadorCompetencia): Promise<string>;
  /** O mais novo primeiro. */
  listar(competencia: string): Promise<RecalculoComAutor[]>;
  obter(id: string): Promise<PedidoRecalculo | null>;
  /** Marca o fim (só a primeira vez; o job pode rodar de novo). */
  concluir(id: string, em: Date): Promise<void>;
}
