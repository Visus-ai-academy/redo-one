import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SeloCor } from './SeloCor';

describe('SeloCor', () => {
  it('pílula com a bolinha na cor do dado e o texto que encolhe com reticências', () => {
    render(<SeloCor cor="#2F6FB2">Férias</SeloCor>);
    const texto = screen.getByText('Férias');
    expect(texto).toHaveClass('truncate');
    const selo = texto.parentElement as HTMLElement;
    expect(selo).toHaveAttribute('title', 'Férias');
    expect(selo.querySelector('[aria-hidden]')).toHaveStyle({ backgroundColor: '#2F6FB2' });
  });

  it('sem cor, neutra', () => {
    render(<SeloCor cor={null}>Ausente</SeloCor>);
    expect(screen.getByText('Ausente').parentElement?.getAttribute('style')).toBeNull();
  });
});
