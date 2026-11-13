export const SESSOES_REPOSITORY = Symbol('SESSOES_REPOSITORY');

export interface NovaSessao {
  usuarioId: string;
  /** SHA-256 do token; o token em si nunca chega ao repositório. */
  tokenHash: string;
  criadaEm: Date;
  expiraEm: Date;
  expiraAbsolutoEm: Date;
  ip: string | null;
  userAgent: string | null;
}

export interface SessoesRepository {
  criar(sessao: NovaSessao): Promise<void>;
}
