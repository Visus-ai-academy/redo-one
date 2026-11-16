import { describe, expect, it } from 'vitest';

import { competenciaDoLaudo, diaBrasilia } from './competencia';

// Instantes em UTC; o comentário diz o horário de Brasília (UTC−3).
const utc = (iso: string) => new Date(iso);

describe('competenciaDoLaudo', () => {
  it('é o mês da realização quando o laudo sai no mesmo mês', () => {
    expect(competenciaDoLaudo(utc('2026-10-10T13:00:00Z'), utc('2026-10-11T13:00:00Z'))).toBe(
      '2026-10',
    );
  });

  it('laudo assinado até o dia 07 do mês seguinte fica no mês da realização', () => {
    // realizado 30/09, laudo 07/10 23:59 BRT
    expect(competenciaDoLaudo(utc('2026-09-30T15:00:00Z'), utc('2026-10-08T02:59:00Z'))).toBe(
      '2026-09',
    );
  });

  it('laudo assinado a partir do dia 08 do mês seguinte vai para o mês do laudo − 7 dias', () => {
    // realizado 20/09, laudo 08/10 00:00 BRT
    expect(competenciaDoLaudo(utc('2026-09-20T15:00:00Z'), utc('2026-10-08T03:00:00Z'))).toBe(
      '2026-10',
    );
  });

  it('lê o mês da realização em horário de Brasília', () => {
    // realizado 31/10 22:00 BRT (01/11 01:00 UTC), laudo 01/11 10:00 BRT
    expect(competenciaDoLaudo(utc('2026-11-01T01:00:00Z'), utc('2026-11-01T13:00:00Z'))).toBe(
      '2026-10',
    );
  });

  it('realização depois do laudo fica no mês da realização (o maior vence)', () => {
    expect(competenciaDoLaudo(utc('2026-11-02T13:00:00Z'), utc('2026-10-30T13:00:00Z'))).toBe(
      '2026-11',
    );
  });

  it('vira o ano', () => {
    // realizado 28/12, laudo 10/01 BRT
    expect(competenciaDoLaudo(utc('2026-12-28T13:00:00Z'), utc('2027-01-10T13:00:00Z'))).toBe(
      '2027-01',
    );
  });
});

describe('diaBrasilia', () => {
  it('devolve o dia em horário de Brasília', () => {
    expect(diaBrasilia(utc('2026-11-01T02:59:00Z'))).toBe('2026-10-31');
    expect(diaBrasilia(utc('2026-11-01T03:00:00Z'))).toBe('2026-11-01');
  });
});
