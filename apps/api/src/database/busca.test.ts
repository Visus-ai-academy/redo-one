import { describe, expect, it } from 'vitest';

import { contem } from './busca';

describe('contem', () => {
  it('procura o texto em qualquer parte, com o _ valendo qualquer caractere', () => {
    expect(contem('_DIAGNOSTICA')).toBe('%_DIAGNOSTICA%');
  });
});
