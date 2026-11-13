export const CHAVES_ROBO_REPOSITORY = Symbol('CHAVES_ROBO_REPOSITORY');

export interface DadosRobo {
  nome: string;
  descricao: string | null;
  permissoes: string[];
}

export interface NovaChaveRobo extends DadosRobo {
  /** Começo da chave (`one_` + 8 caracteres), para reconhecer na lista e nos logs do robô. */
  prefixo: string;
  /** SHA-256 da chave; a chave em si só aparece uma vez, na resposta da criação. */
  tokenHash: string;
  /** Nulo: sem validade. */
  expiraEm: Date | null;
  criadaPorId: string;
  criadaEm: Date;
}

export interface ChaveRobo extends DadosRobo {
  id: string;
  prefixo: string;
  expiraEm: Date | null;
  revogadaEm: Date | null;
  ultimoUsoEm: Date | null;
  ultimoIp: string | null;
  criadaEm: Date;
}

export interface ChavesRoboRepository {
  listar(): Promise<ChaveRobo[]>;
  buscar(id: string): Promise<ChaveRobo | null>;
  buscarPorHash(tokenHash: string): Promise<ChaveRobo | null>;
  criar(chave: NovaChaveRobo): Promise<string>;
  revogar(id: string, em: Date): Promise<void>;
  registrarUso(id: string, em: Date, ip: string): Promise<void>;
}
