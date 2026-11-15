import { describe, expect, it } from 'vitest';

import { contem } from './busca';

describe('contem', () => {
  it('trata _, % e \\ digitados como texto, não como curinga do LIKE', () => {
    expect(contem('_DIAGNOSTICA')).toBe('%\\_DIAGNOSTICA%');
    expect(contem('50%')).toBe('%50\\%%');
    expect(contem('a\\b')).toBe('%a\\\\b%');
  });
});
