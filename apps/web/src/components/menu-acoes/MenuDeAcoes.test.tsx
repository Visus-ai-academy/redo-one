import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MenuDeAcoes } from './MenuDeAcoes';

describe('MenuDeAcoes', () => {
  it('abre as ações e chama a escolhida; a desabilitada diz por quê', async () => {
    const prorrogar = vi.fn();
    const cancelar = vi.fn();
    render(
      <MenuDeAcoes
        aria-label="Mais ações do título"
        acoes={[
          { rotulo: 'Prorrogar vencimento…', onEscolher: prorrogar },
          {
            rotulo: 'Cancelar título…',
            onEscolher: cancelar,
            destrutiva: true,
            desabilitada: 'Estorne as baixas antes.',
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mais ações do título' }));
    expect(await screen.findByText('Estorne as baixas antes.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Prorrogar vencimento…' }));
    expect(prorrogar).toHaveBeenCalled();
    expect(cancelar).not.toHaveBeenCalled();
  });

  it('sem ações, não aparece', () => {
    const { container } = render(<MenuDeAcoes aria-label="Mais ações" acoes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
