export const PAPEIS_REPOSITORY = Symbol('PAPEIS_REPOSITORY');

/** O que um papel concede: tudo (Administrador) ou uma lista de chaves `tela.acao`. */
export interface AcessoDoPapel {
  /** Nome do papel, para mostrar na tela (ex.: no rodapé do menu). */
  papel: string;
  acessoTotal: boolean;
  permissoes: string[];
}

export interface PapeisRepository {
  acessoDoPapel(papelId: string): Promise<AcessoDoPapel>;
}
