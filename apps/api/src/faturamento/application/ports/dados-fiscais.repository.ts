import type { DadosFiscais } from '../../domain/dados-fiscais';
import type { Autor } from './competencias.repository';

export const DADOS_FISCAIS_REPOSITORY = Symbol('DADOS_FISCAIS_REPOSITORY');

/** A linha de `clientes_dados_fiscais`, como a aba mostra. */
export interface DadosFiscaisRegistrados {
  dados: DadosFiscais;
  atualizadoEm: Date;
  /** Nome de quem salvou por último; nulo na carga do dashboards-one. */
  atualizadoPor: string | null;
}

/** Tabela `clientes_dados_fiscais` (1:1 com `clientes`). */
export interface DadosFiscaisRepository {
  clienteExiste(clienteId: string): Promise<boolean>;
  /** Nulo se o cliente ainda não tem a linha. */
  obter(clienteId: string): Promise<DadosFiscaisRegistrados | null>;
  /** Cria ou troca a linha. */
  salvar(clienteId: string, dados: DadosFiscais, autor: Autor): Promise<void>;
}
