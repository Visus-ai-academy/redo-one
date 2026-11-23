import { describe, expect, it } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { tipoDoErro } from './tipo-do-erro';

const http = (status: number, data: unknown = {}) =>
  new ResponseError({
    data,
    status,
    statusText: '',
    request: new Request('http://api.test/x'),
    response: new Response(),
  });

describe('tipoDoErro', () => {
  it.each([
    [401, 'sessao'],
    [403, 'permissao'],
    [404, 'nao-encontrado'],
    [409, 'conflito'],
    [500, 'servidor'],
    [503, 'servidor'],
  ] as const)('status %i → %s', (status, tipo) => {
    expect(tipoDoErro(http(status))).toBe(tipo);
  });

  it('queda de rede (fetch rejeitado)', () => {
    expect(tipoDoErro(new TypeError('Failed to fetch'))).toBe('rede');
  });

  it('tempo esgotado', () => {
    expect(tipoDoErro(new DOMException('demorou', 'TimeoutError'))).toBe('tempo');
  });

  it('o que não reconhece é tratado como falha do servidor', () => {
    expect(tipoDoErro(new Error('x'))).toBe('servidor');
  });
});
