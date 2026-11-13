import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

import { sessaoQueryOptions } from './sessao';

/** Para o `beforeLoad` das rotas autenticadas: devolve a sessão ou manda para o login. */
export async function exigirSessao(queryClient: QueryClient, href: string) {
  const sessao = await queryClient.ensureQueryData(sessaoQueryOptions());
  if (!sessao) {
    throw redirect({ to: '/login', search: href === '/' ? {} : { redirect: href } });
  }
  return sessao;
}

/** Para o `beforeLoad` do login: quem já tem sessão vai direto para o destino. */
export async function redirecionarSeLogado(queryClient: QueryClient, destino: string) {
  const sessao = await queryClient.ensureQueryData(sessaoQueryOptions());
  if (sessao) throw redirect({ href: destino });
}
