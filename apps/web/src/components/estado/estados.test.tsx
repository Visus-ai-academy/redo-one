import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { ErroInesperado, NaoEncontrada, SemPermissao } from './estados';

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
  it('diz qual tela o papel não abre e leva ao início', async () => {
    renderComRotas(<SemPermissao tela="Usuários" />);

    expect(
      await screen.findByRole('heading', { name: 'Sem acesso a esta tela' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Seu papel não permite abrir Usuários/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});
