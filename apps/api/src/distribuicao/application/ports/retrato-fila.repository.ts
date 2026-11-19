import type { FilaDoMomento } from '../use-cases/rodadas/consultas';

export const RETRATO_FILA_REPOSITORY = Symbol('RETRATO_FILA_REPOSITORY');

/** O último retrato da fila do momento e como anda a leitura dele (uma linha só). */
export interface RetratoFilaGravado {
  /** A última leitura boa; null = a fila nunca foi lida. Só agregados: nada de paciente. */
  fila: FilaDoMomento | null;
  /** Quando a última leitura foi pedida (agendamento ou "Ler agora"). */
  pedidaEm: Date | null;
  /** A última leitura falhou (null = a última leu bem): o retrato anterior fica. */
  falhouEm: Date | null;
  /** Mensagem curta da falha, sem dado de paciente. */
  erro: string | null;
}

export interface RetratoFilaRepository {
  obter(): Promise<RetratoFilaGravado>;
  /** Troca o retrato e apaga a falha anotada. */
  gravar(fila: FilaDoMomento): Promise<void>;
  /** Anota a falha; o retrato anterior fica. */
  registrarFalha(em: Date, erro: string): Promise<void>;
  /**
   * Anota o pedido e enfileira a leitura na mesma transação: job único por chave, numa fila
   * própria (nunca duas leituras ao mesmo tempo).
   */
  pedirLeitura(em: Date): Promise<void>;
}
