import { createHash, randomBytes } from 'node:crypto';

import { SESSAO_INATIVIDADE_MS, SESSAO_LIMITE_ABSOLUTO_MS } from './politica-sessao';
import type { SessoesRepository } from './sessoes.repository';

export interface SessaoAberta {
  /** Vai para o cookie; o banco guarda só o hash. */
  token: string;
  expiraEm: Date;
  usuario: { id: string; nome: string; email: string };
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Abre sessão de 7 dias (limite absoluto de 30) para quem acabou de provar quem é. */
export async function abrirSessao(
  sessoes: SessoesRepository,
  usuario: SessaoAberta['usuario'],
  contexto: { ip: string | null; userAgent: string | null; agora: Date },
): Promise<SessaoAberta> {
  const token = randomBytes(32).toString('base64url');
  const { agora } = contexto;
  const expiraEm = new Date(agora.getTime() + SESSAO_INATIVIDADE_MS);
  await sessoes.criar({
    usuarioId: usuario.id,
    tokenHash: hashDoToken(token),
    criadaEm: agora,
    expiraEm,
    expiraAbsolutoEm: new Date(agora.getTime() + SESSAO_LIMITE_ABSOLUTO_MS),
    ip: contexto.ip,
    userAgent: contexto.userAgent,
  });
  const { id, nome, email } = usuario;
  return { token, expiraEm, usuario: { id, nome, email } };
}
