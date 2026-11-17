import { describe, expect, it } from 'vitest';

import {
  diaDaSemana,
  diasDaSemana,
  diasDaSemanaVisiveis,
  diasVisiveis,
  ehFimDeSemana,
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

  it('mês: a grade inteira do calendário, com os dias dos meses vizinhos', () => {
    expect(janelaDoModo('mes', '2026-11-10')).toEqual({ de: '2026-10-26', ate: '2026-12-06' });
  });

  it('por médico: a grade do mês, como no mês', () => {
    expect(janelaDoModo('medico', '2026-12-31')).toEqual({ de: '2026-11-30', ate: '2027-01-03' });
  });

  it('ausências da semana: como a semana', () => {
    expect(janelaDoModo('ausencias', '2026-11-18')).toEqual({
      de: '2026-11-16',
      ate: '2026-11-22',
    });
  });
});

describe('navegar', () => {
  it('semana (e ausências da semana) anda 7 dias', () => {
    expect(navegar('ausencias', '2026-11-18', 1)).toBe('2026-11-25');
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
    expect(rotuloPeriodo('ausencias', '2026-11-18')).toBe('16/11 a 22/11/2026');
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

describe('fim de semana escondido', () => {
  // Semana de 16/11/2026 (segunda) a 22/11/2026 (domingo).
  const semana = diasDaSemana('2026-11-18');

  it('sábado e domingo são fim de semana', () => {
    expect(ehFimDeSemana('2026-11-21')).toBe(true);
    expect(ehFimDeSemana('2026-11-22')).toBe(true);
    expect(ehFimDeSemana('2026-11-20')).toBe(false);
  });

  it('a semana mostra só seg a sex quando o fim de semana está vazio', () => {
    expect(diasVisiveis(semana, () => false)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
  });

  it('o sábado ou o domingo aparecem quando têm algo', () => {
    expect(diasVisiveis(semana, (dia) => dia === '2026-11-22').slice(-2)).toEqual([
      '2026-11-20',
      '2026-11-22',
    ]);
  });

  it('no mês, a coluna do sábado ou do domingo aparece se algum dia dela tem algo', () => {
    const datas = semanasDoMes('2026-11-18').flat();
    expect(diasDaSemanaVisiveis(datas, () => false)).toEqual([1, 2, 3, 4, 5]);
    expect(diasDaSemanaVisiveis(datas, (dia) => dia === '2026-11-07')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(diasDaSemanaVisiveis(datas, (dia) => dia === '2026-11-29')).toEqual([1, 2, 3, 4, 5, 0]);
  });
});
