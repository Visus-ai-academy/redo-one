import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Dica } from './Dica';

describe('Dica', () => {
  it('mostra o rótulo ao passar o mouse e mantém o botão com o próprio nome', async () => {
    render(
      <Dica rotulo="Sair do One">
        <button type="button" aria-label="Sair do One">
          x
        </button>
      </Dica>,
    );

    await userEvent.hover(screen.getByRole('button', { name: 'Sair do One' }));

    expect(await screen.findByText('Sair do One')).toBeVisible();
  });

  it('desativada, não aparece', async () => {
    render(
      <Dica rotulo="Clientes" desativada>
        <button type="button">Clientes</button>
      </Dica>,
    );

    await userEvent.hover(screen.getByRole('button', { name: 'Clientes' }));
    await new Promise((r) => setTimeout(r, 400));

    expect(screen.queryByText('Clientes', { selector: 'div' })).not.toBeInTheDocument();
  });
});
