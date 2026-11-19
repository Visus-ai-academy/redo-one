import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ErroMobileMed } from './cliente-mobilemed';
import { TokenMobileMedLogin } from './token-mobilemed';
import { gerarTotp } from './totp';

const OAUTH = 'https://gateway-sa.mobilemed.com.br/oauth/us-east-1_6Ey29vkej/mobilemed';
const CLIENT_ID = '4himolqrop85htlpcl6k1ljmos';
const SEGREDO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const INICIO = 1_800_000_010_000; // 10 s dentro de uma janela de 30 s do TOTP

/** JWT sem assinatura válida: o adaptador só lê o `exp`. */
const jwt = (nome: string, expSegundos: number) =>
  `h.${Buffer.from(JSON.stringify({ exp: expSegundos, nome })).toString('base64url')}.s`;

interface Chamada {
  url: string;
  metodo: string;
  corpo: string;
  contentType: string;
  headers: Record<string, string>;
}

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

/** MobileMed simulada (relógio, fetch e espera injetados). Nada sai do processo. */
const criar = (respostas: ((init: RequestInit) => Response | Promise<Response>)[]) => {
  let agora = INICIO;
  const chamadas: Chamada[] = [];
  const esperas: number[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    chamadas.push({
      url,
      metodo: String(init.method),
      corpo: String(init.body),
      contentType: headers['Content-Type'] ?? '',
      headers,
    });
    const proxima = respostas.shift();
    if (!proxima) throw new Error('chamada a mais');
    return proxima(init);
  }) as unknown as typeof globalThis.fetch;
  const token = new TokenMobileMedLogin({
    usuario: 'robo@exemplo.com',
    senha: 'senha-secreta-1',
    totpSegredo: SEGREDO,
    timeoutMs: 1_000,
    fetch,
    agora: () => agora,
    esperar: async (ms) => {
      esperas.push(ms);
      agora += ms;
    },
  });
  return {
    token,
    chamadas,
    esperas,
    avancar: (ms: number) => {
      agora += ms;
    },
    agora: () => agora,
  };
};

/** O `/authorize` devolve o código que o `/token` troca no fim (com o mesmo `state`). */
const autorizar =
  (codigo = 'codigo-1') =>
  (init: RequestInit) =>
    resposta({
      client_id: CLIENT_ID,
      authorization_code: codigo,
      state: JSON.parse(String(init.body)).state,
    });
const desafio = () => resposta({ challenge: 'TOTP', challenge_session: 'sessao-1' });
/** Tokens do Cognito (não servem para a API): vão para o `/storage`. */
const cognito = () =>
  resposta({
    access_token: 'cognito-access',
    id_token: 'cognito-id',
    refresh_token: 'cognito-refresh',
    expires_in: 3600,
    token_type: 'Bearer',
    email: 'robo@exemplo.com',
  });
const guardar = () => resposta({ success: true, session: 'x' });
const tokens =
  (nome: string, refresh = `r-${nome}`, validadeS = 300) =>
  () =>
    resposta({
      access_token: jwt(nome, Math.floor(INICIO / 1000) + validadeS),
      refresh_token: refresh,
      id_token: 'id',
    });

/** O login inteiro, como o navegador: authorize, e-mail e senha, TOTP, storage e token. */
const login = (nome: string, refresh = `r-${nome}`, validadeS = 300) => [
  autorizar(),
  desafio,
  cognito,
  guardar,
  tokens(nome, refresh, validadeS),
];
const LOGIN = ['/authorize', '/login/auth', '/login/challenge/totp', '/storage', '/token'];

const erroDe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ErroMobileMed;
  }
  throw new Error('não falhou');
};

describe('TokenMobileMedLogin', () => {
  it('faz o login do navegador (PKCE) e devolve o access token do GATEWAY, não o do Cognito', async () => {
    const m = criar(login('a1'));
    expect(await m.token.accessToken()).toBe(jwt('a1', Math.floor(INICIO / 1000) + 300));

    expect(m.chamadas.map((c) => `${c.metodo} ${c.url.replace(OAUTH, '')}`)).toEqual([
      'PUT /authorize',
      'POST /login/auth',
      'POST /login/challenge/totp',
      'PUT /storage',
      'POST /token',
    ]);
    const [authorize, auth, totp, storage, token] = m.chamadas;
    const pedido = JSON.parse(authorize?.corpo ?? '');
    expect(pedido).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: 'https://laudos.mobilemed.com.br/oauth/callback',
      response_type: 'code',
      scope: 'openid',
      code_challenge_method: 'S256',
      prompt: 'login',
    });
    expect(pedido.state).toMatch(/^[\w-]{16,}$/);
    expect(JSON.parse(auth?.corpo ?? '')).toEqual({
      email: 'robo@exemplo.com',
      password: 'senha-secreta-1',
      client_id: CLIENT_ID,
    });
    expect(JSON.parse(totp?.corpo ?? '')).toEqual({
      client_id: CLIENT_ID,
      challenge_session: 'sessao-1',
      code: gerarTotp(SEGREDO, INICIO),
    });
    expect(JSON.parse(storage?.corpo ?? '')).toEqual({
      access_token: 'cognito-access',
      id_token: 'cognito-id',
      refresh_token: 'cognito-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      email: 'robo@exemplo.com',
      authorization_code: 'codigo-1',
    });
    expect(token?.contentType).toBe('application/x-www-form-urlencoded');
    const troca = Object.fromEntries(new URLSearchParams(token?.corpo));
    expect(troca).toMatchObject({
      grant_type: 'authorization_code',
      code: 'codigo-1',
      redirect_uri: 'https://laudos.mobilemed.com.br/oauth/callback',
      client_id: CLIENT_ID,
    });
    // PKCE: o desafio do /authorize é o sha256 do verificador mandado no /token.
    expect(troca.code_verifier).toMatch(/^[\w-]{43}$/);
    expect(pedido.code_challenge).toBe(
      createHash('sha256')
        .update(troca.code_verifier ?? '')
        .digest('base64url'),
    );
    expect(m.esperas).toEqual([]);
  });

  it('manda Origin da tela de login e Accept em todas as chamadas (sem Origin, o gateway dá 403)', async () => {
    const m = criar([...login('a1'), tokens('a2', 'r2', 600)]);
    await m.token.accessToken();
    m.avancar(241_000);
    await m.token.accessToken();

    expect(m.chamadas).toHaveLength(6);
    for (const c of m.chamadas) {
      expect(c.headers).toMatchObject({
        Origin: 'https://login.mobilemed.com.br',
        Accept: 'application/json, text/plain, */*',
      });
    }
  });

  it('cada login usa um verificador e um state novos', async () => {
    const m = criar([...login('a1'), () => resposta({}, 500), ...login('a2')]);
    await m.token.accessToken();
    m.avancar(241_000);
    await m.token.accessToken();

    const verificadores = m.chamadas
      .filter((c) => c.url.endsWith('/token') && c.corpo.includes('authorization_code'))
      .map((c) => new URLSearchParams(c.corpo).get('code_verifier'));
    expect(verificadores).toHaveLength(2);
    expect(verificadores[0]).not.toBe(verificadores[1]);
  });

  it('nenhum log leva token, código, senha ou chave', async () => {
    const logs: string[] = [];
    const { Logger } = await import('@nestjs/common');
    const espias = (['log', 'warn', 'error'] as const).map((nivel) => {
      const original = Logger.prototype[nivel];
      Logger.prototype[nivel] = (mensagem: unknown) => {
        logs.push(String(mensagem));
      };
      return () => {
        Logger.prototype[nivel] = original;
      };
    });
    try {
      const m = criar([...login('a1'), () => resposta({}, 500), () => resposta({}, 400)]);
      await m.token.accessToken();
      m.avancar(241_000);
      await erroDe(m.token.accessToken());
    } finally {
      for (const desfazer of espias) desfazer();
    }
    expect(logs.length).toBeGreaterThan(0);
    const tudo = logs.join('\n');
    for (const segredo of [
      'robo@exemplo.com',
      'senha-secreta-1',
      SEGREDO,
      'cognito-access',
      'cognito-refresh',
      'codigo-1',
      'r-a1',
      'sessao-1',
      gerarTotp(SEGREDO, INICIO),
    ]) {
      expect(tudo).not.toContain(segredo);
    }
  });

  it('com o código a menos de 5 s de vencer, espera a próxima janela antes de mandar', async () => {
    const m = criar(login('a1'));
    m.avancar(17_000); // 27 s da janela: faltam 3 s
    await m.token.accessToken();
    expect(m.esperas).toEqual([4_000]);
    expect(JSON.parse(m.chamadas[2]?.corpo ?? '').code).toBe(gerarTotp(SEGREDO, m.agora()));
  });

  it('aceita login que já devolve os tokens do Cognito, sem desafio, e segue para o storage', async () => {
    const m = criar([autorizar(), cognito, guardar, tokens('a1')]);
    expect(await m.token.accessToken()).toBe(jwt('a1', Math.floor(INICIO / 1000) + 300));
    expect(m.chamadas.map((c) => c.url.replace(OAUTH, ''))).toEqual([
      '/authorize',
      '/login/auth',
      '/storage',
      '/token',
    ]);
  });

  it('guarda o access token até faltar 1 minuto para vencer', async () => {
    const m = criar(login('a1'));
    const primeiro = await m.token.accessToken();
    m.avancar(239_000);
    expect(await m.token.accessToken()).toBe(primeiro);
    expect(m.chamadas).toHaveLength(5);
  });

  it('perto de vencer, renova pelo refresh token e usa o refresh novo na vez seguinte', async () => {
    const m = criar([...login('a1', 'r1'), tokens('a2', 'r2', 600), tokens('a3', 'r3', 900)]);
    await m.token.accessToken();
    m.avancar(241_000);
    expect(await m.token.accessToken()).toBe(jwt('a2', Math.floor(INICIO / 1000) + 600));
    m.avancar(300_000);
    await m.token.accessToken();

    const [renovacao, outra] = m.chamadas.slice(5);
    expect(renovacao?.url).toBe(`${OAUTH}/token`);
    expect(renovacao?.contentType).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(renovacao?.corpo))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
      client_id: CLIENT_ID,
    });
    expect(new URLSearchParams(outra?.corpo).get('refresh_token')).toBe('r2');
  });

  it('mantém o refresh token antigo quando a renovação não devolve outro', async () => {
    const m = criar([
      ...login('a1', 'r1'),
      () => resposta({ access_token: jwt('a2', Math.floor(INICIO / 1000) + 600) }),
      tokens('a3', 'r3', 900),
    ]);
    await m.token.accessToken();
    m.avancar(241_000);
    await m.token.accessToken();
    m.avancar(300_000);
    await m.token.accessToken();
    expect(new URLSearchParams(m.chamadas[6]?.corpo).get('refresh_token')).toBe('r1');
  });

  it('recusa o /authorize que devolve outro state', async () => {
    // Sem o state de volta igual ao pedido, o código pode não ser deste login.
    const m = criar([
      () => resposta({ client_id: CLIENT_ID, authorization_code: 'c', state: 'x' }),
    ]);
    const erro = await erroDe(m.token.accessToken());
    expect(erro.tipo).toBe('resposta_inesperada');
    expect(m.chamadas).toHaveLength(1);
  });

  it('pedidos ao mesmo tempo dividem uma renovação só (o refresh gira a cada uso)', async () => {
    let liberar: () => void = () => {};
    const segura = new Promise<void>((r) => {
      liberar = r;
    });
    const [primeira, ...resto] = login('a1');
    const m = criar([
      async (init) => {
        await segura;
        return (primeira as (init: RequestInit) => Response)(init);
      },
      ...resto,
    ]);
    const pedidos = [m.token.accessToken(), m.token.accessToken(), m.token.accessToken()];
    liberar();
    const valores = await Promise.all(pedidos);
    expect(new Set(valores).size).toBe(1);
    expect(m.chamadas).toHaveLength(5);
  });

  it('se o refresh é recusado, refaz o login com usuário, senha e TOTP', async () => {
    const m = criar([
      ...login('a1'),
      () => resposta({ message: 'Refresh token not found' }, 500),
      ...login('a2', 'r2', 600),
    ]);
    await m.token.accessToken();
    m.avancar(241_000);
    expect(await m.token.accessToken()).toBe(jwt('a2', Math.floor(INICIO / 1000) + 600));
    expect(m.chamadas.map((c) => c.url.replace(OAUTH, ''))).toEqual([...LOGIN, '/token', ...LOGIN]);
  });

  it('classifica a recusa do login como sessão, sem pôr usuário, senha ou chave na mensagem', async () => {
    const m = criar([
      autorizar(),
      () => resposta({ message: 'NotAuthorizedException', details: 'robo@exemplo.com' }, 400),
    ]);
    const erro = await erroDe(m.token.accessToken());
    expect(erro.tipo).toBe('sessao');
    expect(erro.status).toBe(400);
    expect(erro.message).toBe(
      'MobileMed: o login foi recusado em POST /login/auth (HTTP 400, código NotAuthorizedException).',
    );
    for (const segredo of ['robo@exemplo.com', 'senha-secreta-1', SEGREDO]) {
      expect(erro.message).not.toContain(segredo);
    }
  });

  it('classifica 5xx e falha de rede como indisponível', async () => {
    const m = criar([
      () => resposta({}, 503),
      () => {
        throw new TypeError('fetch failed');
      },
    ]);
    expect((await erroDe(m.token.accessToken())).tipo).toBe('indisponivel');
    expect((await erroDe(m.token.accessToken())).tipo).toBe('indisponivel');
  });

  it('recusa desafio que o One não responde (troca de senha) e token sem validade', async () => {
    const m = criar([
      autorizar(),
      () => resposta({ challenge: 'NEW_PASSWORD', challenge_session: 's' }),
      ...login('x').slice(0, 4),
      () => resposta({ access_token: 'sem-jwt' }),
    ]);
    const desafioDeSenha = await erroDe(m.token.accessToken());
    expect(desafioDeSenha.tipo).toBe('recusada');
    expect(desafioDeSenha.message).toContain('NEW_PASSWORD');
    expect((await erroDe(m.token.accessToken())).tipo).toBe('resposta_inesperada');
  });

  it('para depois de 3 falhas seguidas e não chama mais a MobileMed', async () => {
    const m = criar([() => resposta({}, 400), () => resposta({}, 400), () => resposta({}, 400)]);
    for (let i = 0; i < 3; i++) await erroDe(m.token.accessToken());
    const parado = await erroDe(m.token.accessToken());
    expect(parado.tipo).toBe('sessao');
    expect(parado.message).toContain('3 falhas seguidas');
    expect(m.chamadas).toHaveLength(3);
  });

  it('uma renovação que dá certo zera a contagem de falhas', async () => {
    const m = criar([
      () => resposta({}, 503),
      () => resposta({}, 503),
      ...login('a1', 'r1', 60),
      () => resposta({}, 503),
      () => resposta({}, 503),
      () => resposta({}, 503),
      ...login('a2'),
    ]);
    await erroDe(m.token.accessToken());
    await erroDe(m.token.accessToken());
    await m.token.accessToken(); // 3ª tentativa dá certo, mas o token já nasce perto de vencer
    await erroDe(m.token.accessToken()); // refresh e login falham: 1ª falha
    await erroDe(m.token.accessToken()); // 2ª
    expect(await m.token.accessToken()).toContain('h.');
  });
});
