import { describe, expect, it } from 'vitest';

import { ExpurgarLinhasBrutas } from './expurgar-linhas-brutas';

describe('ExpurgarLinhasBrutas', () => {
  it('apaga as linhas cruas mais antigas que a retenção dos parâmetros', async () => {
    const pedidos: Date[] = [];
    const expurgar = new ExpurgarLinhasBrutas(
      {
        obter: async () => ({
          travaRemocaoMinimo: 500,
          travaRemocaoFator: 2,
          retencaoLinhasBrutasDias: 90,
        }),
      },
      {
        expurgarAntesDe: async (instante) => {
          pedidos.push(instante);
          return 7;
        },
      },
      () => new Date('2026-11-16T07:00:00Z'),
    );

    expect(await expurgar.executar()).toBe(7);
    expect(pedidos).toEqual([new Date('2026-08-18T07:00:00Z')]);
  });
});
