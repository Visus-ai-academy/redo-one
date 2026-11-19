import type { Email } from '../../comum/email/envio-email';

export const TOKENS_SENHA_REPOSITORY = Symbol('TOKENS_SENHA_REPOSITORY');

/** Convite (primeiro acesso, 7 dias) ou recuperação de senha (1 hora). Os dois são de uso único. */
export type TipoTokenSenha = 'convite' | 'recuperacao';

export interface NovoTokenSenha {
  usuarioId: string;
  tipo: TipoTokenSenha;
  /** SHA-256 do token que vai no link; o token em si só existe no e-mail. */
  tokenHash: string;
  criadoEm: Date;
  expiraEm: Date;
  /** Quem convidou (nulo na recuperação, que a própria pessoa pede). */
  criadoPorId: string | null;
}

export interface TokenSenhaEncontrado {
  id: string;
  usuarioId: string;
  tipo: TipoTokenSenha;
  expiraEm: Date;
  usadoEm: Date | null;
  /** `papeis`: nomes, em ordem alfabética. */
  usuario: { nome: string; email: string; papeis: string[]; ativo: boolean };
  convidadoPorNome: string | null;
}

export interface TokensSenhaRepository {
  /**
   * Numa transação: invalida os tokens ainda não usados do mesmo tipo e usuário, grava o novo e
   * enfileira o e-mail. Ou tudo acontece, ou nada.
   */
  emitir(token: NovoTokenSenha, email: Email): Promise<void>;
  buscarPorHash(tokenHash: string): Promise<TokenSenhaEncontrado | null>;
  /** Quando foi emitido o último token deste tipo para o usuário (evita e-mails em rajada). */
  ultimaEmissao(usuarioId: string, tipo: TipoTokenSenha): Promise<Date | null>;
  /**
   * Numa transação: marca o token como usado e grava a senha nova (zerando falhas e bloqueio).
   * `false` se o token já tinha sido usado (dois cliques no mesmo link).
   */
  usar(tokenId: string, usuarioId: string, senhaHash: string, em: Date): Promise<boolean>;
}
