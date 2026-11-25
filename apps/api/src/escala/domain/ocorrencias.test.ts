import { describe, expect, it } from 'vitest';

import type { AusenciaEscala } from './ausencia';
import { EscalaInvalidaError } from './errors';
import {
  type AlocacaoEscala,
  diaEmBrasilia,
  type EntradaExpansao,
  expandirOcorrencias,
  instanteBrasilia,
  JANELA_MAXIMA_DIAS,
} from './ocorrencias';

// Novembro/2026: 01 é domingo, 02 segunda.
const turnos = [
  { id: 'manha', tipo: 'fixo' as const, horarioInicio: '07:00', horarioFim: '13:00', ativo: true },
  { id: 'tarde', tipo: 'fixo' as const, horarioInicio: '13:00', horarioFim: '19:00', ativo: true },
  { id: 'noite', tipo: 'fixo' as const, horarioInicio: '19:00', horarioFim: '07:00', ativo: true },
  { id: 'lista', tipo: 'lista' as const, horarioInicio: '07:00', horarioFim: '07:00', ativo: true },
];
const frentes = [
  { id: 'tc', ativo: true },
  { id: 'neuro', ativo: true },
];

function alocacao(over: Partial<AlocacaoEscala> & { id: string }): AlocacaoEscala {
  return {
    medicoId: 'ana',
    turnoId: 'manha',
    frenteId: 'tc',
    diasSemana: [1, 3],
    semanasDoMes: [],
    horarioInicio: '07:00',
    horarioFim: '13:00',
    dataInicio: '2026-10-01',
    dataFim: null,
    produtividade: 40,
    gratificado: false,
    subespecialidadeGeral: false,
    prioridadeIds: [],
    subespecialidadeIds: [],
    coberturaDeId: null,
    ...over,
    // Como os dados antigos: sem fim é fixa, com fim é período (salvo quando o teste diz).
    vigencia: over.vigencia ?? (over.dataFim ? 'periodo' : 'fixa'),
    // Sem o "todas" explícito, o recorte que não veio é "todas" (só nos testes).
    todasSemanas: over.todasSemanas ?? !over.semanasDoMes?.length,
    todasPrioridades: over.todasPrioridades ?? !over.prioridadeIds?.length,
    todosSegmentos:
      over.todosSegmentos ?? (!over.subespecialidadeIds?.length && !over.subespecialidadeGeral),
  };
}

function entrada(over: Partial<EntradaExpansao>): EntradaExpansao {
  return {
    de: '2026-11-02',
    ate: '2026-11-08',
    hoje: '2026-11-02',
    alocacoes: [],
    turnos,
    frentes,
    medicosAtivos: ['ana', 'bia', 'caio'],
    ausencias: [],
    tiposAusencia: [],
    ajustes: [],
    ...over,
  };
}

const datas = (lista: { data: string }[]) => lista.map((o) => o.data);

describe('diaEmBrasilia', () => {
  it('é o dia do calendário de Brasília (UTC−3)', () => {
    expect(diaEmBrasilia(new Date('2026-11-17T02:59:00Z'))).toBe('2026-11-16');
    expect(diaEmBrasilia(new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-17');
  });
});

describe('instanteBrasilia', () => {
  it('monta o instante ISO com o offset fixo de Brasília', () => {
    expect(instanteBrasilia('2026-11-02', '07:00')).toBe('2026-11-02T07:00:00-03:00');
  });

  it('soma minutos virando o dia', () => {
    expect(instanteBrasilia('2026-12-31', '19:00', 720)).toBe('2027-01-01T07:00:00-03:00');
  });
});

describe('expandirOcorrencias', () => {
  describe('janela', () => {
    it('recusa fim antes do início', () => {
      expect(() => expandirOcorrencias(entrada({ de: '2026-11-08', ate: '2026-11-02' }))).toThrow(
        EscalaInvalidaError,
      );
    });

    it(`recusa janela maior que ${JANELA_MAXIMA_DIAS} dias`, () => {
      expect(() => expandirOcorrencias(entrada({ de: '2026-01-01', ate: '2027-02-05' }))).toThrow(
        /400 dias/,
      );
      expect(() =>
        expandirOcorrencias(entrada({ de: '2026-01-01', ate: '2027-02-04' })),
      ).not.toThrow();
    });
  });

  it('gera uma ocorrência por dia marcado dentro da janela, com os dados do vínculo', () => {
    const a = alocacao({
      id: 'a1',
      prioridadeIds: ['urgente'],
      subespecialidadeIds: ['coluna'],
      subespecialidadeGeral: true,
    });
    const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [a] }));
    expect(datas(ocorrencias)).toEqual(['2026-11-02', '2026-11-04']);
    expect(ocorrencias[0]).toEqual({
      alocacaoId: 'a1',
      data: '2026-11-02',
      diaSemana: 1,
      medicoId: 'ana',
      turnoId: 'manha',
      turnoTipo: 'fixo',
      frenteId: 'tc',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      inicio: '2026-11-02T07:00:00-03:00',
      fim: '2026-11-02T13:00:00-03:00',
      produtividade: 40,
      produtividadeEscala: 40,
      ajustada: false,
      gratificado: false,
      dataInicio: '2026-10-01',
      dataFim: null,
      vigencia: 'fixa',
      diasSemana: [1, 3],
      todasSemanas: true,
      semanasDoMes: [],
      todasPrioridades: false,
      todosSegmentos: false,
      prioridadeIds: ['urgente'],
      subespecialidadeIds: ['coluna'],
      subespecialidadeGeral: true,
      coberturaDeId: null,
      cobertoPorAlocacaoId: null,
      ausente: false,
      tipoAusenciaId: null,
      doDiaAnterior: false,
    });
  });

  it('respeita a vigência do vínculo', () => {
    const a = alocacao({ id: 'a1', dataInicio: '2026-11-03', dataFim: '2026-11-04' });
    expect(datas(expandirOcorrencias(entrada({ alocacoes: [a] })))).toEqual(['2026-11-04']);
  });

  it('respeita as semanas do mês (domingo pelo sábado da véspera)', () => {
    // 5º fim de semana: sábado 31/10 e domingo 01/11
    const a = alocacao({ id: 'a1', diasSemana: [0, 6], semanasDoMes: [5] });
    const ocorrencias = expandirOcorrencias(
      entrada({ de: '2026-10-24', ate: '2026-11-08', alocacoes: [a] }),
    );
    expect(datas(ocorrencias)).toEqual(['2026-10-31', '2026-11-01']);
  });

  describe('inativo some de hoje em diante e mantém o passado', () => {
    // Janela de 26/10 a 08/11, hoje = quarta 04/11: segundas e quartas 26/10, 28/10, 02/11, 04/11.
    const janela = { de: '2026-10-26', ate: '2026-11-08', hoje: '2026-11-04' };

    it('médico inativo', () => {
      const a = alocacao({ id: 'a1', medicoId: 'dan' });
      const ocorrencias = expandirOcorrencias(entrada({ ...janela, alocacoes: [a] }));
      expect(datas(ocorrencias)).toEqual(['2026-10-26', '2026-10-28', '2026-11-02']);
    });

    it('turno inativo', () => {
      const a = alocacao({ id: 'a1' });
      const inativos = turnos.map((t) => (t.id === 'manha' ? { ...t, ativo: false } : t));
      const ocorrencias = expandirOcorrencias(
        entrada({ ...janela, alocacoes: [a], turnos: inativos }),
      );
      expect(datas(ocorrencias)).toEqual(['2026-10-26', '2026-10-28', '2026-11-02']);
    });

    it('frente inativa', () => {
      const a = alocacao({ id: 'a1' });
      const inativas = frentes.map((f) => (f.id === 'tc' ? { ...f, ativo: false } : f));
      const ocorrencias = expandirOcorrencias(
        entrada({ ...janela, alocacoes: [a], frentes: inativas }),
      );
      expect(datas(ocorrencias)).toEqual(['2026-10-26', '2026-10-28', '2026-11-02']);
    });

    it('cobertura de médico inativo fica no passado; de hoje em diante o titular volta', () => {
      const titular = alocacao({ id: 'tit' });
      const cobertura = alocacao({
        id: 'cob',
        medicoId: 'dan',
        coberturaDeId: 'tit',
        dataInicio: '2026-11-02',
        dataFim: '2026-11-04',
      });
      const ocorrencias = expandirOcorrencias(
        entrada({ ...janela, alocacoes: [titular, cobertura] }),
      );
      expect(datas(ocorrencias.filter((o) => o.alocacaoId === 'cob'))).toEqual(['2026-11-02']);
      expect(
        ocorrencias.find((o) => o.alocacaoId === 'tit' && o.data === '2026-11-04'),
      ).toMatchObject({ ausente: false, cobertoPorAlocacaoId: null });
    });
  });

  describe('plantão do dia anterior em curso no início da janela', () => {
    const noite = alocacao({
      id: 'noite',
      turnoId: 'noite',
      horarioInicio: '19:00',
      horarioFim: '07:00',
      diasSemana: [0, 1, 2, 3, 4, 5, 6],
    });

    it('entra marcado como do dia anterior quando o fim passa da meia-noite de `de`', () => {
      const ocorrencias = expandirOcorrencias(
        entrada({ de: '2026-11-03', ate: '2026-11-03', alocacoes: [noite] }),
      );
      expect(ocorrencias.map((o) => [o.data, o.doDiaAnterior])).toEqual([
        ['2026-11-02', true],
        ['2026-11-03', false],
      ]);
      expect(ocorrencias[0]).toMatchObject({
        inicio: '2026-11-02T19:00:00-03:00',
        fim: '2026-11-03T07:00:00-03:00',
      });
    });

    it('o do dia anterior que termina até a meia-noite fica de fora', () => {
      const ateMeiaNoite = alocacao({
        id: 'tarde',
        turnoId: 'noite',
        horarioInicio: '19:00',
        horarioFim: '00:00',
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
      });
      const ocorrencias = expandirOcorrencias(
        entrada({ de: '2026-11-03', ate: '2026-11-03', alocacoes: [ateMeiaNoite] }),
      );
      expect(datas(ocorrencias)).toEqual(['2026-11-03']);
    });

    it('a cobertura do plantão do dia anterior também entra', () => {
      const cobertura = alocacao({
        id: 'cob',
        medicoId: 'bia',
        coberturaDeId: 'noite',
        horarioInicio: '19:00',
        horarioFim: '07:00',
        diasSemana: [1],
        dataInicio: '2026-11-02',
        dataFim: '2026-11-02',
      });
      const ocorrencias = expandirOcorrencias(
        entrada({ de: '2026-11-03', ate: '2026-11-03', alocacoes: [noite, cobertura] }),
      );
      expect(
        ocorrencias.filter((o) => o.doDiaAnterior).map((o) => [o.alocacaoId, o.ausente]),
      ).toEqual([
        ['noite', true],
        ['cob', false],
      ]);
    });
  });

  describe('inativos não geram ocorrência', () => {
    it('médico inativo', () => {
      const a = alocacao({ id: 'a1', medicoId: 'dan' });
      expect(expandirOcorrencias(entrada({ alocacoes: [a] }))).toEqual([]);
    });

    it('turno inativo', () => {
      const a = alocacao({ id: 'a1' });
      const inativos = turnos.map((t) => (t.id === 'manha' ? { ...t, ativo: false } : t));
      expect(expandirOcorrencias(entrada({ alocacoes: [a], turnos: inativos }))).toEqual([]);
    });

    it('frente inativa', () => {
      const a = alocacao({ id: 'a1' });
      const inativas = frentes.map((f) => (f.id === 'tc' ? { ...f, ativo: false } : f));
      expect(expandirOcorrencias(entrada({ alocacoes: [a], frentes: inativas }))).toEqual([]);
    });
  });

  describe('instantes', () => {
    it('turno que vira a meia-noite termina no dia seguinte', () => {
      const a = alocacao({
        id: 'a1',
        turnoId: 'noite',
        horarioInicio: '19:00',
        horarioFim: '07:00',
        diasSemana: [1],
      });
      const [o] = expandirOcorrencias(entrada({ alocacoes: [a] }));
      expect(o).toMatchObject({
        inicio: '2026-11-02T19:00:00-03:00',
        fim: '2026-11-03T07:00:00-03:00',
      });
    });

    it('fim igual ao início é 24 h', () => {
      const a = alocacao({
        id: 'a1',
        turnoId: 'lista',
        horarioInicio: '07:00',
        horarioFim: '07:00',
        diasSemana: [1],
      });
      const [o] = expandirOcorrencias(entrada({ alocacoes: [a] }));
      expect(o).toMatchObject({
        turnoTipo: 'lista',
        inicio: '2026-11-02T07:00:00-03:00',
        fim: '2026-11-03T07:00:00-03:00',
      });
    });
  });

  it('o ajuste do dia troca a produtividade só naquele dia', () => {
    const a = alocacao({ id: 'a1' });
    const ocorrencias = expandirOcorrencias(
      entrada({
        alocacoes: [a],
        ajustes: [{ alocacaoId: 'a1', data: '2026-11-04', produtividade: 0 }],
      }),
    );
    expect(ocorrencias.map((o) => [o.produtividade, o.produtividadeEscala, o.ajustada])).toEqual([
      [40, 40, false],
      [0, 40, true],
    ]);
  });

  describe('período único', () => {
    const fixa = alocacao({ id: 'fixa' });
    const unico = alocacao({
      id: 'unico',
      diasSemana: [1],
      dataInicio: '2026-11-02',
      dataFim: '2026-11-02',
      subespecialidadeIds: ['coluna'],
    });

    it('substitui a fixa no mesmo médico, turno e frente, só nos dias dele', () => {
      const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [fixa, unico] }));
      expect(ocorrencias.map((o) => [o.data, o.alocacaoId])).toEqual([
        ['2026-11-02', 'unico'],
        ['2026-11-04', 'fixa'],
      ]);
    });

    it('fixa com fim (ex.: encerrada) não substitui outra fixa e é substituída pelo período', () => {
      const encerrada = alocacao({
        id: 'encerrada',
        vigencia: 'fixa',
        diasSemana: [1],
        dataFim: '2026-11-30',
      });
      const soFixas = expandirOcorrencias(entrada({ alocacoes: [fixa, encerrada] }));
      expect(
        soFixas
          .filter((o) => o.data === '2026-11-02')
          .map((o) => o.alocacaoId)
          .sort(),
      ).toEqual(['encerrada', 'fixa']);
      const comUnico = expandirOcorrencias(entrada({ alocacoes: [encerrada, unico] }));
      expect(comUnico.map((o) => [o.data, o.alocacaoId])).toEqual([['2026-11-02', 'unico']]);
    });

    it('a ocorrência diz a vigência e a repetição da alocação', () => {
      const [o] = expandirOcorrencias(entrada({ alocacoes: [{ ...fixa, semanasDoMes: [1, 3] }] }));
      expect(o).toMatchObject({ vigencia: 'fixa', diasSemana: [1, 3], semanasDoMes: [1, 3] });
    });

    it('em outro turno é extra', () => {
      const outroTurno = {
        ...unico,
        turnoId: 'tarde',
        horarioInicio: '13:00',
        horarioFim: '19:00',
      };
      const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [fixa, outroTurno] }));
      expect(ocorrencias.map((o) => [o.data, o.alocacaoId])).toEqual([
        ['2026-11-02', 'fixa'],
        ['2026-11-02', 'unico'],
        ['2026-11-04', 'fixa'],
      ]);
    });

    it('em outra frente ou de outro médico é extra', () => {
      const outraFrente = { ...unico, frenteId: 'neuro' };
      const outroMedico = { ...unico, id: 'unico-bia', medicoId: 'bia' };
      const ocorrencias = expandirOcorrencias(
        entrada({ alocacoes: [fixa, outraFrente, outroMedico] }),
      );
      expect(
        ocorrencias
          .filter((o) => o.data === '2026-11-02')
          .map((o) => o.alocacaoId)
          .sort(),
      ).toEqual(['fixa', 'unico', 'unico-bia']);
    });

    it('gratificada não substitui a fixa', () => {
      const lista = alocacao({
        id: 'fixa-lista',
        turnoId: 'lista',
        horarioFim: '07:00',
        diasSemana: [1],
      });
      const gratificada = {
        ...lista,
        id: 'grat',
        gratificado: true,
        dataInicio: '2026-11-01',
        dataFim: '2026-11-30',
        produtividade: 300,
      };
      const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [lista, gratificada] }));
      expect(ocorrencias.map((o) => o.alocacaoId).sort()).toEqual(['fixa-lista', 'grat']);
    });
  });

  describe('cobertura', () => {
    const titular = alocacao({
      id: 'titular',
      diasSemana: [1, 3, 5],
      prioridadeIds: ['urgente'],
      subespecialidadeIds: ['coluna'],
      subespecialidadeGeral: true,
    });
    const cobertura = alocacao({
      id: 'cob',
      medicoId: 'bia',
      // turno e frente gravados diferentes de propósito: valem os do titular
      turnoId: 'tarde',
      frenteId: 'neuro',
      diasSemana: [3, 5],
      horarioInicio: '09:00',
      horarioFim: '13:00',
      dataInicio: '2026-11-04',
      dataFim: '2026-11-20',
      produtividade: 15,
      prioridadeIds: ['outra'],
      coberturaDeId: 'titular',
    });

    it('titular coberto vira ausente "cobertura" e quem cobre assume o plantão com os recortes do titular', () => {
      const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [titular, cobertura] }));
      const quarta = ocorrencias.filter((o) => o.data === '2026-11-04');
      expect(quarta.find((o) => o.alocacaoId === 'titular')).toMatchObject({
        ausente: true,
        tipoAusenciaId: 'cobertura',
        cobertoPorAlocacaoId: 'cob',
      });
      expect(quarta.find((o) => o.alocacaoId === 'cob')).toMatchObject({
        medicoId: 'bia',
        turnoId: 'manha',
        frenteId: 'tc',
        horarioInicio: '09:00',
        horarioFim: '13:00',
        inicio: '2026-11-04T09:00:00-03:00',
        produtividade: 15,
        prioridadeIds: ['urgente'],
        subespecialidadeIds: ['coluna'],
        subespecialidadeGeral: true,
        gratificado: false,
        coberturaDeId: 'titular',
        dataInicio: '2026-11-04',
        dataFim: '2026-11-20',
        ausente: false,
      });
      // segunda 02/11 está fora da cobertura: o titular trabalha
      expect(ocorrencias.find((o) => o.data === '2026-11-02')).toMatchObject({
        alocacaoId: 'titular',
        ausente: false,
        cobertoPorAlocacaoId: null,
      });
    });

    it('só existe nos dias em que o titular tem plantão: encerrar o titular corta a cobertura', () => {
      const encerrado = { ...titular, dataFim: '2026-11-04' };
      const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [encerrado, cobertura] }));
      expect(ocorrencias.filter((o) => o.alocacaoId === 'cob').map((o) => o.data)).toEqual([
        '2026-11-04',
      ]);
    });

    it('sem o titular na entrada, a cobertura não aparece', () => {
      expect(expandirOcorrencias(entrada({ alocacoes: [cobertura] }))).toEqual([]);
    });

    it('conta as semanas do mês pelos dias do titular', () => {
      // titular no 5º fim de semana; a cobertura só do domingo 01/11 (o do sábado 31/10)
      const fds = alocacao({ id: 'fds', diasSemana: [0, 6], semanasDoMes: [5] });
      const soDomingo = {
        ...cobertura,
        coberturaDeId: 'fds',
        diasSemana: [0],
        dataInicio: '2026-10-25',
        dataFim: '2026-11-01',
      };
      const ocorrencias = expandirOcorrencias(
        entrada({ de: '2026-10-25', ate: '2026-11-01', alocacoes: [fds, soDomingo] }),
      );
      expect(ocorrencias.map((o) => [o.data, o.alocacaoId, o.ausente])).toEqual([
        ['2026-10-31', 'fds', false],
        ['2026-11-01', 'fds', true],
        ['2026-11-01', 'cob', false],
      ]);
    });

    it('médico de quem cobre inativo: o titular não fica coberto', () => {
      const ocorrencias = expandirOcorrencias(
        entrada({ alocacoes: [titular, cobertura], medicosAtivos: ['ana'] }),
      );
      expect(ocorrencias.every((o) => o.alocacaoId === 'titular' && !o.ausente)).toBe(true);
    });

    it('médico titular inativo: a cobertura continua, o titular some', () => {
      const ocorrencias = expandirOcorrencias(
        entrada({ alocacoes: [titular, cobertura], medicosAtivos: ['bia'] }),
      );
      expect(ocorrencias.map((o) => [o.data, o.alocacaoId])).toEqual([
        ['2026-11-04', 'cob'],
        ['2026-11-06', 'cob'],
      ]);
    });

    it('fixa substituída por período único do titular não tem plantão para cobrir', () => {
      const unico = alocacao({
        id: 'unico',
        diasSemana: [3],
        dataInicio: '2026-11-04',
        dataFim: '2026-11-04',
      });
      const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [titular, unico, cobertura] }));
      expect(ocorrencias.filter((o) => o.data === '2026-11-04').map((o) => o.alocacaoId)).toEqual([
        'unico',
      ]);
    });

    it('o ajuste do dia é da própria cobertura', () => {
      const ocorrencias = expandirOcorrencias(
        entrada({
          alocacoes: [titular, cobertura],
          ajustes: [{ alocacaoId: 'cob', data: '2026-11-06', produtividade: 5 }],
        }),
      );
      expect(
        ocorrencias.find((o) => o.alocacaoId === 'cob' && o.data === '2026-11-06'),
      ).toMatchObject({
        produtividade: 5,
        produtividadeEscala: 15,
        ajustada: true,
      });
    });
  });

  describe('ausência', () => {
    const a = alocacao({ id: 'a1' });
    const ferias: AusenciaEscala = {
      id: 'aus1',
      medicoId: 'ana',
      tipoId: 'ferias',
      dataInicio: '2026-11-04',
      dataFim: '2026-11-04',
      todosDias: true,
      diasSemana: [],
      todasFrentes: true,
      frenteIds: [],
      todosTurnos: true,
      turnoIds: [],
      situacao: 'aprovada',
    };
    const tiposAusencia = [
      { id: 'ferias', gravidade: 3 },
      { id: 'falta', gravidade: 6 },
      { id: 'folga', gravidade: 2 },
    ];

    it('aprovada tira o médico do dia', () => {
      const ocorrencias = expandirOcorrencias(
        entrada({ alocacoes: [a], ausencias: [ferias], tiposAusencia }),
      );
      expect(ocorrencias.map((o) => [o.data, o.ausente, o.tipoAusenciaId])).toEqual([
        ['2026-11-02', false, null],
        ['2026-11-04', true, 'ferias'],
      ]);
    });

    it('pendente não conta', () => {
      const ocorrencias = expandirOcorrencias(
        entrada({
          alocacoes: [a],
          ausencias: [{ ...ferias, situacao: 'pendente' }],
          tiposAusencia,
        }),
      );
      expect(ocorrencias.every((o) => !o.ausente)).toBe(true);
    });

    it('com várias no dia vence a de maior gravidade', () => {
      const ausencias = [
        { ...ferias, id: 'x', tipoId: 'folga' },
        { ...ferias, id: 'y', tipoId: 'falta' },
        { ...ferias, id: 'z', tipoId: 'ferias' },
      ];
      const ocorrencias = expandirOcorrencias(
        entrada({ alocacoes: [a], ausencias, tiposAusencia }),
      );
      expect(ocorrencias.find((o) => o.data === '2026-11-04')?.tipoAusenciaId).toBe('falta');
    });

    it('respeita o recorte de turno', () => {
      const tarde = alocacao({
        id: 'a2',
        turnoId: 'tarde',
        horarioInicio: '13:00',
        horarioFim: '19:00',
        diasSemana: [3],
      });
      const soManha = { ...ferias, todosTurnos: false, turnoIds: ['manha'] };
      const ocorrencias = expandirOcorrencias(
        entrada({ alocacoes: [a, tarde], ausencias: [soManha], tiposAusencia }),
      );
      expect(
        ocorrencias.filter((o) => o.data === '2026-11-04').map((o) => [o.turnoId, o.ausente]),
      ).toEqual([
        ['manha', true],
        ['tarde', false],
      ]);
    });

    it('ausência real prevalece sobre "coberto"', () => {
      const cobertura = alocacao({
        id: 'cob',
        medicoId: 'bia',
        diasSemana: [3],
        dataInicio: '2026-11-04',
        dataFim: '2026-11-04',
        coberturaDeId: 'a1',
      });
      const ocorrencias = expandirOcorrencias(
        entrada({ alocacoes: [a, cobertura], ausencias: [ferias], tiposAusencia }),
      );
      expect(
        ocorrencias.find((o) => o.alocacaoId === 'a1' && o.data === '2026-11-04'),
      ).toMatchObject({
        ausente: true,
        tipoAusenciaId: 'ferias',
        cobertoPorAlocacaoId: 'cob',
      });
    });

    it('a ausência de quem cobre tira a cobertura do dia', () => {
      const cobertura = alocacao({
        id: 'cob',
        medicoId: 'bia',
        diasSemana: [3],
        dataInicio: '2026-11-04',
        dataFim: '2026-11-04',
        coberturaDeId: 'a1',
      });
      const ocorrencias = expandirOcorrencias(
        entrada({
          alocacoes: [a, cobertura],
          ausencias: [{ ...ferias, medicoId: 'bia', tipoId: 'folga' }],
          tiposAusencia,
        }),
      );
      expect(ocorrencias.find((o) => o.alocacaoId === 'cob')).toMatchObject({
        ausente: true,
        tipoAusenciaId: 'folga',
      });
    });
  });

  it('ordena por data, início, turno, frente e médico', () => {
    const tarde = alocacao({
      id: 't',
      medicoId: 'bia',
      turnoId: 'tarde',
      horarioInicio: '13:00',
      horarioFim: '19:00',
      diasSemana: [1],
    });
    const manhaCaio = alocacao({ id: 'c', medicoId: 'caio', diasSemana: [1] });
    const manhaAna = alocacao({ id: 'a', diasSemana: [1] });
    const ocorrencias = expandirOcorrencias(entrada({ alocacoes: [tarde, manhaCaio, manhaAna] }));
    expect(ocorrencias.map((o) => o.alocacaoId)).toEqual(['a', 'c', 't']);
  });
});
