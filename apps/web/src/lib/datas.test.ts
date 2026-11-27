import { describe, expect, it } from 'vitest';

import { dataDeBrasilia, dataHoraCurta, horaDeBrasilia, mesDeBrasilia } from './datas';

describe('dataDeBrasilia', () => {
  it('formata a data no fuso de Brasília', () => {
    // 02:00 UTC de 3/10 ainda é 2/10 em Brasília.
    expect(dataDeBrasilia('2026-10-03T02:00:00.000Z')).toBe('02/10/2026');
  });
});

describe('horaDeBrasilia', () => {
  it('formata a hora no fuso de Brasília', () => {
    expect(horaDeBrasilia('2026-10-03T02:05:00.000Z')).toBe('23:05');
  });
});

describe('dataHoraCurta', () => {
  const agora = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

  it('hoje vira "Hoje, HH:MM"', () => {
    expect(dataHoraCurta('2026-11-14T12:12:00.000Z', agora)).toBe('Hoje, 09:12');
  });

  it('ontem vira "Ontem, HH:MM"', () => {
    expect(dataHoraCurta('2026-11-14T00:40:00.000Z', agora)).toBe('Ontem, 21:40');
  });

  it('antes disso, dia/mês e hora', () => {
    expect(dataHoraCurta('2026-11-12T22:31:00.000Z', agora)).toBe('12/11 19:31');
  });

  it('em outro ano, mostra o ano', () => {
    expect(dataHoraCurta('2025-12-30T13:00:00.000Z', agora)).toBe('30/12/2025 10:00');
  });
});

describe('mesDeBrasilia', () => {
  it('dá o mês (AAAA-MM) do instante no fuso de Brasília', () => {
    expect(mesDeBrasilia(new Date('2026-11-24T15:00:00.000Z'))).toBe('2026-11');
    // 02:00 UTC de 1/12 ainda é 30/11 em Brasília.
    expect(mesDeBrasilia(new Date('2026-12-01T02:00:00.000Z'))).toBe('2026-11');
    expect(mesDeBrasilia(new Date('2026-12-01T03:00:00.000Z'))).toBe('2026-12');
  });
});
