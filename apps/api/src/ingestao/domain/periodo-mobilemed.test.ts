import { describe, expect, it } from 'vitest';

import { instantesDoPeriodo, periodoMobileMed } from './periodo-mobilemed';

describe('periodoMobileMed', () => {
  it('vai do dia 1º do mês anterior até hoje, em Brasília', () => {
    expect(periodoMobileMed(new Date('2026-11-19T15:00:00Z'), 1)).toEqual({
      inicio: '2026-10-01',
      fim: '2026-11-19',
    });
  });

  it('usa o dia de Brasília: 01:00 UTC do dia 1º ainda é o mês anterior lá', () => {
    expect(periodoMobileMed(new Date('2026-12-01T01:00:00Z'), 1)).toEqual({
      inicio: '2026-10-01',
      fim: '2026-11-30',
    });
  });

  it('com 0 meses anteriores, só o mês atual; atravessa o ano', () => {
    expect(periodoMobileMed(new Date('2027-01-10T12:00:00Z'), 0)).toEqual({
      inicio: '2027-01-01',
      fim: '2027-01-10',
    });
    expect(periodoMobileMed(new Date('2027-01-10T12:00:00Z'), 2)).toEqual({
      inicio: '2026-11-01',
      fim: '2027-01-10',
    });
  });
});

describe('instantesDoPeriodo', () => {
  it('do início do primeiro dia ao fim do último, em Brasília (fim exclusivo)', () => {
    expect(instantesDoPeriodo({ inicio: '2026-10-01', fim: '2026-11-19' })).toEqual({
      de: new Date('2026-10-01T03:00:00.000Z'),
      ate: new Date('2026-11-20T03:00:00.000Z'),
    });
  });
});
