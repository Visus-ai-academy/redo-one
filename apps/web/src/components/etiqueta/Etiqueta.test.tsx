import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Etiqueta } from './Etiqueta';

describe('Etiqueta', () => {
  it('em espaço apertado, encolhe e corta o texto com reticências (o texto inteiro fica no title)', () => {
    render(<Etiqueta tom="atencao">Coberto por Dra. Lorena Ramos Santos</Etiqueta>);
    const texto = screen.getByText('Coberto por Dra. Lorena Ramos Santos');
    expect(texto).toHaveClass('truncate');
    expect(texto.parentElement).toHaveClass('max-w-full', 'min-w-0');
    expect(texto.parentElement).toHaveAttribute('title', 'Coberto por Dra. Lorena Ramos Santos');
  });
});
