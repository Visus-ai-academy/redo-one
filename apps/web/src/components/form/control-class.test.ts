import { describe, expect, it } from 'vitest';

import { controlClassName } from './control-class';

describe('controlClassName', () => {
  it('texto de 16px no celular e 14px a partir de sm, para o iOS não dar zoom ao focar', () => {
    expect(controlClassName('app').split(' ')).toEqual(
      expect.arrayContaining(['text-base', 'sm:text-sm']),
    );
  });

  it('telas de acesso ficam com 16px em qualquer largura', () => {
    const classes = controlClassName('acesso').split(' ');
    expect(classes).toContain('text-base');
    expect(classes).not.toContain('sm:text-sm');
  });
});
