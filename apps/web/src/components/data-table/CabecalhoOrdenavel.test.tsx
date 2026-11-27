import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CabecalhoOrdenavel } from './CabecalhoOrdenavel';

describe('CabecalhoOrdenavel', () => {
  it('clicar ordena pela coluna; na coluna já ordenada, inverte a direção', async () => {
    const onOrdenar = vi.fn();
    const { rerender } = render(
      <CabecalhoOrdenavel
        coluna="bruto"
        ordenacao={{ coluna: 'medico', direcao: 'asc' }}
        onOrdenar={onOrdenar}
        numerico
      >
        Bruto
      </CabecalhoOrdenavel>,
    );
    const botao = screen.getByRole('button', { name: 'Bruto' });
    // Coluna de número começa do maior.
    await userEvent.click(botao);
    expect(onOrdenar).toHaveBeenLastCalledWith({ coluna: 'bruto', direcao: 'desc' });

    rerender(
      <CabecalhoOrdenavel
        coluna="bruto"
        ordenacao={{ coluna: 'bruto', direcao: 'desc' }}
        onOrdenar={onOrdenar}
        numerico
      >
        Bruto
      </CabecalhoOrdenavel>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bruto, do maior para o menor' }));
    expect(onOrdenar).toHaveBeenLastCalledWith({ coluna: 'bruto', direcao: 'asc' });
  });

  it('coluna de texto começa de A a Z e fica à esquerda; a de número, à direita', async () => {
    const onOrdenar = vi.fn();
    render(
      <CabecalhoOrdenavel
        coluna="medico"
        ordenacao={{ coluna: 'bruto', direcao: 'desc' }}
        onOrdenar={onOrdenar}
      >
        Médico
      </CabecalhoOrdenavel>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Médico' }));
    expect(onOrdenar).toHaveBeenLastCalledWith({ coluna: 'medico', direcao: 'asc' });
    expect(screen.getByRole('button', { name: 'Médico' })).not.toHaveClass('justify-end');
  });
});
