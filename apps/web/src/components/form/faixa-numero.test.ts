import { describe, expect, it } from 'vitest';

import { erroDeFaixa } from './faixa-numero';

describe('erroDeFaixa', () => {
  it('dentro da faixa, vazio ou sem limites: sem erro', () => {
    expect(erroDeFaixa('1', 1, 1440)).toBeUndefined();
    expect(erroDeFaixa('1440', 1, 1440)).toBeUndefined();
    expect(erroDeFaixa('', 1, 1440)).toBeUndefined();
    expect(erroDeFaixa('99999', undefined, undefined)).toBeUndefined();
  });

  it('fora da faixa: diz qual é a faixa', () => {
    expect(erroDeFaixa('2000', 1, 1440)).toBe('Use um valor entre 1 e 1440.');
    expect(erroDeFaixa('0', 1, 1440)).toBe('Use um valor entre 1 e 1440.');
  });

  it('só com um dos limites, diz só ele; decimais em pt-BR', () => {
    expect(erroDeFaixa('-1', 0, undefined)).toBe('Use um valor a partir de 0.');
    expect(erroDeFaixa('101', undefined, 100)).toBe('Use um valor até 100.');
    expect(erroDeFaixa('0', 0.5, 99.9)).toBe('Use um valor entre 0,5 e 99,9.');
  });
});
