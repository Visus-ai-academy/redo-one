import { describe, expect, it } from 'vitest';

import { aplicarMascara } from './mascaras';

describe('aplicarMascara', () => {
  it('formata enquanto digita, sem pontuação pendurada no fim', () => {
    expect(aplicarMascara('cpf', '123')).toBe('123');
    expect(aplicarMascara('cpf', '1234')).toBe('123.4');
    expect(aplicarMascara('cpf', '12345678909')).toBe('123.456.789-09');
    expect(aplicarMascara('cnpj', '112223330001')).toBe('11.222.333/0001');
    expect(aplicarMascara('cnpj', '11222333000181')).toBe('11.222.333/0001-81');
    expect(aplicarMascara('cep', '013101')).toBe('01310-1');
  });

  it('ignora o que não é dígito e corta no tamanho do documento', () => {
    expect(aplicarMascara('cpf', 'a1b2c3.4-5 6 7 8 9 0 9 9 9')).toBe('123.456.789-09');
    expect(aplicarMascara('cep', '01310-100-77')).toBe('01310-100');
  });

  it('telefone: fixo com 8 dígitos e celular com 9 depois do DDD', () => {
    expect(aplicarMascara('telefone', '67')).toBe('(67');
    expect(aplicarMascara('telefone', '673')).toBe('(67) 3');
    expect(aplicarMascara('telefone', '6732214455')).toBe('(67) 3221-4455');
    expect(aplicarMascara('telefone', '67982060704')).toBe('(67) 98206-0704');
    expect(aplicarMascara('telefone', '(67) 982060704')).toBe('(67) 98206-0704');
  });

  it('vazio fica vazio', () => {
    expect(aplicarMascara('cpf', '')).toBe('');
  });
});
