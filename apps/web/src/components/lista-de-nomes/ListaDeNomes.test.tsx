import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ListaDeNomes } from './ListaDeNomes';

const nomes = Array.from({ length: 30 }, (_, i) => `CLINICA ${String(i + 1).padStart(2, '0')}`);

describe('ListaDeNomes', () => {
  it('mostra o rótulo com o total e só os primeiros nomes', () => {
    render(<ListaDeNomes rotulo="Tabelas de preço que o usam" nomes={nomes} visiveis={12} />);
    const lista = screen.getByRole('list', { name: 'Tabelas de preço que o usam' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByText('Tabelas de preço que o usam')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.queryByText('CLINICA 13')).not.toBeInTheDocument();
  });

  it('"Mostrar todos" abre o resto e "Mostrar menos" recolhe', async () => {
    render(<ListaDeNomes rotulo="Tabelas" nomes={nomes} visiveis={12} />);
    const botao = screen.getByRole('button', { name: 'Mostrar todos os 30' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(botao);
    expect(screen.getByText('CLINICA 30')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar menos' }));
    expect(screen.queryByText('CLINICA 30')).not.toBeInTheDocument();
  });

  it('com poucos nomes, mostra todos sem botão', () => {
    render(<ListaDeNomes rotulo="Tabelas" nomes={['A', 'B']} visiveis={12} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
