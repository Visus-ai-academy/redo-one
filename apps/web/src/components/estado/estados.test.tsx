import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { ErroInesperado, NaoEncontrada } from './estados';

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

    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentarDeNovo).toHaveBeenCalled();
  });
});
