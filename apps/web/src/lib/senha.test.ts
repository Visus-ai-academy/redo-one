import { describe, expect, it } from 'vitest';

import { requisitosDaSenha } from './senha';

const atendidos = (senha: string, confirmacao: string) =>
  requisitosDaSenha(senha, confirmacao).map((r) => [r.texto, r.atendido]);

describe('requisitosDaSenha', () => {
  it('lista os três requisitos pendentes com a senha vazia', () => {
    expect(atendidos('', '')).toEqual([
      ['Pelo menos 8 caracteres', false],
      ['Letras e números', false],
      ['As duas senhas são iguais', false],
    ]);
  });

  it('marca cada requisito conforme a senha', () => {
    expect(atendidos('abcdefgh', 'abc')).toEqual([
      ['Pelo menos 8 caracteres', true],
      ['Letras e números', false],
      ['As duas senhas são iguais', false],
    ]);
    expect(atendidos('abcdefg1', 'abcdefg1')).toEqual([
      ['Pelo menos 8 caracteres', true],
      ['Letras e números', true],
      ['As duas senhas são iguais', true],
    ]);
  });

  it('aceita letras acentuadas como letras', () => {
    expect(atendidos('çãoéíõú1', '')[1]).toEqual(['Letras e números', true]);
  });
});
