export const TENTATIVAS_LOGIN_REPOSITORY = Symbol('TENTATIVAS_LOGIN_REPOSITORY');

export interface TentativaLogin {
  ip: string;
  usuarioId: string | null;
  sucesso: boolean;
  userAgent: string | null;
  em: Date;
}

export interface TentativasLoginRepository {
  registrar(tentativa: TentativaLogin): Promise<void>;
  contarFalhasPorIp(ip: string, desde: Date): Promise<number>;
}
