export const GESTAO_PAPEIS_REPOSITORY = Symbol('GESTAO_PAPEIS_REPOSITORY');

export interface PapelResumo {
  id: string;
  nome: string;
  descricao: string | null;
  /** Papel fixo (Administrador, Médico): não se edita nem se exclui. */
  sistema: boolean;
  acessoTotal: boolean;
  totalUsuarios: number;
  totalPermissoes: number;
}

export interface PapelDetalhe extends Omit<PapelResumo, 'totalPermissoes'> {
  permissoes: string[];
}

export interface DadosPapel {
  nome: string;
  descricao: string | null;
  permissoes: string[];
}

export interface GestaoPapeisRepository {
  listar(): Promise<PapelResumo[]>;
  buscar(id: string): Promise<PapelDetalhe | null>;
  /** Comparação sem diferenciar maiúsculas. */
  buscarPorNome(nome: string): Promise<{ id: string } | null>;
  criar(dados: DadosPapel): Promise<string>;
  /** Troca nome, descrição e a lista inteira de permissões. */
  atualizar(id: string, dados: DadosPapel): Promise<void>;
  excluir(id: string): Promise<void>;
}
