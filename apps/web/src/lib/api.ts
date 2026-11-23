import { client, ResponseError } from '../gen/.kubb/client';

let interceptorDoCookie: number | undefined;
let interceptorDaSessao: number | undefined;

/** Telas e chamadas em que o 401 é a resposta esperada (senha errada, sem sessão, link vencido). */
const TELAS_DE_ACESSO = ['/login', '/recuperar-senha', '/definir-senha'];
const CHAMADAS_DE_ACESSO = ['/sessao', '/senha/'];

/**
 * Para onde ir quando a API responde 401 no meio do uso (sessão expirou ou foi derrubada): o login,
 * que depois volta para a mesma tela. `null` quando o 401 é esperado (telas e chamadas de acesso).
 */
export function loginAposSessaoExpirada(status: number, url: string, local: string) {
  if (status !== 401) return null;
  const caminho = new URL(url, 'http://api').pathname;
  if (CHAMADAS_DE_ACESSO.some((c) => caminho === c || caminho.startsWith(c))) return null;
  if (TELAS_DE_ACESSO.some((t) => local === t || local.startsWith(`${t}?`))) return null;
  return local === '/' ? '/login' : `/login?redirect=${encodeURIComponent(local)}`;
}

/**
 * Configura o cliente gerado pelo Kubb. A API (outra origem) autentica pelo cookie httpOnly da
 * sessão: no navegador ele vai sozinho com `credentials: 'include'`; no SSR, `lerCookie` devolve o
 * cookie da requisição do navegador para repassar à API. No navegador, um 401 no meio do uso leva
 * ao login e volta para a mesma tela (regra única: as telas não tratam 401).
 */
export function configurarApi(lerCookie: () => string | undefined) {
  client.setConfig({ credentials: 'include' });
  if (interceptorDoCookie !== undefined) client.interceptors.request.eject(interceptorDoCookie);
  interceptorDoCookie = client.interceptors.request.use((pedido) => {
    const cookie = lerCookie();
    return cookie ? { ...pedido, headers: { ...pedido.headers, cookie } } : pedido;
  });
  if (interceptorDaSessao !== undefined) client.interceptors.error.eject(interceptorDaSessao);
  interceptorDaSessao = client.interceptors.error.use((erro) => {
    if (typeof window === 'undefined' || !ResponseError.is(erro)) return erro;
    const url = erro.request instanceof Request ? erro.request.url : '';
    const { pathname, search } = window.location;
    const destino = loginAposSessaoExpirada(erro.status, url, pathname + search);
    if (destino) window.location.assign(destino);
    return erro;
  });
}
