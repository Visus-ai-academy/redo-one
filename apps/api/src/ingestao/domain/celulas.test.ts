import { describe, expect, it } from 'vitest';

import { booleano, dataHoraBrasilia, numero, texto } from './celulas';

// O Excel guarda data e hora sem fuso: a planilha da MobileMed traz o horário de Brasília, e o
// leitor entrega os números do relógio em UTC (como o dashboards-one lia).
const relogio = (iso: string) => new Date(`${iso}Z`);

describe('dataHoraBrasilia', () => {
  it('junta data e hora de Brasília num instante UTC (+3h)', () => {
    expect(
      dataHoraBrasilia(relogio('2026-10-05T00:00:00'), relogio('1899-12-30T22:15:30')),
    ).toEqual(new Date('2026-10-06T01:15:30Z'));
  });

  it('aceita data em texto dd/mm/aaaa e hora HH:mm', () => {
    expect(dataHoraBrasilia('05/10/2026', '08:07')).toEqual(new Date('2026-10-05T11:07:00Z'));
  });

  it('aceita ano com 2 dígitos e hora com segundos', () => {
    expect(dataHoraBrasilia('05/10/26', '08:07:09')).toEqual(new Date('2026-10-05T11:07:09Z'));
  });

  it('aceita número serial do Excel na data e fração do dia na hora', () => {
    // 46300 = 05/10/2026; 0,5 = 12:00
    expect(dataHoraBrasilia(46300, 0.5)).toEqual(new Date('2026-10-05T15:00:00Z'));
  });

  it('sem hora, vale meia-noite', () => {
    expect(dataHoraBrasilia('05/10/2026', null)).toEqual(new Date('2026-10-05T03:00:00Z'));
  });

  it('sem data, não há instante', () => {
    expect(dataHoraBrasilia(null, '08:00')).toBeNull();
    expect(dataHoraBrasilia('', '08:00')).toBeNull();
  });

  it('recusa data que não existe, em vez de transbordar para o mês seguinte', () => {
    expect(() => dataHoraBrasilia('31/02/2026', null)).toThrow('data inválida');
  });

  it('recusa hora fora do formato', () => {
    expect(() => dataHoraBrasilia('05/10/2026', '25:00')).toThrow('hora inválida');
  });
});

describe('texto', () => {
  it('apara as pontas; vazio vira nulo; número vira texto', () => {
    expect(texto('  CLINICA X ')).toBe('CLINICA X');
    expect(texto('   ')).toBeNull();
    expect(texto(null)).toBeNull();
    expect(texto(12345)).toBe('12345');
  });
});

describe('numero', () => {
  it('lê número, texto com ponto ou com vírgula decimal e milhar', () => {
    expect(numero(2)).toBe(2);
    expect(numero('1.5')).toBe(1.5);
    expect(numero('1,5')).toBe(1.5);
    expect(numero('1.234,5')).toBe(1234.5);
  });

  it('vazio vira nulo; texto que não é número é recusado', () => {
    expect(numero('')).toBeNull();
    expect(numero(null)).toBeNull();
    expect(() => numero('abc')).toThrow('número inválido');
  });
});

describe('booleano', () => {
  it('verdadeiro para sim, s, 1, true, yes (sem diferenciar maiúsculas)', () => {
    for (const v of ['Sim', 'S', '1', 'TRUE', 'yes', true, 1]) expect(booleano(v)).toBe(true);
    for (const v of ['Não', 'N', '0', '', null, false, 0]) expect(booleano(v)).toBe(false);
  });
});
