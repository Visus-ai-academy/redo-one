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
  usuario: { nome: string; email: string; ativo: boolean };
}

/** O que os papéis do dono concedem juntos: a união das permissões. */
export interface AcessoDoUsuario {
  /** Por nome. */
  papeis: { id: string; nome: string }[];
  /** Algum papel é de acesso total (Administrador). */
  acessoTotal: boolean;
  permissoes: string[];
}

/** Sessão com o acesso dos papéis do dono: tudo o que o guard precisa, numa ida só ao banco. */
export interface SessaoAutenticavel extends SessaoComUsuario {
  /** Administrador: `acessoTotal` e lista vazia. */
  acesso: AcessoDoUsuario;
}

/**
 * O que o autenticador usa em toda requisição. Implementada pelo mesmo repositório de
 * `SESSOES_REPOSITORY`.
 */
export interface SessoesAutenticacaoRepository {
  /** Sessão + usuário + papéis + permissões numa consulta só. */
  buscarParaAutenticar(tokenHash: string): Promise<SessaoAutenticavel | null>;
  renovar(id: string, expiraEm: Date, ultimoUsoEm: Date): Promise<void>;
}

export interface SessoesRepository {
  criar(sessao: NovaSessao): Promise<void>;
  buscarPorTokenHash(tokenHash: string): Promise<SessaoComUsuario | null>;
  renovar(id: string, expiraEm: Date, ultimoUsoEm: Date): Promise<void>;
  encerrar(id: string, em: Date): Promise<void>;
  /** Encerra as sessões abertas de todos os usuários do papel; devolve quantas encerrou. */
  encerrarDoPapel(papelId: string, em: Date): Promise<number>;
  /** Encerra as sessões abertas do usuário, menos a indicada; devolve quantas encerrou. */
  encerrarDoUsuario(usuarioId: string, em: Date, excetoSessaoId?: string): Promise<number>;
}
