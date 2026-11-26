import { describe, expect, it } from 'vitest';

import { AdicionalInvalidoError, montarAdicional, type PedidoAdicional } from './adicional';

const TARIFAS = { peerReviewCentavos: 2100, plantaoCentavos: 35000 };
const pedido = (p: Partial<PedidoAdicional> = {}): PedidoAdicional => ({
  tipo: 'avulso',
  valorCentavos: 15000,
  descricao: 'Acerto de outubro',
  data: '2026-10-05',
  competencia: '2026-10',
  ...p,
});

describe('montarAdicional', () => {
  it('avulso: o valor informado (negativo é desconto)', () => {
    expect(montarAdicional(pedido({ valorCentavos: -5000 }), TARIFAS)).toMatchObject({
      valorCentavos: -5000,
      descricao: 'Acerto de outubro',
      quantidade: null,
      valorUnitarioCentavos: null,
    });
  });

  it('recusa valor zero, descrição curta, data e competência inválidas', () => {
    expect(() => montarAdicional(pedido({ valorCentavos: 0 }), TARIFAS)).toThrow(
      AdicionalInvalidoError,
    );
    expect(() => montarAdicional(pedido({ descricao: ' ab ' }), TARIFAS)).toThrow(
      AdicionalInvalidoError,
    );
    expect(() => montarAdicional(pedido({ data: '05/10/2026' }), TARIFAS)).toThrow(
      AdicionalInvalidoError,
    );
    expect(() => montarAdicional(pedido({ competencia: '2026-13' }), TARIFAS)).toThrow(
      AdicionalInvalidoError,
    );
  });

  it('plantão: quantidade × tarifa padrão, com a memória na descrição', () => {
    const a = montarAdicional(
      pedido({ tipo: 'plantao', valorCentavos: undefined, quantidade: 3, descricao: undefined }),
      TARIFAS,
    );
    expect(a).toMatchObject({
      valorCentavos: 105000,
      quantidade: 3,
      valorUnitarioCentavos: 35000,
      descricao: 'Plantão: 3 plantões × R$ 350,00',
    });
  });

  it('peer review: exige os meses avaliados e usa a tarifa informada', () => {
    expect(() => montarAdicional(pedido({ tipo: 'peer_review', quantidade: 2 }), TARIFAS)).toThrow(
      AdicionalInvalidoError,
    );
    const a = montarAdicional(
      pedido({
        tipo: 'peer_review',
        quantidade: 2,
        valorUnitarioCentavos: 3000,
        referenciaDesde: '2026-08',
        referenciaAte: '2026-09',
        descricao: undefined,
      }),
      TARIFAS,
    );
    expect(a).toMatchObject({
      valorCentavos: 6000,
      referenciaDesde: '2026-08',
      referenciaAte: '2026-09',
      descricao: 'Peer Review: 2 avaliações × R$ 30,00 (ref. 2026-08 a 2026-09)',
    });
  });

  it('quantidade tem de ser inteira e positiva', () => {
    expect(() => montarAdicional(pedido({ tipo: 'plantao', quantidade: 0 }), TARIFAS)).toThrow(
      AdicionalInvalidoError,
    );
  });
});
