import type { Pagina, Paginacao } from '../comum/paginacao';

export const CLIENTES_REPOSITORY = Symbol('CLIENTES_REPOSITORY');

export type TipoPessoa = 'PJ' | 'PF';
export type TipoAlias = 'exato' | 'prefixo' | 'normalizado';

/** Cadastro básico do cliente (o que é do catálogo; o resto vem dos outros contextos). */
export interface DadosCliente {
  /** Nome canônico, igual ao da MobileMed. */
  nome: string;
  nomeFantasia: string | null;
  razaoSocial: string | null;
  tipoPessoa: TipoPessoa | null;
  /** Só dígitos. */
  cnpj: string | null;
  /** Só dígitos. */
  cpf: string | null;
  /** Empresa que fatura; obrigatória no cadastro (nula só em dado migrado). */
  contratadoId: string | null;
  ativo: boolean;
  ocultoDashboards: boolean;
  observacoes: string | null;
}

export interface AliasCliente {
  id: string;
  tipo: TipoAlias;
  padrao: string;
  observacoes: string | null;
}

export interface ClienteResumo {
  id: string;
  nome: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  contratado: { id: string; razaoSocial: string } | null;
  ativo: boolean;
  ocultoDashboards: boolean;
  totalAliases: number;
  /** Cliente principal, quando este é unidade de outro (unificação). */
  unificadoEm: { id: string; nome: string } | null;
}

export interface ClienteDetalhe extends Omit<DadosCliente, 'contratadoId'> {
  id: string;
  contratado: { id: string; razaoSocial: string } | null;
  aliases: AliasCliente[];
  /** Cliente principal, quando este é unidade de outro: os laudos dele são do principal. */
  unificadoEm: { id: string; nome: string } | null;
  /** Unidades unificadas neste cliente. */
  unidades: { id: string; nome: string }[];
}

export interface FiltroClientes extends Paginacao {
  /** Parte do nome, do nome fantasia ou da razão social, ou o CNPJ. */
  busca?: string;
  ativo?: boolean;
  contratadoId?: string;
}

export interface ClientesRepository {
  listar(filtro: FiltroClientes): Promise<Pagina<ClienteResumo>>;
  buscar(id: string): Promise<ClienteDetalhe | null>;
  /** Comparação sem diferenciar maiúsculas. */
  buscarPorNome(nome: string): Promise<{ id: string } | null>;
  criar(dados: DadosCliente & { chaveNormalizada: string }): Promise<string>;
  atualizar(id: string, dados: DadosCliente & { chaveNormalizada: string }): Promise<void>;
  /** `false` quando outro cadastro referencia o cliente. Os apelidos saem junto. */
  excluir(id: string): Promise<boolean>;
}
