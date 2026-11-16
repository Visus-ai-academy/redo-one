import { describe, expect, it } from 'vitest';

import { HmacPseudonimizador } from './hmac-pseudonimizador';

const segredo = 'a'.repeat(64);

describe('HmacPseudonimizador', () => {
  it('é estável para o mesmo texto e não revela o texto', () => {
    const p = new HmacPseudonimizador(segredo);
    expect(p.pseudonimo('codigo:123')).toBe(p.pseudonimo('codigo:123'));
    expect(p.pseudonimo('codigo:123')).toMatch(/^[0-9a-f]{64}$/);
    expect(p.pseudonimo('codigo:124')).not.toBe(p.pseudonimo('codigo:123'));
  });

  it('muda com o segredo', () => {
    expect(new HmacPseudonimizador('b'.repeat(64)).pseudonimo('x')).not.toBe(
      new HmacPseudonimizador(segredo).pseudonimo('x'),
    );
  });

  it('sem segredo, recusa usar (a identidade dos laudos depende dele)', () => {
    expect(() => new HmacPseudonimizador('').pseudonimo('x')).toThrow('PACIENTE_HMAC_SEGREDO');
  });
});
