import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Abas } from './Abas';

describe('Abas', () => {
  it('marca a aba atual, troca pelo clique e mostra só o conteúdo dela', async () => {
    const onMudar = vi.fn();
    render(
      <Abas
        aria-label="Listas do catálogo"
        valor="modalidades"
        onMudar={onMudar}
        abas={[
          { valor: 'modalidades', rotulo: 'Modalidades' },
          { valor: 'prioridades', rotulo: 'Prioridades' },
        ]}
      >
        <p>Conteúdo das modalidades</p>
      </Abas>,
    );

    expect(screen.getByRole('tablist', { name: 'Listas do catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Modalidades' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo das modalidades');

    await userEvent.click(screen.getByRole('tab', { name: 'Prioridades' }));
    expect(onMudar).toHaveBeenCalledWith('prioridades');
  });
});
