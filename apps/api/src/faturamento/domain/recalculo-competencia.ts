import { ErroDeDominio } from '../../comum/erro-de-dominio';

/**
 * Contextos que calculam algo por competência e podem refazer o cálculo de uma competência
 * fechada (o fechamento é um só para todos). Cada um registra como se recalcula
 * (`RegistroRecalculadores`).
 */
export const CONTEXTOS_RECALCULO = ['faturamento', 'repasse'] as const;
export type ContextoRecalculo = (typeof CONTEXTOS_RECALCULO)[number];

/** Pedido de recálculo de uma competência fechada: sempre com motivo e autor. */
export interface PedidoRecalculo {
  id: string;
  competencia: string;
  contexto: ContextoRecalculo;
  motivo: string;
  solicitadoPorId: string;
  solicitadoEm: Date;
  /** Quando o contexto terminou de gravar o resultado novo (nulo = na fila ou rodando). */
  concluidoEm: Date | null;
}

export class MotivoRecalculoObrigatorioError extends ErroDeDominio {
  readonly tipo = 'invalido';
  constructor() {
    super('Informe o motivo do recálculo: ele fica no histórico da competência.');
  }
}

export class CompetenciaNaoFechadaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'A competência está aberta: o cálculo dela se refaz sozinho. O recálculo com motivo é só para competência fechada.',
    );
  }
}

export class ContextoSemRecalculoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor(contexto: string) {
    super(`O ${contexto} ainda não sabe recalcular uma competência fechada.`);
  }
}

/** O motivo sem espaços nas pontas; vazio é recusado. */
export function exigirMotivo(motivo: string): string {
  const limpo = motivo.trim();
  if (!limpo) throw new MotivoRecalculoObrigatorioError();
  return limpo;
}
