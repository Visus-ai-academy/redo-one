import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { Segredo } from './segredo';

describe('Segredo', () => {
  it('só revelar() devolve o valor', () => {
    expect(new Segredo('abc123').revelar()).toBe('abc123');
  });

  it('não vaza em JSON, texto nem no inspect do log', () => {
    const s = new Segredo('abc123');
    expect(JSON.stringify({ token: s })).not.toContain('abc123');
    expect(`${s}`).not.toContain('abc123');
    expect(inspect({ token: s })).not.toContain('abc123');
  });
});
