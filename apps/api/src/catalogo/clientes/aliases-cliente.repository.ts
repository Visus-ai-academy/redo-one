import type { AliasCliente, TipoAlias } from './clientes.repository';

export const ALIASES_CLIENTE_REPOSITORY = Symbol('ALIASES_CLIENTE_REPOSITORY');

export interface NovoAlias {
  tipo: TipoAlias;
  padrao: string;
  /** O que a importação compara: padrão em maiúsculas (exato, prefixo) ou normalizado. */
  chave: string;
  observacoes: string | null;
}

export interface AliasesClienteRepository {
  /** Apelido com essa chave, de qualquer cliente. */
  buscarAlias(
    tipo: TipoAlias,
    chave: string,
  ): Promise<{ id: string; clienteId: string; clienteNome: string } | null>;
  /** Cliente cujo nome normalizado é essa chave. */
  buscarClientePorChave(chaveNormalizada: string): Promise<{ id: string; nome: string } | null>;
  criarAlias(clienteId: string, alias: NovoAlias): Promise<string>;
  buscarAliasDoCliente(clienteId: string, aliasId: string): Promise<AliasCliente | null>;
  excluirAlias(aliasId: string): Promise<void>;
}
