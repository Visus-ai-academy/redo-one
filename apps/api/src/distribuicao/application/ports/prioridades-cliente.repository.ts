import type { PrioridadeCliente } from '../../domain/motor/fila';
import type { PrioridadeDaFrente } from '../../domain/prioridade-cliente';

export const PRIORIDADES_CLIENTE_REPOSITORY = Symbol('PRIORIDADES_CLIENTE_REPOSITORY');

export interface PrioridadesClienteRepository {
  /** As do cliente, especialidades antes das modalidades. */
  doCliente(clienteId: string): Promise<PrioridadeDaFrente[]>;
  /** Troca a lista do cliente inteira, numa transação. */
  substituir(clienteId: string, itens: PrioridadeDaFrente[]): Promise<void>;
  /** Todas, no formato do motor (a rodada lê daqui). */
  todas(): Promise<PrioridadeCliente[]>;
}
