/** Nome do cookie que leva o token da sessão. */
export const COOKIE_SESSAO = 'one_sessao';

/** Lê um cookie do cabeçalho `Cookie` (o Express não faz isso sem o cookie-parser). */
export function lerCookie(cabecalho: string | undefined, nome: string): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const igual = parte.indexOf('=');
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() !== nome) continue;
    try {
      return decodeURIComponent(parte.slice(igual + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
