import { describe, expect, it } from 'vitest';

import { ClienteMobileMed } from '../../comum/mobilemed/cliente-mobilemed';
import { lerLaudosMobileMed } from './laudos-mobilemed';

const BASE = 'http://mobilemed.teste/reports-api';
const DIA = 24 * 60 * 60 * 1000;

describe('lerLaudosMobileMed', () => {
  it('lê o relatório em janelas, só os ids (nada do paciente), com pausa entre as chamadas', async () => {
    const corpos: {
      filtro: { data_laudo: { data_inicial: string }; exibirNaoTratados: unknown };
    }[] = [];
    const respostas = [
      [
        {
          id: 1,
          usuario_id: 10,
          medico_primeiro_laudo_id: 11,
          nome_paciente: 'Fulano',
          codigo_paciente: '999',
        },
      ],
      [{ id: 2, usuario_id: null, medico_primeiro_laudo_id: null }],
      [{ id: 1, usuario_id: 10, medico_primeiro_laudo_id: 11 }],
      [],
    ];
    const fetch = (async (_url: string, init: RequestInit) => {
      corpos.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ lista: respostas.shift() }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const cliente = new ClienteMobileMed({
      baseUrl: BASE,
      token: { accessToken: async () => 'tok', descartar: () => {} },
      timeoutMs: 1_000,
      concorrencia: 1,
      limiteAnomalias: 2,
      fetch,
    });
    const pausas: number[] = [];
    const de = new Date('2026-10-01T03:00:00Z');

    const laudos = await lerLaudosMobileMed(cliente, de, new Date(de.getTime() + 8 * DIA), {
      janelaDias: 7,
      esperar: async (ms) => {
        pausas.push(ms);
      },
    });

    expect(laudos).toEqual(
      new Map([
        [1, { usuarioId: 10, primeiroId: 11 }],
        [2, { usuarioId: null, primeiroId: null }],
      ]),
    );
    expect(JSON.stringify([...laudos])).not.toContain('Fulano');
    expect(
      corpos.map((c) => [c.filtro.data_laudo.data_inicial, c.filtro.exibirNaoTratados]),
    ).toEqual([
      ['2026-10-01T03:00:00.000Z', false],
      ['2026-10-08T03:00:00.000Z', false],
      ['2026-10-01T03:00:00.000Z', '1'],
      ['2026-10-08T03:00:00.000Z', '1'],
    ]);
    expect(pausas).toEqual([2_000, 2_000, 2_000, 2_000]);
  });
});
