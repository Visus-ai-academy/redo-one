import { describe, expect, it } from 'vitest';

import {
  type CoberturaExistente,
  type DadosCobertura,
  type TitularDaCobertura,
  validarCobertura,
} from './cobertura';
import { ConflitoEscalaError, EscalaInvalidaError } from './errors';

const tarde = { nome: 'Tarde', tipo: 'fixo' as const, horarioInicio: '13:00', horarioFim: '19:00' };

const titular: TitularDaCobertura = {
  id: 'titular',
  medicoId: 'medico-a',
  diasSemana: [1, 3, 5],
  semanasDoMes: [],
  dataInicio: '2026-11-02',
  dataFim: null,
  horarioInicio: '13:00',
  horarioFim: '19:00',
  produtividade: 40,
  gratificado: false,
  coberturaDeId: null,
};

// Semana de 09/11/2026 (segunda) a 13/11 (sexta)
const dados: DadosCobertura = {
  medicoId: 'medico-b',
  dataInicio: '2026-11-09',
  dataFim: '2026-11-13',
};

describe('validarCobertura', () => {
  it('assume os dias, o horário e a produtividade do titular por padrão', () => {
    expect(validarCobertura(dados, titular, tarde, [])).toEqual({
      medicoId: 'medico-b',
      coberturaDeId: 'titular',
      diasSemana: [1, 3, 5],
      semanasDoMes: [],
      horarioInicio: '13:00',
      horarioFim: '19:00',
      dataInicio: '2026-11-09',
      dataFim: '2026-11-13',
      produtividade: 40,
      gratificado: false,
    });
  });

  it('usa só os dias pedidos que são do titular', () => {
    expect(
      validarCobertura({ ...dados, diasSemana: [3, 4] }, titular, tarde, []).diasSemana,
    ).toEqual([3]);
  });

  it('recusa quando nenhum dia pedido é do titular', () => {
    expect(() => validarCobertura({ ...dados, diasSemana: [2, 4] }, titular, tarde, [])).toThrow(
      'Nenhum dia marcado é dia do vínculo coberto.',
    );
  });

  it('não cobre uma cobertura', () => {
    expect(() =>
      validarCobertura(dados, { ...titular, coberturaDeId: 'outro' }, tarde, []),
    ).toThrow(/já é uma cobertura/);
  });

  it('o médico não cobre a si mesmo', () => {
    expect(() => validarCobertura({ ...dados, medicoId: 'medico-a' }, titular, tarde, [])).toThrow(
      'O médico não pode cobrir a própria escala.',
    );
  });

  it('exige data de fim', () => {
    expect(() => validarCobertura({ ...dados, dataFim: null }, titular, tarde, [])).toThrow(
      'Informe a data de fim da cobertura.',
    );
  });

  it('precisa caber na vigência do titular', () => {
    expect(() =>
      validarCobertura({ ...dados, dataInicio: '2026-11-01' }, titular, tarde, []),
    ).toThrow(/vigência do vínculo/);
    const comFim = { ...titular, dataFim: '2026-11-11' };
    expect(() => validarCobertura(dados, comFim, tarde, [])).toThrow(/vigência do vínculo/);
  });

  it('pelo menos um plantão do titular cai no período, contando as semanas do mês dele', () => {
    // titular só na 1ª segunda do mês; 09/11 é a 2ª
    const primeiraSegunda = { ...titular, diasSemana: [1], semanasDoMes: [1] };
    expect(() =>
      validarCobertura({ ...dados, dataFim: '2026-11-10' }, primeiraSegunda, tarde, []),
    ).toThrow('Nenhum plantão do vínculo cai no período escolhido.');
  });

  it('o horário da cobertura precisa caber no turno', () => {
    expect(() =>
      validarCobertura(
        { ...dados, horarioInicio: '18:00', horarioFim: '20:00' },
        titular,
        tarde,
        [],
      ),
    ).toThrow(EscalaInvalidaError);
  });

  it('produtividade informada é a da cobertura; gratificação do titular não passa adiante', () => {
    expect(
      validarCobertura({ ...dados, produtividade: 10 }, titular, tarde, []).produtividade,
    ).toBe(10);
    expect(
      validarCobertura({ ...dados, produtividade: null }, titular, tarde, []).produtividade,
    ).toBe(null);
    const gratificado = {
      ...titular,
      gratificado: true,
      dataFim: '2026-11-30',
      produtividade: 300,
    };
    expect(validarCobertura(dados, gratificado, tarde, [])).toMatchObject({
      produtividade: null,
      gratificado: false,
    });
  });

  describe('um plantão do titular só tem uma cobertura', () => {
    const outra: CoberturaExistente = {
      id: 'cobertura-1',
      dataInicio: '2026-11-11',
      dataFim: '2026-11-20',
      diasSemana: [3],
    };

    it('recusa com conflito quando outra cobertura pega o mesmo plantão', () => {
      expect(() => validarCobertura(dados, titular, tarde, [outra])).toThrow(ConflitoEscalaError);
      expect(() => validarCobertura(dados, titular, tarde, [outra])).toThrow(/11\/11\/2026/);
    });

    it('aceita quando os dias da semana não se cruzam', () => {
      expect(() =>
        validarCobertura({ ...dados, diasSemana: [1, 5] }, titular, tarde, [outra]),
      ).not.toThrow();
    });

    it('aceita quando os períodos não se cruzam', () => {
      expect(() =>
        validarCobertura({ ...dados, dataFim: '2026-11-10' }, titular, tarde, [outra]),
      ).not.toThrow();
    });

    it('ignora a própria cobertura na edição', () => {
      expect(() =>
        validarCobertura(dados, titular, tarde, [outra], { ignorarId: 'cobertura-1' }),
      ).not.toThrow();
    });
  });
});
