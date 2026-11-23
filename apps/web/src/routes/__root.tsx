import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';

import { ErroDeRota, NaoEncontrada } from '../components/estado/estados';
import appCss from '../styles.css?url';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'One' },
      // Sistema interno, todo atrás de login: nenhuma página deve ser indexada.
      { name: 'robots', content: 'noindex, nofollow' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // Anéis com mira das telas de acesso sobre o verde do menu.
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NaoEncontrada,
  errorComponent: ErroDeRota,
});

function RootComponent() {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app">
          <Outlet />
        </div>
        <Scripts />
      </body>
    </html>
  );
}
