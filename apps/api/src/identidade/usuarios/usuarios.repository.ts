export const USUARIOS_REPOSITORY = Symbol('USUARIOS_REPOSITORY');

/** O que o login precisa saber de um usuário. */
export interface UsuarioLogin {
  id: string;
  nome: string;
  email: string;
  /** Nulo enquanto o convite não foi aceito. */
  senhaHash: string | null;
  ativo: boolean;
  tentativasFalhas: number;
  bloqueadoAte: Date | null;
}

export type IdentificadorLogin = { email: string } | { cpf: string };

export interface UsuariosRepository {
  buscarParaLogin(identificador: IdentificadorLogin): Promise<UsuarioLogin | null>;
  registrarFalha(id: string, tentativasFalhas: number, bloqueadoAte: Date | null): Promise<void>;
  /** Zera as falhas e tira o bloqueio. */
  registrarSucesso(id: string): Promise<void>;
}
