import type { ContaForaDaUnidade } from '../../domain/rodada/contas-fora-da-unidade';

export const AVISOS_CONTA_UNIDADE = Symbol('AVISOS_CONTA_UNIDADE');

/**
 * Os avisos de médico escalado sem conta liberada na unidade do exame na MobileMed (Operação ›
 * Avisos, do contexto `ingestao`). Só avisa: nada muda no cadastro. Idempotente: o mesmo par
 * médico + unidade é um aviso só, e o ignorado segue ignorado.
 */
export interface AvisosContaUnidade {
  /** Abre ou atualiza os avisos dos pendentes e resolve os pendentes dos pares conferidos. */
  registrar(
    pendentes: readonly ContaForaDaUnidade[],
    conferidas: readonly string[],
    agora: Date,
  ): Promise<void>;
}
