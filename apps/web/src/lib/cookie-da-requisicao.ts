import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';

/** No SSR, o cookie que o navegador mandou para o front; no navegador, nada (o fetch já o envia). */
export const cookieDaRequisicao = createIsomorphicFn()
  .server(() => getRequestHeader('cookie'))
  .client(() => undefined);
