import { describe, expect, it } from 'vitest';

import {
  classificarAlocacao,
  type DadosAlocacao,
  validarAlocacao,
  validarProdutividade,
} from './alocacao';
import { EscalaInvalidaError } from './errors';

const manha = { nome: 'Manhã', tipo: 'fixo' as const, horarioInicio: '07:00', horarioFim: '13:00' };
const lista = {
  nome: 'Lista',
  tipo: 'lista' as const,
  horarioInicio: '07:00',
  horarioFim: '07:00',
};

const fixa: DadosAlocacao = {
  diasSemana: [3, 1],
  dataInicio: '2026-11-02',
};

describe('validarAlocacao', () => {
  it('normaliza a escala fixa e usa o horário do turno quando não informado', () => {
    expect(validarAlocacao(fixa, manha)).toEqual({
      diasSemana: [1, 3],
      semanasDoMes: [],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataInicio: '2026-11-02',
      dataFim: null,
      produtividade: null,
      gratificado: false,
    });
  });

  it('normaliza horário e semanas do mês', () => {
    const v = validarAlocacao(
      { ...fixa, horarioInicio: '9:00', horarioFim: '13:00', semanasDoMes: [-1, 1] },
      manha,
    );
    expect(v.horarioInicio).toBe('09:00');
    expect(v.semanasDoMes).toEqual([1, -1]);
  });

  it('exige pelo menos um dia da semana', () => {
    expect(() => validarAlocacao({ ...fixa, diasSemana: [] }, manha)).toThrow(
      'Selecione ao menos um dia da semana.',
    );
  });

  it('recusa fim antes do início', () => {
    expect(() => validarAlocacao({ ...fixa, dataFim: '2026-11-01' }, manha)).toThrow(
      EscalaInvalidaError,
    );
  });

  it('recusa horário fora do turno', () => {
    expect(() =>
      validarAlocacao({ ...fixa, horarioInicio: '12:00', horarioFim: '14:00' }, manha),
    ).toThrow(/não cabe no turno Manhã/);
  });

  it('aceita produtividade zero e nula, recusa negativa ou fracionária', () => {
    expect(validarAlocacao({ ...fixa, produtividade: 0 }, manha).produtividade).toBe(0);
    expect(validarAlocacao({ ...fixa, produtividade: null }, manha).produtividade).toBeNull();
    expect(() => validarAlocacao({ ...fixa, produtividade: -1 }, manha)).toThrow(
      EscalaInvalidaError,
    );
    expect(() => validarAlocacao({ ...fixa, produtividade: 1.5 }, manha)).toThrow(
      EscalaInvalidaError,
    );
  });

  it('período com dias marcados precisa ter pelo menos um dia no período', () => {
    // 03 a 07/11/2026 é terça a sábado; a escala é de segunda e quarta → quarta 04/11 cai
    expect(
      validarAlocacao({ ...fixa, dataInicio: '2026-11-03', dataFim: '2026-11-07' }, manha).dataFim,
    ).toBe('2026-11-07');
    expect(() =>
      validarAlocacao(
        { ...fixa, diasSemana: [1], dataInicio: '2026-11-03', dataFim: '2026-11-07' },
        manha,
      ),
    ).toThrow('Nenhum dia marcado cai no período.');
  });

  describe('gratificado', () => {
    const gratificada: DadosAlocacao = {
      diasSemana: [0, 6],
      semanasDoMes: [3],
      dataInicio: '2026-11-01',
      dataFim: '2026-11-30',
      produtividade: 200,
      gratificado: true,
    };

    it('só em turno lista', () => {
      expect(() => validarAlocacao(gratificada, manha)).toThrow(/turno do tipo lista/);
    });

    it('zera as semanas do mês (é período fechado)', () => {
      expect(validarAlocacao(gratificada, lista)).toMatchObject({
        gratificado: true,
        semanasDoMes: [],
        produtividade: 200,
      });
    });

    it('exige data de fim', () => {
      expect(() => validarAlocacao({ ...gratificada, dataFim: null }, lista)).toThrow(
        'Escala gratificada precisa de data de fim.',
      );
    });

    it.each([null, 0, undefined])('exige cota maior que zero (%s)', (produtividade) => {
      expect(() => validarAlocacao({ ...gratificada, produtividade }, lista)).toThrow(
        'Escala gratificada precisa da cota de registros.',
      );
    });
  });
});

describe('validarProdutividade', () => {
  it('vazio é "não informado", diferente de zero', () => {
    expect(validarProdutividade(undefined)).toBeNull();
    expect(validarProdutividade(null)).toBeNull();
    expect(validarProdutividade(0)).toBe(0);
  });
});

describe('classificarAlocacao', () => {
  const base = { dataFim: null, gratificado: false, coberturaDeId: null };

  it('sem fim é fixa', () => {
    expect(classificarAlocacao(base)).toBe('fixa');
  });

  it('com fim é período único', () => {
    expect(classificarAlocacao({ ...base, dataFim: '2026-11-30' })).toBe('periodo_unico');
  });

  it('gratificada vence período único', () => {
    expect(classificarAlocacao({ ...base, dataFim: '2026-11-30', gratificado: true })).toBe(
      'gratificada',
    );
  });

  it('cobertura vence tudo', () => {
    expect(classificarAlocacao({ ...base, dataFim: '2026-11-30', coberturaDeId: 'titular' })).toBe(
      'cobertura',
    );
  });
});
