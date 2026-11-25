import { describe, expect, it } from 'vitest';

import { descreverRepeticao, descreverVigencia } from './vigencia-alocacao';

const fixa = {
  vigencia: 'fixa' as const,
  gratificado: false,
  coberturaDe: null,
  dataInicio: '2026-09-09',
  dataFim: null,
  diasSemana: [1, 3, 5],
  semanasDoMes: [],
};

describe('descreverVigencia', () => {
  it('escala fixa sem fim diz que não tem data de fim', () => {
    expect(descreverVigencia(fixa)).toBe('Escala fixa desde 09/09/2026, sem data de fim');
  });

  it('escala fixa com fim (marcada ou encerrada) continua escala fixa, com o "até"', () => {
    expect(descreverVigencia({ ...fixa, dataFim: '2026-12-31' })).toBe(
      'Escala fixa de 09/09/2026 até 31/12/2026',
    );
  });

  it('período único, gratificado e cobertura', () => {
    const periodo = { ...fixa, vigencia: 'periodo' as const, dataFim: '2026-09-30' };
    expect(descreverVigencia(periodo)).toBe('Período único de 09/09/2026 até 30/09/2026');
    expect(descreverVigencia({ ...periodo, gratificado: true })).toBe(
      'Gratificado de 09/09/2026 até 30/09/2026',
    );
    expect(descreverVigencia({ ...periodo, coberturaDe: { medicoNome: 'Carla Dias' } })).toBe(
      'Cobrindo Carla Dias de 09/09/2026 até 30/09/2026',
    );
  });
});

describe('descreverRepeticao', () => {
  it('dias na ordem da escala (segunda primeiro) e toda semana', () => {
    expect(descreverRepeticao({ diasSemana: [0, 1, 3], semanasDoMes: [] })).toBe(
      'seg, qua e dom, toda semana',
    );
  });

  it('um dia só e todos os dias', () => {
    expect(descreverRepeticao({ diasSemana: [4], semanasDoMes: [] })).toBe('qui, toda semana');
    expect(descreverRepeticao({ diasSemana: [0, 1, 2, 3, 4, 5, 6], semanasDoMes: [] })).toBe(
      'todos os dias, toda semana',
    );
  });

  it('semanas do mês, com a última no fim', () => {
    expect(descreverRepeticao({ diasSemana: [1], semanasDoMes: [1, 3] })).toBe(
      'seg, na 1ª e 3ª semana do mês',
    );
    expect(descreverRepeticao({ diasSemana: [6], semanasDoMes: [2, -1] })).toBe(
      'sáb, na 2ª e última semana do mês',
    );
  });
});
