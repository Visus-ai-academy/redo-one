import type { GrafiaSemDePara } from '../../domain/rodada/grafias-sem-de-para';

export const AVISOS_PRIORIDADE = Symbol('AVISOS_PRIORIDADE');

/**
 * Os avisos de grafia de prioridade sem de-para nas prioridades da operação (Operação › Avisos, do
 * contexto `ingestao`). Idempotente: a mesma grafia é um aviso só, e o ignorado segue ignorado.
 */
export interface AvisosPrioridade {
  /** Abre ou atualiza os avisos das pendentes e resolve os pendentes das grafias conferidas. */
  registrar(
    pendentes: readonly GrafiaSemDePara[],
    conferidas: readonly string[],
    agora: Date,
  ): Promise<void>;
}
