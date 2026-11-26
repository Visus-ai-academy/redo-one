import type { ExecutorAvisos } from '../../comum/avisos/registro-avisos';

export const CLIENTE_REATIVADO = Symbol('CLIENTE_REATIVADO');

/**
 * Quem reage ao cliente que volta a ficar ativo (a `distribuicao`, que resolve o aviso de cliente
 * inativo na hora, sem esperar a próxima leitura da fila) é avisado na mesma transação que grava a
 * reativação. Implementado fora do `catalogo`, que só conhece esta porta.
 */
export interface ClienteReativado {
  aoReativar(executor: ExecutorAvisos, clienteId: string): Promise<void>;
}
