import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BolinhaCor } from './BolinhaCor';

describe('BolinhaCor', () => {
  it('pinta com a cor, escondida do leitor de tela', () => {
    const { container } = render(<BolinhaCor cor="#4E8C88" />);
    const bolinha = container.querySelector('[data-cor]');
    expect(bolinha).toHaveStyle({ backgroundColor: '#4E8C88' });
    expect(bolinha).toHaveAttribute('aria-hidden', 'true');
  });

  it('sem cor, fica só o contorno (sem estilo próprio)', () => {
    const { container } = render(<BolinhaCor cor={null} />);
    const bolinha = container.querySelector('[data-cor]');
    expect(bolinha).not.toHaveAttribute('style');
    expect(bolinha).toHaveClass('border-border');
  });
});
