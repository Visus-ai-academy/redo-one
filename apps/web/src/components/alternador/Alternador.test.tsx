import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Alternador } from './Alternador';

describe('Alternador', () => {
  it('liga e desliga, dizendo o estado ao leitor de tela', async () => {
    const onMudar = vi.fn();
    const { rerender } = render(
      <Alternador ligado={false} onMudar={onMudar}>
        Fim de semana
      </Alternador>,
    );

    const botao = screen.getByRole('button', { name: 'Fim de semana' });
    expect(botao).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(botao);
    expect(onMudar).toHaveBeenCalledWith(true);

    rerender(
      <Alternador ligado onMudar={onMudar}>
        Fim de semana
      </Alternador>,
    );
    expect(screen.getByRole('button', { name: 'Fim de semana' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
