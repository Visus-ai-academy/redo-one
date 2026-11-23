import { describe, expect, it } from 'vitest';

import { client } from '../gen/.kubb/client';
import { configurarApi, loginAposSessaoExpirada } from './api';

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

describe('loginAposSessaoExpirada', () => {
  it('com 401 numa chamada comum, leva ao login e volta para a mesma tela', () => {
    expect(
      loginAposSessaoExpirada(401, 'http://api.test/medicos?pagina=2', '/cadastros/medicos?id=7'),
    ).toBe('/login?redirect=%2Fcadastros%2Fmedicos%3Fid%3D7');
  });

  it('na tela inicial, vai ao login sem destino', () => {
    expect(loginAposSessaoExpirada(401, 'http://api.test/avisos', '/')).toBe('/login');
  });

  it('ignora o 401 da própria sessão e das telas de acesso (senha errada, link vencido)', () => {
    expect(loginAposSessaoExpirada(401, 'http://api.test/sessao', '/')).toBeNull();
    expect(
      loginAposSessaoExpirada(401, 'http://api.test/senha/definir', '/definir-senha'),
    ).toBeNull();
    expect(loginAposSessaoExpirada(401, 'http://api.test/medicos', '/login')).toBeNull();
  });

  it('outros status não levam ao login', () => {
    expect(loginAposSessaoExpirada(403, 'http://api.test/medicos', '/')).toBeNull();
  });
});
