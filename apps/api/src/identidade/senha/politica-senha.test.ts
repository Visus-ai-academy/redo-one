import { describe, expect, it } from 'vitest';

import { problemasDaSenha } from './politica-senha';

describe('problemasDaSenha', () => {
  it('aceita 8 caracteres com letra e número', () => {
    expect(problemasDaSenha('cafe2026')).toEqual([]);
  });

  it.each([
    ['curta1', ['Use pelo menos 8 caracteres.']],
    ['somenteletras', ['Use letras e números.']],
    ['12345678', ['Use letras e números.']],
    ['aaa', ['Use pelo menos 8 caracteres.', 'Use letras e números.']],
  ])('"%s" tem problemas', (senha, problemas) => {
    expect(problemasDaSenha(senha)).toEqual(problemas);
  });

  it('aceita letras acentuadas como letra', () => {
    expect(problemasDaSenha('ção12345')).toEqual([]);
  });
});
