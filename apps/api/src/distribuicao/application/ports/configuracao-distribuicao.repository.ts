import type { ConfiguracaoGlobal } from '../../domain/configuracao-global';

export const CONFIGURACAO_DISTRIBUICAO_REPOSITORY = Symbol('CONFIGURACAO_DISTRIBUICAO_REPOSITORY');

/** A configuração global (linha única). */
export interface ConfiguracaoDistribuicaoRepository {
  /** Null = ninguém salvou ainda. */
  obter(): Promise<ConfiguracaoGlobal | null>;
  /** Grava a linha e troca as listas inteiras, numa transação. */
  salvar(configuracao: ConfiguracaoGlobal): Promise<void>;
}
