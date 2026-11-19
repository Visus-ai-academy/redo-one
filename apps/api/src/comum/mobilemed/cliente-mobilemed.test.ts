import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ClienteMobileMed, ErroMobileMed } from './cliente-mobilemed';
import type { TokenMobileMed } from './token-mobilemed';

const BASE = 'http://mobilemed.teste/portal-api';
const esquema = z.object({ ok: z.literal(true) });

interface Chamada {
  url: string;
  init: RequestInit;
}

/** fetch simulado: responde em sequência e guarda o que recebeu. Nada sai do processo. */
const fetchSimulado = (respostas: (() => Response | Promise<Response>)[]) => {
  const chamadas: Chamada[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const proxima = respostas.shift();
    if (!proxima) throw new Error('chamada a mais');
    return proxima();
  }) as unknown as typeof fetch;
  return { fn, chamadas };
};
const json =
  (corpo: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    });

const criar = (
  respostas: (() => Response | Promise<Response>)[],
  token: TokenMobileMed = { accessToken: async () => 'tok-123' },
) => {
  const f = fetchSimulado(respostas);
  const cliente = new ClienteMobileMed({
    baseUrl: BASE,
    token,
    timeoutMs: 1_000,
    concorrencia: 1,
    limiteAnomalias: 2,
    fetch: f.fn,
  });
  return { cliente, chamadas: f.chamadas };
};

const erroDe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ErroMobileMed;
  }
  throw new Error('não falhou');
};

describe('ClienteMobileMed', () => {
  it('manda Bearer e JSON para a base configurada e valida a resposta', async () => {
    const { cliente, chamadas } = criar([json({ ok: true, extra: 1 })]);
    expect(await cliente.chamar('POST', '/exame/lista', esquema, { a: 1 })).toEqual({ ok: true });
    expect(chamadas[0]?.url).toBe(`${BASE}/exame/lista`);
    expect(chamadas[0]?.init.method).toBe('POST');
    expect(chamadas[0]?.init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer tok-123',
    });
    expect(chamadas[0]?.init.body).toBe('{"a":1}');
  });

  it('se o login falha, devolve o erro dele sem chamar a rota', async () => {
    const { cliente, chamadas } = criar([], {
      accessToken: async () => {
        throw new ErroMobileMed('sessao', 'MobileMed: o login foi recusado.');
      },
    });
    const erro = await erroDe(cliente.chamar('GET', '/exame/1', esquema));
    expect(erro.tipo).toBe('sessao');
    expect(erro.message).toBe('MobileMed: o login foi recusado.');
    expect(chamadas).toHaveLength(0);
  });

  it('classifica sessão, indisponível e recusa, sem copiar o texto do erro', async () => {
    const { cliente } = criar([
      json({ error_reason: 'invalid_token' }, 400),
      json({}, 503),
      json({ error_code: 'E42', error_msg: 'paciente Fulano' }, 422),
    ]);
    const sessao = await erroDe(cliente.chamar('GET', '/exame/1', esquema));
    expect(sessao.tipo).toBe('sessao');
    const fora = await erroDe(cliente.chamar('GET', '/exame/1', esquema));
    expect([fora.tipo, fora.status]).toEqual(['indisponivel', 503]);
    const recusa = await erroDe(cliente.chamar('PUT', '/exame', esquema, {}));
    expect(recusa.tipo).toBe('recusada');
    expect(recusa.message).toContain('E42');
    expect(recusa.message).not.toContain('Fulano');
  });

  it('resposta fora do formato diz só o campo, nunca o valor', async () => {
    const { cliente } = criar([json({ ok: 'Maria da Silva' }), () => new Response('<html>')]);
    const erro = await erroDe(cliente.chamar('GET', '/exame/7', esquema));
    expect(erro.tipo).toBe('resposta_inesperada');
    expect(erro.message).toContain('GET /exame/{id}');
    expect(erro.message).toContain('ok');
    expect(erro.message).not.toContain('Maria');
    expect((await erroDe(cliente.chamar('GET', '/exame/7', esquema))).message).toContain(
      'não é JSON',
    );
  });

  it('tempo esgotado vira indisponível', async () => {
    const { cliente } = criar([
      () => Promise.reject(Object.assign(new Error('x'), { name: 'TimeoutError' })),
    ]);
    const erro = await erroDe(cliente.chamar('GET', '/exame/1', esquema));
    expect(erro.tipo).toBe('indisponivel');
    expect(erro.message).toContain('não respondeu em 1s');
  });

  it('o freio arma com 2 anomalias seguidas e desarma na primeira que dá certo', async () => {
    const { cliente } = criar([json({}, 500), json({ ok: 1 }), json({ ok: true })]);
    await erroDe(cliente.chamar('GET', '/exame/1', esquema));
    expect(cliente.freado).toBe(false);
    await erroDe(cliente.chamar('GET', '/exame/1', esquema));
    expect(cliente.freado).toBe(true);
    await cliente.chamar('GET', '/exame/1', esquema);
    expect(cliente.freado).toBe(false);
  });

  it('a recusa (4xx) não conta para o freio', async () => {
    const { cliente } = criar([json({}, 500), json({}, 404), json({}, 500)]);
    for (let i = 0; i < 3; i++) await erroDe(cliente.chamar('GET', '/exame/1', esquema));
    expect(cliente.freado).toBe(false);
  });

  it('faz uma chamada por vez com concorrência 1', async () => {
    let abertas = 0;
    let maximo = 0;
    const lenta = () => async () => {
      abertas++;
      maximo = Math.max(maximo, abertas);
      await new Promise((r) => setTimeout(r, 5));
      abertas--;
      return new Response('{"ok":true}');
    };
    const { cliente } = criar([lenta(), lenta(), lenta()]);
    await Promise.all([1, 2, 3].map(() => cliente.chamar('GET', '/exame/1', esquema)));
    expect(maximo).toBe(1);
  });
});
