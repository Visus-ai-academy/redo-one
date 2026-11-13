import { client } from '../gen/.kubb/client';

let interceptorDoCookie: number | undefined;

/**
 * Configura o cliente gerado pelo Kubb. A API (outra origem) autentica pelo cookie httpOnly da
 * sessão: no navegador ele vai sozinho com `credentials: 'include'`; no SSR, `lerCookie` devolve o
 * cookie da requisição do navegador para repassar à API.
 */
export function configurarApi(lerCookie: () => string | undefined) {
  client.setConfig({ credentials: 'include' });
  if (interceptorDoCookie !== undefined) client.interceptors.request.eject(interceptorDoCookie);
  interceptorDoCookie = client.interceptors.request.use((pedido) => {
    const cookie = lerCookie();
    return cookie ? { ...pedido, headers: { ...pedido.headers, cookie } } : pedido;
  });
}
