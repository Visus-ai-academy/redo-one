import { describe, expect, it } from 'vitest';

import {
  type AlocacaoDaGrade,
  agruparCelulas,
  celulasDaGrade,
  ehAlocacaoDaGrade,
  planejarEscalaFixa,
  validarCelulas,
} from './escala-fixa';

const SEG = 1;
const TER = 2;
const QUA = 3;
const QUI = 4;
const SEX = 5;

const turnoManha = { horarioInicio: '07:00', horarioFim: '13:00' };

const fixa = (campos: Partial<Parameters<typeof ehAlocacaoDaGrade>[0]> = {}) => ({
  dataFim: null,
  coberturaDeId: null,
  gratificado: false,
  todasSemanas: true,
  horarioInicio: '07:00',
  horarioFim: '13:00',
  todasPrioridades: true,
  todosSegmentos: true,
  ...campos,
});

const atual = (campos: Partial<AlocacaoDaGrade> & { id: string }): AlocacaoDaGrade => ({
  turnoId: 'lista',
  diasSemana: [SEG],
  produtividade: 30,
  dataInicio: '2026-01-01',
  ...campos,
});

describe('validarCelulas', () => {
  it('recusa a mesma célula (turno + dia) duas vezes', () => {
    expect(() =>
      validarCelulas([
        { turnoId: 'lista', diaSemana: SEG, produtividade: 30 },
        { turnoId: 'lista', diaSemana: SEG, produtividade: 25 },
      ]),
    ).toThrow(/repetid/);
  });

  it('recusa dia fora de 0..6 e produtividade negativa ou fracionada', () => {
    expect(() => validarCelulas([{ turnoId: 'l', diaSemana: 7, produtividade: 1 }])).toThrow(
      /Dia da semana/,
    );
    expect(() => validarCelulas([{ turnoId: 'l', diaSemana: 1, produtividade: -1 }])).toThrow(
      /Produtividade/,
    );
    expect(() => validarCelulas([{ turnoId: 'l', diaSemana: 1, produtividade: 1.5 }])).toThrow(
      /Produtividade/,
    );
  });

  it('aceita produtividade nula (não informada) e o mesmo dia em turnos diferentes', () => {
    expect(() =>
      validarCelulas([
        { turnoId: 'manha', diaSemana: SEG, produtividade: null },
        { turnoId: 'tarde', diaSemana: SEG, produtividade: 0 },
      ]),
    ).not.toThrow();
  });
});

describe('agruparCelulas', () => {
  it('junta os dias do mesmo turno com a mesma produtividade', () => {
    const grupos = agruparCelulas([
      { turnoId: 'lista', diaSemana: SEG, produtividade: 30 },
      { turnoId: 'lista', diaSemana: TER, produtividade: 25 },
      { turnoId: 'lista', diaSemana: QUA, produtividade: 40 },
      { turnoId: 'lista', diaSemana: QUI, produtividade: 25 },
      { turnoId: 'lista', diaSemana: SEX, produtividade: 30 },
    ]);
    expect(grupos).toEqual([
      { turnoId: 'lista', produtividade: 30, diasSemana: [SEG, SEX] },
      { turnoId: 'lista', produtividade: 25, diasSemana: [TER, QUI] },
      { turnoId: 'lista', produtividade: 40, diasSemana: [QUA] },
    ]);
  });

  it('nula é um valor próprio, e turnos diferentes não se juntam', () => {
    expect(
      agruparCelulas([
        { turnoId: 'manha', diaSemana: QUA, produtividade: null },
        { turnoId: 'manha', diaSemana: SEG, produtividade: null },
        { turnoId: 'manha', diaSemana: TER, produtividade: 0 },
        { turnoId: 'tarde', diaSemana: SEG, produtividade: null },
      ]),
    ).toEqual([
      { turnoId: 'manha', produtividade: null, diasSemana: [SEG, QUA] },
      { turnoId: 'manha', produtividade: 0, diasSemana: [TER] },
      { turnoId: 'tarde', produtividade: null, diasSemana: [SEG] },
    ]);
  });
});

describe('ehAlocacaoDaGrade', () => {
  it('fixa, sem regra especial e no horário do turno entra na grade', () => {
    expect(ehAlocacaoDaGrade(fixa(), turnoManha)).toBe(true);
  });

  it.each([
    ['com fim', { dataFim: '2026-12-31' }],
    ['cobertura', { coberturaDeId: 'x' }],
    ['gratificada', { gratificado: true }],
    ['por semana do mês', { todasSemanas: false }],
    ['com horário próprio', { horarioFim: '12:00' }],
    ['com prioridades', { todasPrioridades: false }],
    ['com segmentos (ou o geral)', { todosSegmentos: false }],
  ])('%s fica fora da grade', (_, campos) => {
    expect(ehAlocacaoDaGrade(fixa(campos), turnoManha)).toBe(false);
  });
});

describe('celulasDaGrade', () => {
  it('abre cada alocação em uma célula por dia, uma vez por turno + dia', () => {
    expect(
      celulasDaGrade([
        atual({ id: 'a', diasSemana: [SEG, SEX], produtividade: 30 }),
        atual({ id: 'b', diasSemana: [TER], produtividade: null }),
        // Repetida (cadastro antigo): vale a primeira.
        atual({ id: 'c', diasSemana: [SEG], produtividade: 99 }),
      ]),
    ).toEqual([
      { turnoId: 'lista', diaSemana: SEG, produtividade: 30 },
      { turnoId: 'lista', diaSemana: SEX, produtividade: 30 },
      { turnoId: 'lista', diaSemana: TER, produtividade: null },
    ]);
  });
});

describe('planejarEscalaFixa', () => {
  const aPartirDe = '2026-11-23';
  const exemplo = [
    { turnoId: 'lista', diaSemana: SEG, produtividade: 30 },
    { turnoId: 'lista', diaSemana: TER, produtividade: 25 },
    { turnoId: 'lista', diaSemana: QUA, produtividade: 40 },
    { turnoId: 'lista', diaSemana: QUI, produtividade: 25 },
    { turnoId: 'lista', diaSemana: SEX, produtividade: 30 },
  ];

  it('sem escala atual, cria um grupo por turno + produtividade', () => {
    const plano = planejarEscalaFixa([], exemplo, aPartirDe);
    expect(plano.criar).toHaveLength(3);
    expect(plano).toMatchObject({ manter: [], encerrar: [], remover: [] });
  });

  it('grupo igual (turno, produtividade e dias) fica intacto', () => {
    const plano = planejarEscalaFixa(
      [
        atual({ id: 'a', diasSemana: [SEX, SEG], produtividade: 30 }),
        atual({ id: 'b', diasSemana: [TER, QUI], produtividade: 25 }),
        atual({ id: 'c', diasSemana: [QUA], produtividade: 40 }),
      ],
      exemplo,
      aPartirDe,
    );
    expect(plano).toEqual({ manter: ['a', 'b', 'c'], criar: [], encerrar: [], remover: [] });
  });

  it('o que mudou sai (encerrada se começou antes, removida se não) e o grupo novo entra', () => {
    const plano = planejarEscalaFixa(
      [
        // Mesmos dias, outra produtividade: começou antes → encerra.
        atual({ id: 'a', diasSemana: [SEG, SEX], produtividade: 20, dataInicio: '2026-01-01' }),
        // Começa no próprio "a partir de" → remove.
        atual({ id: 'b', diasSemana: [TER], produtividade: 25, dataInicio: aPartirDe }),
        atual({ id: 'c', diasSemana: [QUA], produtividade: 40 }),
      ],
      exemplo,
      aPartirDe,
    );
    expect(plano).toEqual({
      manter: ['c'],
      criar: [
        { turnoId: 'lista', produtividade: 30, diasSemana: [SEG, SEX] },
        { turnoId: 'lista', produtividade: 25, diasSemana: [TER, QUI] },
      ],
      encerrar: [{ id: 'a', dataFim: '2026-11-22' }],
      remover: ['b'],
    });
  });

  it('grade vazia encerra ou remove todas', () => {
    const plano = planejarEscalaFixa(
      [atual({ id: 'a' }), atual({ id: 'b', dataInicio: '2026-12-01' })],
      [],
      aPartirDe,
    );
    expect(plano).toEqual({
      manter: [],
      criar: [],
      encerrar: [{ id: 'a', dataFim: '2026-11-22' }],
      remover: ['b'],
    });
  });

  it('duas atuais iguais ao mesmo grupo: uma fica, a outra sai', () => {
    const plano = planejarEscalaFixa(
      [atual({ id: 'a' }), atual({ id: 'b' })],
      [{ turnoId: 'lista', diaSemana: SEG, produtividade: 30 }],
      aPartirDe,
    );
    expect(plano.manter).toEqual(['a']);
    expect(plano.encerrar).toEqual([{ id: 'b', dataFim: '2026-11-22' }]);
  });

  it('valida as células e a data', () => {
    expect(() => planejarEscalaFixa([], exemplo, '2026-02-31')).toThrow(/Data inválida/);
    expect(() => planejarEscalaFixa([], [...exemplo, ...exemplo], aPartirDe)).toThrow(/repetid/);
  });
});
