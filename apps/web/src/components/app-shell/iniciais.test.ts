import { describe, expect, it } from 'vitest';

import { iniciais } from './iniciais';

describe('iniciais', () => {
  it.each([
    ['Maria Souza', 'MS'],
    ['Maria da Silva Souza', 'MS'],
    ['carlos', 'C'],
    ['  ', ''],
    ['Pessoa Teste 07', 'PT'],
  ])('%s → %s', (nome, esperado) => {
    expect(iniciais(nome)).toBe(esperado);
  });
});
