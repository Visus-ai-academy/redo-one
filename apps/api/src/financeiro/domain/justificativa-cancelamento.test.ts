import { describe, expect, it } from 'vitest';

import { justificativaCancelamento } from './justificativa-cancelamento';

describe('justificativaCancelamento', () => {
  it('apara espaços e aceita de 15 a 255 caracteres (xMotivo da NFS-e Nacional)', () => {
    expect(justificativaCancelamento('  Serviço não prestado ao cliente  ')).toBe(
      'Serviço não prestado ao cliente',
    );
    expect(justificativaCancelamento('a'.repeat(255))).toHaveLength(255);
  });

  it.each([
    ['vazia', '   '],
    ['curta', 'erro na nota'],
    ['longa', 'a'.repeat(256)],
  ])('recusa justificativa %s', (_caso, texto) => {
    expect(() => justificativaCancelamento(texto)).toThrow(/15 a 255 caracteres/);
  });
});
