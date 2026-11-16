import { describe, expect, it } from 'vitest';

import {
  diaDaSemana,
  diasDaSemana,
  hojeEmBrasilia,
  inicioDaSemana,
  janelaDoModo,
  navegar,
  rotuloDia,
  rotuloPeriodo,
  semanasDoMes,
  somarDias,
} from './calendario';

describe('hojeEmBrasilia', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    // 01:00 UTC de 17/11 ainda é 16/11 em Brasília.
    expect(hojeEmBrasilia(new Date('2026-11-17T01:00:00Z'))).toBe('2026-11-16');
  });
});

describe('aritmética de calendário', () => {
  it('soma dias atravessando o mês', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('dia da semana: 0 = domingo', () => {
    expect(diaDaSemana('2026-11-15')).toBe(0);
    expect(diaDaSemana('2026-11-16')).toBe(1);
  });

  it('a semana começa na segunda', () => {
    expect(inicioDaSemana('2026-11-15')).toBe('2026-11-09');
    expect(inicioDaSemana('2026-11-18')).toBe('2026-11-16');
    expect(diasDaSemana('2026-11-18')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });
});

describe('janelaDoModo', () => {
  it('semana: de segunda a domingo', () => {
    expect(janelaDoModo('semana', '2026-11-18')).toEqual({ de: '2026-11-16', ate: '2026-11-22' });
  });

  it('mês e por médico: o mês inteiro', () => {
    expect(janelaDoModo('mes', '2026-02-10')).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(janelaDoModo('medico', '2026-12-31')).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
  });
});

describe('navegar', () => {
  it('semana anda 7 dias', () => {
    expect(navegar('semana', '2026-11-18', 1)).toBe('2026-11-25');
    expect(navegar('semana', '2026-11-18', -1)).toBe('2026-11-11');
  });

  it('mês anda para o dia 1 do mês vizinho', () => {
    expect(navegar('mes', '2026-01-31', 1)).toBe('2026-02-01');
    expect(navegar('medico', '2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('rótulos', () => {
  it('período da semana e do mês', () => {
    expect(rotuloPeriodo('semana', '2026-11-18')).toBe('16/11 a 22/11/2026');
    expect(rotuloPeriodo('mes', '2026-11-18')).toBe('Novembro de 2026');
  });

  it('dia com a semana abreviada', () => {
    expect(rotuloDia('2026-11-16')).toEqual({ semana: 'Seg', dia: '16/11' });
  });
});

describe('semanasDoMes', () => {
  it('cobre o mês em semanas de segunda a domingo', () => {
    const semanas = semanasDoMes('2026-11-10');
    expect(semanas[0]?.[0]).toBe('2026-10-26');
    expect(semanas.at(-1)?.at(-1)).toBe('2026-12-06');
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });
});
