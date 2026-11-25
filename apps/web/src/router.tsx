import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

import { ErroDeRota, NaoEncontrada } from './components/estado/estados';
import { configurarApi } from './lib/api';
import { cookieDaRequisicao } from './lib/cookie-da-requisicao';
import { criarRestauracaoDeRolagem } from './lib/rolagem';
import { routeTree } from './routeTree.gen';

configurarApi(cookieDaRequisicao);

export function getRouter() {
  // Um QueryClient por router: no SSR, um singleton vazaria dados entre requisições.
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Abrir ou fechar um painel que mora na URL (`?id=`, `?plantao=`) não rola a página.
    scrollRestoration: criarRestauracaoDeRolagem(),
    // Deixa o TanStack Query controlar a validade dos dados, não o cache de preload do router.
    defaultPreloadStaleTime: 0,
    // Erro ou rota inexistente aparecem dentro do layout, com o menu de pé.
    defaultErrorComponent: ErroDeRota,
    defaultNotFoundComponent: NaoEncontrada,
  });

  // Provê o QueryClientProvider e faz a desidratação/hidratação do cache entre servidor e cliente.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
