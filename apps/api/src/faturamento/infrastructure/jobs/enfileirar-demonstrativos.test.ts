import { describe, expect, it } from 'vitest';

import { pedidoDoPayload } from './enfileirar-demonstrativos';

describe('payload do job dos demonstrativos', () => {
  it('aceita os três pedidos e recusa o resto', () => {
    expect(pedidoDoPayload({ tipo: 'previas' })).toEqual({ tipo: 'previas' });
    expect(pedidoDoPayload({ tipo: 'fechamento', competencia: '2026-10' })).toEqual({
      tipo: 'fechamento',
      competencia: '2026-10',
    });
    expect(pedidoDoPayload({ tipo: 'recalculo', recalculoId: 'r1' })).toEqual({
      tipo: 'recalculo',
      recalculoId: 'r1',
    });
    for (const ruim of [null, {}, { tipo: 'fechamento' }, { tipo: 'recalculo', recalculoId: 1 }]) {
      expect(() => pedidoDoPayload(ruim)).toThrow(/payload inválido/);
    }
  });
});
