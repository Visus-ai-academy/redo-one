import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Etapas } from './Etapas';

describe('Etapas', () => {
  it('marca a etapa de agora e anuncia as feitas', () => {
    render(
      <Etapas
        aria-label="Etapas da rodada"
        etapas={[
          { rotulo: 'Pedida', estado: 'feito' },
          { rotulo: 'Lendo a fila', estado: 'agora' },
          { rotulo: 'Concluída', estado: 'futuro' },
        ]}
      />,
    );
    const lista = screen.getByRole('list', { name: 'Etapas da rodada' });
    expect(lista).toHaveTextContent('Pedida (feito)');
    expect(screen.getByText('Lendo a fila').closest('li')).toHaveAttribute('aria-current', 'step');
  });
});
