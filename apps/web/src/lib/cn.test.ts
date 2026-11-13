import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('junta classes condicionais', () => {
    expect(cn('px-2', false && 'hidden', { 'font-bold': true })).toBe('px-2 font-bold');
  });

  it('resolve conflitos do Tailwind mantendo a última classe', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
