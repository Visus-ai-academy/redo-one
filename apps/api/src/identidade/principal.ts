/** Quem fez a requisição: uma pessoa logada (sessão). Robôs entram na etapa das chaves de API. */
export interface PrincipalUsuario {
  tipo: 'usuario';
  usuarioId: string;
  sessaoId: string;
  nome: string;
  email: string;
  papelId: string;
  /** Papel Administrador: todas as permissões, inclusive as que ainda vão existir. */
  acessoTotal: boolean;
  permissoes: ReadonlySet<string>;
}

export type Principal = PrincipalUsuario;

export function temPermissao(principal: Principal, chave: string): boolean {
  return principal.acessoTotal || principal.permissoes.has(chave);
}
