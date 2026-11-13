import { describe, expect, it } from 'vitest';

import { destinoSeguro, horaDeBrasilia } from './acesso';

describe('destinoSeguro', () => {
  it('aceita caminho interno', () => {
    expect(destinoSeguro('/configuracoes/usuarios?pagina=2')).toBe(
      '/configuracoes/usuarios?pagina=2',
    );
  });

  it('volta para o início sem destino', () => {
    expect(destinoSeguro(undefined)).toBe('/');
  });

  it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', 'login'])(
    'recusa destino externo ou malformado (%s)',
    (destino) => {
      expect(destinoSeguro(destino)).toBe('/');
    },
  );
});

describe('horaDeBrasilia', () => {
  it('formata a hora no fuso de Brasília', () => {
    expect(horaDeBrasilia('2026-11-13T17:32:00.000Z')).toBe('14:32');
  });
});
