import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { Avisos } from '../components/toast/Avisos';

/** Renderiza `ui` dentro de um router em memória, de um QueryClient sem retentativas e dos avisos. */
export function renderComRotas(ui: ReactNode, { caminho = '/' }: { caminho?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Avisos>{ui}</Avisos> }),
    history: createMemoryHistory({ initialEntries: [caminho] }),
  });

  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...resultado, router, queryClient };
}
