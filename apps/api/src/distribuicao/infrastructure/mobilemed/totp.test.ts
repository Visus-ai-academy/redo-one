import { describe, expect, it } from 'vitest';

import { gerarTotp } from './totp';

// Vetores SHA1 da RFC 6238 (apêndice B), com a chave "12345678901234567890" em base32 e os 6
// últimos dígitos do código de 8.
const SEGREDO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('gerarTotp', () => {
  it.each([
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
  ])('no instante %is gera %s', (segundos, codigo) => {
    expect(gerarTotp(SEGREDO, segundos * 1000)).toBe(codigo);
  });

  it('aceita a chave em minúsculas, com espaços e com preenchimento', () => {
    expect(gerarTotp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq====', 59_000)).toBe('287082');
  });

  it('recusa chave fora do base32 sem repetir a chave na mensagem', () => {
    expect(() => gerarTotp('ABC1!', 0)).toThrow('TOTP: a chave não é base32.');
  });
});
