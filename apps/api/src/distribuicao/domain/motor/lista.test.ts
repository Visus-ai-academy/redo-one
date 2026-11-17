import { describe, expect, it } from 'vitest';

import { guardaParaPosteriores, listaDepoisDosFixos } from './lista';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const MI = 'esp-mi';
const CT = 'mod-ct';
const fila = (n: number, restanteMin: number | null, especialidadeId = MI) =>
  Array.from({ length: n }, () => ({ especialidadeId, modalidadeId: CT, restanteMin }));

describe('guardaParaPosteriores (Lista que segue o SLA)', () => {
  const base = {
    agora: br('2026-11-06T07:00'),
    cheiaEm: '10:50',
    posterioresNaRodada: false,
    posteriores: [{ frente: MI, fim: br('2026-11-06T19:00'), vaga: 5 }],
    listas: [
      { alocacaoId: 'L1', frente: MI, produtividade: 30 },
      { alocacaoId: 'L2', frente: MI, produtividade: 10 },
    ],
  };

  it('corta o que vence até o fim do turno posterior e reserva a sobra pela produtividade', () => {
    // 12 vencem até 19:00 (720 min), a Tarde tem vaga para 5: sobram 7, rateados 30:10.
    const r = guardaParaPosteriores({ ...base, fila: [...fila(12, 600), ...fila(3, 900)] });
    expect(r.corte.get(MI)).toBe(720);
    expect(r.reserva.get('L1')).toBe(Math.ceil((7 * 30) / 40));
    expect(r.reserva.get('L2')).toBe(Math.ceil((7 * 10) / 40));
  });

  it('a partir da cheia, ou com o turno posterior na rodada, não guarda nada', () => {
    expect(
      guardaParaPosteriores({ ...base, agora: br('2026-11-06T10:50'), fila: fila(12, 600) }).corte
        .size,
    ).toBe(0);
    expect(
      guardaParaPosteriores({ ...base, posterioresNaRodada: true, fila: fila(12, 600) }).corte.size,
    ).toBe(0);
  });

  it('frente sem turno posterior hoje não guarda nada', () => {
    const r = guardaParaPosteriores({ ...base, posteriores: [], fila: fila(12, 600) });
    expect(r.corte.size).toBe(0);
    expect(r.reserva.size).toBe(0);
  });
});

describe('listaDepoisDosFixos', () => {
  const base = {
    agora: br('2026-11-16T05:50'),
    posterioresNaRodada: false,
    frentes: new Set([MI]),
    posteriores: [{ frente: MI, inicio: br('2026-11-16T13:00'), vaga: 10 }],
    listas: [
      { alocacaoId: 'L1', frente: MI, produtividade: 30 },
      { alocacaoId: 'L2', frente: MI, produtividade: 10 },
    ],
  };

  it('a Lista fica com a sua parte do que o turno posterior não dá conta', () => {
    const teto = listaDepoisDosFixos({ ...base, fila: fila(18, 600) });
    // Sobra 8, rateada 30:10 (para baixo).
    expect(teto.get('L1')).toBe(6);
    expect(teto.get('L2')).toBe(2);
  });

  it('volume alto: a sobra cobre a Lista; sem sobra, teto zero', () => {
    expect(listaDepoisDosFixos({ ...base, fila: fila(5, 600) }).get('L1')).toBe(0);
  });

  it('não vale fora das frentes marcadas, depois do início do posterior ou com ele na rodada', () => {
    expect(listaDepoisDosFixos({ ...base, frentes: new Set(), fila: fila(18, 600) }).size).toBe(0);
    expect(
      listaDepoisDosFixos({ ...base, agora: br('2026-11-16T13:00'), fila: fila(18, 600) }).size,
    ).toBe(0);
    expect(
      listaDepoisDosFixos({ ...base, posterioresNaRodada: true, fila: fila(18, 600) }).size,
    ).toBe(0);
  });
});
