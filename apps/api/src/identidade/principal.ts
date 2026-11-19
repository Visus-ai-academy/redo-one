/** Quem fez a requisição: uma pessoa logada (sessão) ou um robô (chave de API). */
export interface PrincipalUsuario {
  tipo: 'usuario';
  usuarioId: string;
  sessaoId: string;
  nome: string;
  email: string;
  /** Papéis do usuário, por nome; as permissões são a união das deles. */
  papeis: { id: string; nome: string }[];
  /** Papel Administrador: todas as permissões, inclusive as que ainda vão existir. */
  acessoTotal: boolean;
  permissoes: ReadonlySet<string>;
}

/** Robô autenticado por chave. Só entra em rotas marcadas com `@PermiteRobo()`. */
export interface PrincipalRobo {
  tipo: 'robo';
  chaveId: string;
  nome: string;
  acessoTotal: false;
  permissoes: ReadonlySet<string>;
}

export type Principal = PrincipalUsuario | PrincipalRobo;

export function temPermissao(principal: Principal, chave: string): boolean {
  return principal.acessoTotal || principal.permissoes.has(chave);
}
