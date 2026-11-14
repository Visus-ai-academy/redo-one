import { describe, expect, it } from 'vitest';

import { formatarCep, formatarCnpj, formatarCpf, soDigitos } from './documentos';

describe('documentos', () => {
  it('formata CNPJ, CPF e CEP guardados só com dígitos', () => {
    expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90');
    expect(formatarCpf('12345678909')).toBe('123.456.789-09');
    expect(formatarCep('01310100')).toBe('01310-100');
  });

  it('devolve como está o que não tem o tamanho certo, e vazio vira traço', () => {
    expect(formatarCnpj('123')).toBe('123');
    expect(formatarCnpj(null)).toBe('—');
  });

  it('tira a pontuação', () => {
    expect(soDigitos('12.345.678/0001-90')).toBe('12345678000190');
  });
});
