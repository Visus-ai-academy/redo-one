import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BarraDeCarregamento } from './BarraDeCarregamento';

describe('BarraDeCarregamento', () => {
  it('enquanto a tela carrega, mostra uma barra de progresso sem valor', () => {
    render(<BarraDeCarregamento ativa />);

    const barra = screen.getByRole('progressbar', { name: 'Carregando a tela' });
    expect(barra).not.toHaveAttribute('aria-valuenow');
  });

  it('parada, não aparece', () => {
    render(<BarraDeCarregamento ativa={false} />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
