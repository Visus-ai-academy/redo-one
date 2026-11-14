import { describe, expect, it } from 'vitest';

import { normalizarNome } from './nomes';

describe('normalizarNome', () => {
  it('tira acento, minúsculo, mantém dígitos e junta separadores num espaço', () => {
    expect(normalizarNome('CEDI_RJ')).toBe('cedi rj');
    expect(normalizarNome('  CDI.URUAÇU -- 2 ')).toBe('cdi uruacu 2');
    expect(normalizarNome('Tórax / Abdome')).toBe('torax abdome');
  });
});
