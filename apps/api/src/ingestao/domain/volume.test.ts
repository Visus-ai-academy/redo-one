import { describe, expect, it } from 'vitest';

import { volumeDoLaudo } from './volume';

describe('volumeDoLaudo', () => {
  it('vale VALORES quando é maior que zero', () => {
    expect(volumeDoLaudo(3, 5)).toBe(3);
  });

  it('VALORES zerado vale o valor fora do padrão do estudo', () => {
    expect(volumeDoLaudo(0, 2)).toBe(2);
  });

  it('VALORES zerado e sem valor fora do padrão vale 1', () => {
    expect(volumeDoLaudo(0, undefined)).toBe(1);
  });

  it('VALORES vazio ou negativo conta como zerado', () => {
    expect(volumeDoLaudo(null, 2)).toBe(2);
    expect(volumeDoLaudo(-1, undefined)).toBe(1);
  });

  it('ignora valor fora do padrão que não é maior que zero', () => {
    expect(volumeDoLaudo(0, 0)).toBe(1);
  });
});
