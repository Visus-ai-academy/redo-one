import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AjudaContextual } from './AjudaContextual';

describe('AjudaContextual', () => {
  it('ícone com nome que abre a explicação pelo clique ou pelo teclado', async () => {
    render(<AjudaContextual assunto="a carga">Carga é o que o médico tem aberto.</AjudaContextual>);
    const botao = screen.getByRole('button', { name: 'Sobre a carga' });
    expect(screen.queryByText('Carga é o que o médico tem aberto.')).not.toBeInTheDocument();
    await userEvent.click(botao);
    expect(await screen.findByText('Carga é o que o médico tem aberto.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    botao.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Carga é o que o médico tem aberto.')).toBeInTheDocument();
  });
});
