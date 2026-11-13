export const PAPEIS_REPOSITORY = Symbol('PAPEIS_REPOSITORY');

/** O que um papel concede: tudo (Administrador) ou uma lista de chaves `tela.acao`. */
export interface AcessoDoPapel {
  acessoTotal: boolean;
  permissoes: string[];
}

export interface PapeisRepository {
  acessoDoPapel(papelId: string): Promise<AcessoDoPapel>;
}
