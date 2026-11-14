import { describe, expect, it } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { mensagemDaApi } from './mensagem-da-api';

const erroHttp = (status: number, data: unknown) =>
  new ResponseError({
    status,
    data,
    statusText: '',
    request: new Request('http://x'),
    response: new Response(),
  });

describe('mensagemDaApi', () => {
  it('usa a mensagem que a API escreveu para a pessoa nos erros de regra (400, 403, 404, 409)', () => {
    expect(mensagemDaApi(erroHttp(409, { message: 'A modalidade está em uso.' }), 'x')).toBe(
      'A modalidade está em uso.',
    );
  });

  it('cai no texto padrão em falha de rede, erro 500 ou mensagem que é lista de validação', () => {
    expect(mensagemDaApi(new Error('fetch failed'), 'Tente de novo.')).toBe('Tente de novo.');
    expect(mensagemDaApi(erroHttp(500, { message: 'boom' }), 'Tente de novo.')).toBe(
      'Tente de novo.',
    );
    expect(
      mensagemDaApi(erroHttp(400, { message: ['nome must be a string'] }), 'Tente de novo.'),
    ).toBe('Tente de novo.');
  });
});
