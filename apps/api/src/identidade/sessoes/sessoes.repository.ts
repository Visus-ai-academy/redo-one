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

/** Sessão encontrada pelo token, com o que é preciso saber do dono para autorizar a requisição. */
export interface SessaoComUsuario {
  id: string;
  usuarioId: string;
  expiraEm: Date;
  expiraAbsolutoEm: Date;
  ultimoUsoEm: Date;
  encerradaEm: Date | null;
  usuario: { nome: string; email: string; papelId: string; ativo: boolean };
}

export interface SessoesRepository {
  criar(sessao: NovaSessao): Promise<void>;
  buscarPorTokenHash(tokenHash: string): Promise<SessaoComUsuario | null>;
  renovar(id: string, expiraEm: Date, ultimoUsoEm: Date): Promise<void>;
  encerrar(id: string, em: Date): Promise<void>;
  /** Encerra as sessões abertas de todos os usuários do papel; devolve quantas encerrou. */
  encerrarDoPapel(papelId: string, em: Date): Promise<number>;
}
