import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CamposCarregando } from './CamposCarregando';

describe('CamposCarregando', () => {
  it('mostra a forma dos campos e avisa o leitor de tela', () => {
    render(<CamposCarregando quantidade={3} />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
  });

  it('dentro de algo que já avisa, fica só a forma', () => {
    render(<CamposCarregando anunciar={false} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
