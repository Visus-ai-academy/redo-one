import { describe, expect, it } from 'vitest';

import { juntarDigito, separarDigito } from './conta-digito';

describe('conta com dígito', () => {
  it('separa no último traço', () => {
    expect(separarDigito('45678-9')).toEqual({ conta: '45678', digito: '9' });
    expect(separarDigito('12-345-X')).toEqual({ conta: '12-345', digito: 'X' });
    expect(separarDigito('456789')).toEqual({ conta: '456789', digito: '' });
    expect(separarDigito('')).toEqual({ conta: '', digito: '' });
  });

  it('junta com o traço só quando há dígito', () => {
    expect(juntarDigito('45678', '9')).toBe('45678-9');
    expect(juntarDigito(' 45678 ', ' ')).toBe('45678');
  });

  it('o que já estava gravado volta igual', () => {
    for (const gravada of ['45678-9', '456789', '12-345-X', '0001-00', '']) {
      const { conta, digito } = separarDigito(gravada);
      expect(juntarDigito(conta, digito)).toBe(gravada);
    }
  });
});
