export const UNIDADES_CLIENTE_REPOSITORY = Symbol('UNIDADES_CLIENTE_REPOSITORY');

export interface ClienteRef {
  id: string;
  nome: string;
}

/** Como o cliente está na unificação: de quem é unidade e quantas unidades tem. */
export interface VinculoUnificacao extends ClienteRef {
  unificadoEm: ClienteRef | null;
  totalUnidades: number;
}

export interface UnidadesClienteRepository {
  buscarVinculo(id: string): Promise<VinculoUnificacao | null>;
  /** `null` desfaz: a unidade volta a ser cliente independente. */
  definirPrincipal(unidadeId: string, principalId: string | null): Promise<void>;
}
