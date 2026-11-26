import type { ClienteInativoNaFila } from '../../domain/rodada/entrada';

export const AVISOS_CLIENTE_INATIVO = Symbol('AVISOS_CLIENTE_INATIVO');

/**
 * Os avisos de cliente inativo com exames na fila (Operação › Avisos, do contexto `ingestao`).
 * Cada leitura da fila inteira (o retrato e a rodada) é a verificação completa: abre ou atualiza
 * um aviso por cliente encontrado e resolve os pendentes dos que não vieram (cliente reativado ou
 * sem exames na fila). O ignorado segue ignorado.
 */
export interface AvisosClienteInativo {
  sincronizar(clientes: readonly ClienteInativoNaFila[], agora: Date): Promise<void>;
}
