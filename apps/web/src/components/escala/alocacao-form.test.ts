import { describe, expect, it } from 'vitest';
import type { AlocacaoItemDto } from '../../gen/types/AlocacaoItemDto';
import { TODAS } from '../form/caixas-todas';

import { esquemaAlocacao, GERAL, paraApi, valoresIniciais } from './alocacao-form';

const alocacao: AlocacaoItemDto = {
  id: 'a1',
  medicoId: 'm1',
  turnoId: 't1',
  frenteId: 'f1',
  vigencia: 'fixa',
  diasSemana: [1, 3],
  semanasDoMes: [-1],
  horarioInicio: '07:00',
  horarioFim: '13:00',
  dataInicio: '2026-11-02',
  dataFim: null,
  produtividade: 40,
  gratificado: false,
  subespecialidadeGeral: true,
  prioridadeIds: ['p1'],
  subespecialidadeIds: ['s1'],
  coberturaDeId: null,
  observacoes: null,
  classificacao: 'fixa',
};

describe('valoresIniciais', () => {
  it('nova pelo "+" do dia: frente, turno, dia da semana e início vêm do clique', () => {
    const v = valoresIniciais({
      hoje: '2026-11-16',
      inicial: { data: '2026-11-18', frenteId: 'f1', turnoId: 't1' },
    });
    expect(v).toMatchObject({
      frenteId: 'f1',
      turnoId: 't1',
      vigencia: 'fixa',
      dataInicio: '2026-11-18',
      diasSemana: ['3'],
      medico: null,
    });
  });

  it('nova sem clique: começa hoje, sem dia marcado', () => {
    const v = valoresIniciais({ hoje: '2026-11-16' });
    expect(v.dataInicio).toBe('2026-11-16');
    expect(v.diasSemana).toEqual([]);
  });

  it('aceita valores iniciais de fora (ex.: os arranjos do médico, quando existirem)', () => {
    const v = valoresIniciais({
      hoje: '2026-11-16',
      inicial: { prioridadeIds: ['p9'], produtividade: 30 },
    });
    expect(v.prioridadeIds).toEqual(['p9']);
    expect(v.produtividade).toBe('30');
  });

  it('edição: tudo da alocação, com o geral entre as subespecialidades', () => {
    const v = valoresIniciais({
      hoje: '2026-11-16',
      alocacao,
      medico: { valor: 'm1', rotulo: 'Ana' },
    });
    expect(v).toMatchObject({
      medico: { valor: 'm1', rotulo: 'Ana' },
      vigencia: 'fixa',
      diasSemana: ['1', '3'],
      semanasDoMes: ['-1'],
      produtividade: '40',
      subespecialidadeIds: ['s1', GERAL],
    });
  });

  it('edição de fixa com fim: continua fixa, com o "Até" preenchido', () => {
    const v = valoresIniciais({
      hoje: '2026-11-16',
      alocacao: { ...alocacao, dataFim: '2026-12-31' },
    });
    expect(v).toMatchObject({ vigencia: 'fixa', dataFim: '2026-12-31' });
  });

  it('edição de período único', () => {
    const v = valoresIniciais({
      hoje: '2026-11-16',
      alocacao: { ...alocacao, vigencia: 'periodo', dataFim: '2026-11-30' },
    });
    expect(v).toMatchObject({ vigencia: 'periodo', dataFim: '2026-11-30' });
  });
});

const validos = {
  ...valoresIniciais({ hoje: '2026-11-16' }),
  medico: { valor: 'm1', rotulo: 'Ana' },
  frenteId: 'f1',
  turnoId: 't1',
  diasSemana: ['1'],
  horarioInicio: '07:00',
  horarioFim: '13:00',
};

const erros = (valores: object) =>
  esquemaAlocacao.safeParse(valores).error?.issues.map((i) => i.message) ?? [];

describe('esquemaAlocacao', () => {
  it('aceita o mínimo', () => {
    expect(erros(validos)).toEqual([]);
  });

  it('exige médico, frente, turno e um dia', () => {
    expect(erros({ ...validos, medico: null, frenteId: '', turnoId: '', diasSemana: [] })).toEqual([
      'Escolha o médico.',
      'Escolha a frente.',
      'Escolha o turno.',
      'Marque ao menos um dia da semana.',
    ]);
  });

  it('período único exige fim, depois do início', () => {
    expect(erros({ ...validos, vigencia: 'periodo', dataFim: '' })).toEqual([
      'Informe o fim do período.',
    ]);
    expect(erros({ ...validos, vigencia: 'periodo', dataFim: '2026-11-01' })).toEqual([
      'O fim não pode ser antes do início.',
    ]);
  });

  it('escala fixa: "Até" é opcional, mas não antes do início', () => {
    expect(erros({ ...validos, dataFim: '' })).toEqual([]);
    expect(erros({ ...validos, dataFim: '2026-11-01' })).toEqual([
      'O fim não pode ser antes do início.',
    ]);
  });

  it('semanas, prioridades e segmentos: "Todas" explícita; nada marcado pede ao menos uma', () => {
    expect(
      erros({
        ...validos,
        semanasDoMes: [TODAS],
        prioridadeIds: [TODAS],
        subespecialidadeIds: [TODAS],
      }),
    ).toEqual([]);
    expect(
      erros({
        ...validos,
        semanasDoMes: [],
        prioridadeIds: [],
        subespecialidadeIds: [],
      }),
    ).toEqual([
      'Marque ao menos uma semana.',
      'Marque ao menos uma prioridade.',
      'Marque ao menos um segmento.',
    ]);
  });

  it('gratificado exige fim e cota', () => {
    expect(erros({ ...validos, gratificado: true, dataFim: '', produtividade: '' })).toEqual([
      'Informe o fim do período.',
      'Informe a cota de registros do período.',
    ]);
  });

  it('horário no formato HH:MM e produtividade inteira', () => {
    expect(erros({ ...validos, horarioInicio: '7h', produtividade: '1.5' })).toEqual([
      'Use HH:MM, como 07:00.',
      'Use um número inteiro igual ou maior que zero.',
    ]);
  });
});

describe('paraApi', () => {
  it('escala fixa sem "Até": sem fim; vazios viram nulo; o geral vira a marcação própria', () => {
    expect(
      paraApi({
        ...validos,
        semanasDoMes: ['2', '-1'],
        subespecialidadeIds: ['s1', GERAL],
        observacoes: '  ',
        dataFim: '',
      }),
    ).toEqual({
      medicoId: 'm1',
      frenteId: 'f1',
      turnoId: 't1',
      vigencia: 'fixa',
      diasSemana: [1],
      semanasDoMes: [2, -1],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataInicio: '2026-11-16',
      dataFim: null,
      produtividade: null,
      gratificado: false,
      prioridadeIds: [],
      subespecialidadeIds: ['s1'],
      subespecialidadeGeral: true,
      observacoes: null,
    });
  });

  it('escala fixa com "Até": manda o fim e continua fixa', () => {
    expect(paraApi({ ...validos, dataFim: '2026-12-31' })).toMatchObject({
      vigencia: 'fixa',
      dataFim: '2026-12-31',
    });
  });

  it('gratificado: com fim e cota, sem semanas do mês', () => {
    const corpo = paraApi({
      ...validos,
      gratificado: true,
      dataFim: '2026-11-30',
      produtividade: '80',
      semanasDoMes: ['1'],
    });
    expect(corpo).toMatchObject({
      vigencia: 'periodo',
      gratificado: true,
      dataFim: '2026-11-30',
      produtividade: 80,
      semanasDoMes: [],
    });
  });
});
