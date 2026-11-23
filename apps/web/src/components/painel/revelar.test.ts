import { describe, expect, it, vi } from 'vitest';

import { revelarSobOPainel } from './revelar';

function caixa(left: number, right: number) {
  return { left, right, top: 0, bottom: 10 } as DOMRect;
}

function montar({ origem, rola = true }: { origem: [number, number]; rola?: boolean }) {
  const grade = document.createElement('div');
  grade.style.overflowX = 'auto';
  Object.defineProperty(grade, 'scrollWidth', { value: rola ? 2000 : 1000 });
  Object.defineProperty(grade, 'clientWidth', { value: 1000 });
  grade.scrollBy = vi.fn();
  const celula = document.createElement('button');
  celula.getBoundingClientRect = () => caixa(...origem);
  grade.append(celula);
  const painel = document.createElement('div');
  painel.getBoundingClientRect = () => caixa(1040, 1440);
  document.body.append(grade, painel);
  return { grade, celula, painel };
}

describe('revelarSobOPainel', () => {
  it('rola a grade até o item que ficou embaixo do painel', () => {
    const { grade, celula, painel } = montar({ origem: [1100, 1200] });

    revelarSobOPainel(celula, painel);

    expect(grade.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 176 }));
  });

  it('item à vista: não mexe', () => {
    const { grade, celula, painel } = montar({ origem: [100, 200] });

    revelarSobOPainel(celula, painel);

    expect(grade.scrollBy).not.toHaveBeenCalled();
  });

  it('a grade não rola de lado: não há o que fazer', () => {
    const { grade, celula, painel } = montar({ origem: [1100, 1200], rola: false });

    expect(() => revelarSobOPainel(celula, painel)).not.toThrow();
    expect(grade.scrollBy).not.toHaveBeenCalled();
  });
});
