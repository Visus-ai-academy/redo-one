import { describe, expect, it } from 'vitest';

import { cpfMascarado } from './cpf';

describe('cpfMascarado', () => {
  it('mostra só os dois últimos dígitos', () => {
    expect(cpfMascarado('41')).toBe('•••.•••.•••-41');
  });

  it('sem CPF, diz que não foi informado', () => {
    expect(cpfMascarado(null)).toBe('Não informado');
  });
});
