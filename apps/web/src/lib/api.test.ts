import { describe, expect, it } from 'vitest';

import { client } from '../gen/.kubb/client';
import { configurarApi } from './api';

const pedido = () => ({ url: 'http://api.test/sessao', method: 'GET', headers: {} });

describe('configurarApi', () => {
  it('envia o cookie da sessão em toda chamada à API', () => {
    configurarApi(() => undefined);

    expect(client.getConfig().credentials).toBe('include');
  });

  it('no SSR, repassa à API o cookie da requisição do navegador', async () => {
    configurarApi(() => 'one_sessao=abc');

    const resolvido = await client.interceptors.request.run(pedido());

    expect(resolvido.headers.cookie).toBe('one_sessao=abc');
  });

  it('sem cookie para repassar, não mexe nos cabeçalhos', async () => {
    configurarApi(() => undefined);

    const resolvido = await client.interceptors.request.run(pedido());

    expect(resolvido.headers).toEqual({});
  });
});
