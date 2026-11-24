import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { renderComRotas } from '../../test/render';
import { ErroDeRota, ErroInesperado, NaoEncontrada, SemPermissao } from './estados';

const http = (status: number) =>
  new ResponseError({
    data: {},
    status,
    statusText: '',
    request: new Request('http://api.test/x'),
    response: new Response(),
  });

/** Layout com menu e uma tela cujo loader falha com `erro`; o erro usa o padrão do router. */
function renderTelaQueFalha(erro: unknown) {
  const raiz = createRootRoute({
    component: () => (
      <div>
        <nav aria-label="Menu">Menu do One</nav>
        <Outlet />
      </div>
    ),
  });
  const tela = createRoute({
    getParentRoute: () => raiz,
    path: '/usuarios',
    loader: () => {
      throw erro;
    },
    component: () => <p>Lista de usuários</p>,
  });
  const router = createRouter({
    routeTree: raiz.addChildren([tela]),
    history: createMemoryHistory({ initialEntries: ['/usuarios'] }),
    defaultErrorComponent: ErroDeRota,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('NaoEncontrada', () => {
  it('diz que a página não existe e leva ao início', async () => {
    renderComRotas(<NaoEncontrada />);

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});

describe('ErroInesperado', () => {
  it('explica o problema e deixa tentar de novo', async () => {
    const tentarDeNovo = vi.fn();
    renderComRotas(<ErroInesperado onTentarDeNovo={tentarDeNovo} />);

    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar esta página' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentarDeNovo).toHaveBeenCalled();
  });
});

describe('SemPermissao', () => {
  it('diz que não há permissão para a tela e leva à tela inicial', async () => {
    renderComRotas(<SemPermissao tela="Usuários" />);

    expect(
      await screen.findByRole('heading', { name: 'Você não tem permissão para ver esta tela.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Seu papel não dá acesso a Usuários/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para a tela inicial' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('sem o nome da tela, diz só quem libera', async () => {
    renderComRotas(<SemPermissao />);

    expect(
      await screen.findByRole('heading', { name: 'Você não tem permissão para ver esta tela.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/quem administra o One/)).toBeInTheDocument();
  });
});

describe('ErroDeRota', () => {
  it('403 da API: acesso negado dentro do layout, com o menu de pé', async () => {
    renderTelaQueFalha(http(403));

    expect(
      await screen.findByRole('heading', { name: 'Você não tem permissão para ver esta tela.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para a tela inicial' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByText(/Confira sua conexão/)).not.toBeInTheDocument();
  });

  it('500 da API: continua o erro inesperado, com "Tentar de novo"', async () => {
    renderTelaQueFalha(http(500));

    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar esta página' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.queryByText(/não tem permissão/)).not.toBeInTheDocument();
  });

  it('sem rede: continua o erro inesperado', async () => {
    renderTelaQueFalha(new TypeError('Failed to fetch'));

    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar esta página' }),
    ).toBeInTheDocument();
  });
});
