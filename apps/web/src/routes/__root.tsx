import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';

import { themeInitScript } from '../lib/theme';
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
    links: [{ rel: 'stylesheet', href: appCss }],
    // Roda antes da pintura para aplicar o tema salvo (evita flash do tema claro).
    scripts: [{ children: themeInitScript }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    // O script de tema altera a classe do <html> antes da hidratação.
    <html lang="pt-BR" suppressHydrationWarning>
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
