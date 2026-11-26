import type { AdicionalMontado } from '../../domain/adicional';

export const ADICIONAIS_REPOSITORY = Symbol('ADICIONAIS_REPOSITORY');

export interface AdicionalGravado extends AdicionalMontado {
  id: string;
  medicoId: string;
  medico: string;
  recalculoId: string | null;
  lancadoEm: Date;
  lancadoPor: string | null;
  canceladoEm: Date | null;
  canceladoPor: string | null;
  motivoCancelamento: string | null;
}

export interface AdicionaisRepository {
  medicoExiste(medicoId: string): Promise<boolean>;
  /** Tarifas padrão vigentes na competência (parâmetros). */
  tarifas(competencia: string): Promise<{ peerReviewCentavos: number; plantaoCentavos: number }>;
  /** Peer Review não cancelado do médico que cobre algum mês do intervalo. */
  peerReviewSobreposto(
    medicoId: string,
    desde: string,
    ate: string,
  ): Promise<{ competencia: string; referenciaDesde: string; referenciaAte: string } | null>;
  inserir(
    adicional: AdicionalMontado & { medicoId: string; lancadoPorId: string; lancadoEm: Date },
  ): Promise<string>;
  ligarRecalculo(id: string, recalculoId: string): Promise<void>;
  obter(id: string): Promise<AdicionalGravado | null>;
  cancelar(id: string, por: string, em: Date, motivo: string): Promise<void>;
  /** Da competência, os cancelados também, mais novos primeiro. */
  listar(competencia: string): Promise<AdicionalGravado[]>;
}
