export const CONTA_REPOSITORY = Symbol('CONTA_REPOSITORY');

export interface AcessoRecente {
  em: Date;
  sucesso: boolean;
  ip: string;
  userAgent: string | null;
}

/** O que a própria pessoa faz na conta dela (Meu perfil). */
export interface ContaRepository {
  senha(usuarioId: string): Promise<{ hash: string | null; alteradaEm: Date | null }>;
  atualizarNome(usuarioId: string, nome: string): Promise<void>;
  /** Grava a senha nova e a data da troca. */
  trocarSenha(usuarioId: string, hash: string, em: Date): Promise<void>;
  /** Tentativas de login na conta, das mais novas para as mais antigas. */
  acessosRecentes(usuarioId: string, desde: Date, limite: number): Promise<AcessoRecente[]>;
}
