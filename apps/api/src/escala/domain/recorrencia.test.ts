import { describe, expect, it } from 'vitest';

import { EscalaInvalidaError } from './errors';
import {
  adicionarDias,
  caiNasSemanas,
  caiNoDia,
  diaDaSemana,
  diasNoIntervalo,
  existeDiaNoPeriodo,
  normalizarDiasSemana,
  normalizarSemanasDoMes,
  validarData,
} from './recorrencia';

describe('validarData', () => {
  it('aceita data de calendário YYYY-MM-DD', () => {
    expect(validarData('2026-02-28')).toBe('2026-02-28');
  });

  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '01/02/2026', ''])('recusa "%s"', (v) => {
    expect(() => validarData(v)).toThrow(EscalaInvalidaError);
  });
});

describe('aritmética de datas', () => {
  it('dia da semana pelo calendário (0 = domingo)', () => {
    expect(diaDaSemana('2026-11-01')).toBe(0);
    expect(diaDaSemana('2026-10-17')).toBe(6);
  });

  it('soma dias atravessando mês e ano', () => {
    expect(adicionarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(adicionarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('conta os dias do intervalo, com as duas pontas', () => {
    expect(diasNoIntervalo('2026-11-01', '2026-11-01')).toBe(1);
    expect(diasNoIntervalo('2026-11-01', '2026-11-30')).toBe(30);
  });
});

describe('normalizarDiasSemana', () => {
  it('tira repetidos e ordena', () => {
    expect(normalizarDiasSemana([6, 1, 1, 0])).toEqual([0, 1, 6]);
  });

  it.each([[[7]], [[-1]], [[1.5]]])('recusa dia fora de 0..6: %j', (dias) => {
    expect(() => normalizarDiasSemana(dias)).toThrow(EscalaInvalidaError);
  });
});

describe('normalizarSemanasDoMes', () => {
  it('tira repetidos e põe a última (-1) no fim', () => {
    expect(normalizarSemanasDoMes([-1, 3, 1, 3])).toEqual([1, 3, -1]);
  });

  it.each([[[0]], [[6]], [[-2]]])('recusa semana fora de 1..5 e -1: %j', (semanas) => {
    expect(() => normalizarSemanasDoMes(semanas)).toThrow(EscalaInvalidaError);
  });
});

describe('caiNasSemanas', () => {
  it('sem semanas marcadas vale toda semana', () => {
    expect(caiNasSemanas('2026-10-30', true, [], [5])).toBe(true);
  });

  it('a semana é a ordem do dia entre os mesmos dias da semana do mês', () => {
    // 17/10/2026 é o 3º sábado
    expect(caiNasSemanas('2026-10-17', false, [3], [6])).toBe(true);
    expect(caiNasSemanas('2026-10-10', false, [3], [6])).toBe(false);
  });

  it('a 5ª semana só existe nos dias 29 a 31', () => {
    expect(caiNasSemanas('2026-10-31', false, [5], [6])).toBe(true);
    expect(caiNasSemanas('2026-10-28', false, [5], [3])).toBe(false);
  });

  it('a última é o dia cuja próxima semana já é outro mês', () => {
    expect(caiNasSemanas('2026-10-31', false, [-1], [6])).toBe(true);
    expect(caiNasSemanas('2026-10-24', false, [-1], [6])).toBe(false);
    // fevereiro de 28 dias: o dia 22 é o último daquele dia da semana
    expect(caiNasSemanas('2026-02-22', false, [-1], [0])).toBe(true);
    expect(caiNasSemanas('2026-02-21', false, [-1], [6])).toBe(false);
  });

  it('com sábado na regra, o domingo conta pelo sábado da véspera', () => {
    // 01/11/2026 é domingo: fecha o fim de semana de 31/10 (5º e último sábado de outubro)
    expect(caiNasSemanas('2026-11-01', false, [1], [0, 6])).toBe(false);
    expect(caiNasSemanas('2026-11-01', false, [5], [0, 6])).toBe(true);
    expect(caiNasSemanas('2026-11-01', false, [-1], [0, 6])).toBe(true);
  });

  it('sem sábado na regra, o domingo conta por ele mesmo', () => {
    expect(caiNasSemanas('2026-11-01', false, [1], [0])).toBe(true);
  });
});

describe('caiNoDia', () => {
  const regra = {
    diasSemana: [1, 3],
    todasSemanas: true,
    semanasDoMes: [],
    dataInicio: '2026-11-02',
    dataFim: null,
  };

  it('cai nos dias da semana marcados dentro da vigência', () => {
    expect(caiNoDia(regra, '2026-11-02')).toBe(true);
    expect(caiNoDia(regra, '2026-11-04')).toBe(true);
    expect(caiNoDia(regra, '2026-11-03')).toBe(false);
  });

  it('não cai antes do início', () => {
    expect(caiNoDia(regra, '2026-10-26')).toBe(false);
  });

  it('sem fim vale para sempre; com fim, até o fim inclusive', () => {
    expect(caiNoDia(regra, '2030-01-02')).toBe(true);
    const comFim = { ...regra, dataFim: '2026-11-09' };
    expect(caiNoDia(comFim, '2026-11-09')).toBe(true);
    expect(caiNoDia(comFim, '2026-11-11')).toBe(false);
  });

  it('respeita as semanas do mês', () => {
    const terceiroFds = { ...regra, diasSemana: [0, 6], todasSemanas: false, semanasDoMes: [3] };
    expect(caiNoDia(terceiroFds, '2026-11-21')).toBe(true);
    expect(caiNoDia(terceiroFds, '2026-11-22')).toBe(true);
    expect(caiNoDia(terceiroFds, '2026-11-14')).toBe(false);
  });

  it('conta as semanas por outros dias quando pedido (cobertura usa os do titular)', () => {
    // cobertura só do domingo de um "5º fim de semana": o domingo 01/11 é o do sábado 31/10
    const soDomingo = {
      ...regra,
      diasSemana: [0],
      todasSemanas: false,
      semanasDoMes: [5],
      dataInicio: '2026-10-01',
    };
    expect(caiNoDia(soDomingo, '2026-11-01')).toBe(false);
    expect(caiNoDia(soDomingo, '2026-11-01', [0, 6])).toBe(true);
  });
});

describe('existeDiaNoPeriodo', () => {
  it('acha um dia da regra dentro da vigência fechada', () => {
    const regra = {
      diasSemana: [1],
      todasSemanas: true,
      semanasDoMes: [],
      dataInicio: '2026-11-02',
      dataFim: '2026-11-02',
    };
    expect(existeDiaNoPeriodo(regra)).toBe(true);
  });

  it('não acha quando nenhum dia marcado cai no período', () => {
    // 03 a 07/11/2026: terça a sábado, sem segunda
    const regra = {
      diasSemana: [1],
      todasSemanas: true,
      semanasDoMes: [],
      dataInicio: '2026-11-03',
      dataFim: '2026-11-07',
    };
    expect(existeDiaNoPeriodo(regra)).toBe(false);
  });

  it('considera as semanas do mês', () => {
    // 1ª segunda de novembro/2026 é 02/11; o período só pega a 2ª
    const regra = {
      diasSemana: [1],
      todasSemanas: false,
      semanasDoMes: [1],
      dataInicio: '2026-11-08',
      dataFim: '2026-11-14',
    };
    expect(existeDiaNoPeriodo(regra)).toBe(false);
  });

  it('sem fim sempre acha (a regra repete para sempre)', () => {
    const regra = {
      diasSemana: [1],
      todasSemanas: false,
      semanasDoMes: [5],
      dataInicio: '2026-11-03',
      dataFim: null,
    };
    expect(existeDiaNoPeriodo(regra)).toBe(true);
  });
});
