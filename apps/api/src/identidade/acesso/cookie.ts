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

/** Só o que é preciso da resposta do Express para gravar e apagar o cookie. */
export interface RespostaComCookie {
  cookie(nome: string, valor: string, opcoes: Record<string, unknown>): void;
  clearCookie(nome: string, opcoes: Record<string, unknown>): void;
}

/** Cookie da sessão: só o servidor lê (httpOnly), só por HTTPS e não vai em POST de outro site. */
export function gravarCookieSessao(
  resposta: Pick<RespostaComCookie, 'cookie'>,
  sessao: { token: string; expiraEm: Date },
) {
  resposta.cookie(COOKIE_SESSAO, sessao.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: sessao.expiraEm,
  });
}
