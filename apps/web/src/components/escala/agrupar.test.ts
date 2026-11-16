import { describe, expect, it } from 'vitest';

import {
  type AusenciaDaSemana,
  aplicarRecorte,
  barrasDeAusencia,
  chavesEmConflito,
  contarPorDia,
  descreverPonta,
  emBlocos,
  filtrarPorMedico,
  montarCalendarios,
  montarGrade,
  opcoesComInativos,
  resumoDoMedico,
  semDiaAnterior,
} from './agrupar';
import { FRENTE_RM, FRENTE_TC, frenteDoTurno, ocorrencia, turno } from './teste-dados';

const DIAS = ['2026-11-16', '2026-11-17'];
const frentes = [FRENTE_RM, FRENTE_TC].map((f) => ({ ...f, ativo: true }));
const turnos = [
  turno({ id: 't-tarde', nome: 'Tarde', ordem: 2, frentes: [frenteDoTurno('f-tc', 'TC Neuro')] }),
  turno(),
];

describe('montarGrade por frente', () => {
  const grade = montarGrade({
    ocorrencias: [
      ocorrencia({ alocacaoId: 'b', medicoNome: 'Bruno Lima', medicoId: 'm2' }),
      ocorrencia(),
      ocorrencia({ data: '2026-11-17' }),
    ],
    turnos,
    frentes,
    por: 'frente',
  });

  it('seções pela ordem da frente; linhas pelos turnos que têm a frente', () => {
    expect(grade.map((g) => g.rotulo)).toEqual(['TC Neuro', 'RM Geral']);
    expect(grade[0]?.linhas.map((l) => l.rotulo)).toEqual(['Manhã', 'Tarde']);
    expect(grade[1]?.linhas.map((l) => l.rotulo)).toEqual(['Manhã']);
  });

  it('cada célula com os plantões do dia em ordem de nome', () => {
    const manha = grade[0]?.linhas[0];
    expect(manha?.porDia['2026-11-16']?.map((o) => o.medicoNome)).toEqual([
      'Ana Souza',
      'Bruno Lima',
    ]);
    expect(manha?.porDia['2026-11-17']).toHaveLength(1);
    expect(manha?.frenteId).toBe('f-tc');
    expect(manha?.turnoId).toBe('t-manha');
  });
});

describe('montarGrade por turno', () => {
  it('seções pelos turnos e linhas pelas frentes deles', () => {
    const grade = montarGrade({ ocorrencias: [], turnos, frentes, por: 'turno' });
    expect(grade.map((g) => g.rotulo)).toEqual(['Manhã', 'Tarde']);
    expect(grade[0]?.linhas.map((l) => l.rotulo)).toEqual(['TC Neuro', 'RM Geral']);
  });

  it('plantão cujo par turno e frente não está na configuração ganha linha própria', () => {
    const grade = montarGrade({
      ocorrencias: [ocorrencia({ frenteId: 'f-velha', frenteRotulo: 'Velha', frenteOrdem: 9 })],
      turnos: [turno()],
      frentes,
      por: 'turno',
    });
    expect(grade[0]?.linhas.map((l) => l.rotulo)).toEqual(['TC Neuro', 'RM Geral', 'Velha']);
  });

  it('seção sem nenhuma linha não aparece', () => {
    const grade = montarGrade({
      ocorrencias: [],
      turnos: [turno({ frentes: [frenteDoTurno('f-tc', 'TC Neuro')] })],
      frentes,
      por: 'frente',
    });
    expect(grade.map((g) => g.rotulo)).toEqual(['TC Neuro']);
  });
});

describe('filtrarPorMedico', () => {
  it('casa parte do nome sem acento nem maiúscula', () => {
    const lista = [ocorrencia(), ocorrencia({ medicoNome: 'Bruno Lima' })];
    expect(filtrarPorMedico(lista, 'sou').map((o) => o.medicoNome)).toEqual(['Ana Souza']);
    expect(filtrarPorMedico(lista, '  ')).toHaveLength(2);
  });
});

describe('chavesEmConflito', () => {
  it('marca os dois lados de cada conflito no dia', () => {
    const chaves = chavesEmConflito([
      {
        medicoId: 'm1',
        medicoNome: 'Ana',
        data: '2026-11-16',
        a: { alocacaoId: 'a1' } as never,
        b: { alocacaoId: 'a2' } as never,
      },
    ]);
    expect(chaves.has('a1|2026-11-16')).toBe(true);
    expect(chaves.has('a2|2026-11-16')).toBe(true);
    expect(chaves.has('a1|2026-11-17')).toBe(false);
  });
});

describe('contarPorDia', () => {
  it('conta por turno quem trabalha no dia, sem os ausentes', () => {
    const contagem = contarPorDia([
      ocorrencia(),
      ocorrencia({ medicoId: 'm2' }),
      ocorrencia({ medicoId: 'm3', ausente: true }),
      ocorrencia({ turnoId: 't-tarde', turnoNome: 'Tarde', turnoOrdem: 2 }),
      ocorrencia({ data: DIAS[1] }),
    ]);
    expect(contagem.get('2026-11-16')).toEqual([
      { turnoId: 't-manha', nome: 'Manhã', cor: '#214037', total: 2 },
      { turnoId: 't-tarde', nome: 'Tarde', cor: '#214037', total: 1 },
    ]);
    expect(contagem.get('2026-11-17')?.[0]?.total).toBe(1);
  });
});

describe('resumoDoMedico', () => {
  it('agrupa por frente, turno e horário, com os dias da semana', () => {
    const resumo = resumoDoMedico([
      ocorrencia({ data: '2026-11-16', diaSemana: 1 }),
      ocorrencia({ data: '2026-11-18', diaSemana: 3 }),
      ocorrencia({ data: '2026-11-23', diaSemana: 1 }),
      ocorrencia({ data: '2026-11-21', diaSemana: 6, horarioInicio: '08:00' }),
    ]);
    expect(resumo).toEqual([
      {
        chave: 'f-tc|t-manha|07:00|13:00',
        frente: 'TC Neuro',
        turno: 'Manhã',
        horario: '07:00–13:00',
        dias: 'Seg e Qua',
        plantoes: 3,
        primeiro: '2026-11-16',
        ultimo: '2026-11-23',
      },
      {
        chave: 'f-tc|t-manha|08:00|13:00',
        frente: 'TC Neuro',
        turno: 'Manhã',
        horario: '08:00–13:00',
        dias: 'Sáb',
        plantoes: 1,
        primeiro: '2026-11-21',
        ultimo: '2026-11-21',
      },
    ]);
  });
});

describe('aplicarRecorte', () => {
  const manha = turno();
  const tarde = turno({
    id: 't-tarde',
    nome: 'Tarde',
    frentes: [frenteDoTurno('f-rm', 'RM Geral')],
  });

  it('sem recorte, tudo', () => {
    const r = aplicarRecorte([manha, tarde], frentes, null);
    expect(r.turnos).toHaveLength(2);
    expect(r.frentes).toHaveLength(2);
  });

  it('vale o par cujo turno OU frente está no recorte', () => {
    const r = aplicarRecorte([manha, tarde], frentes, {
      turnoIds: ['t-tarde'],
      frenteIds: ['f-tc'],
    });
    expect(r.turnos.map((t) => [t.id, t.frentes.map((f) => f.id)])).toEqual([
      ['t-manha', ['f-tc']],
      ['t-tarde', ['f-rm']],
    ]);
    expect(r.frentes.map((f) => f.id).sort()).toEqual(['f-rm', 'f-tc']);
  });

  it('turno sem par liberado sai', () => {
    const r = aplicarRecorte([manha, tarde], frentes, { turnoIds: [], frenteIds: ['f-tc'] });
    expect(r.turnos.map((t) => t.id)).toEqual(['t-manha']);
    expect(r.frentes.map((f) => f.id)).toEqual(['f-tc']);
  });
});

describe('descreverPonta', () => {
  it('com os dados, frente, turno e horário', () => {
    expect(
      descreverPonta({
        foraDoRecorte: false,
        data: '2026-11-16',
        alocacaoId: 'a1',
        turnoNome: 'Manhã',
        frenteRotulo: 'TC Neuro',
        inicio: '2026-11-16T07:00:00-03:00',
        fim: '2026-11-16T13:00:00-03:00',
      }),
    ).toBe('TC Neuro, Manhã (07:00–13:00)');
  });

  it('fora do recorte, sem detalhe', () => {
    expect(descreverPonta({ foraDoRecorte: true, data: '2026-11-16' })).toBe(
      'um plantão fora do seu recorte nesse dia',
    );
  });
});

describe('semDiaAnterior', () => {
  it('tira o plantão do dia anterior que ainda corre à meia-noite', () => {
    const lista = [ocorrencia(), ocorrencia({ data: '2026-11-15', doDiaAnterior: true })];
    expect(semDiaAnterior(lista).map((o) => o.data)).toEqual(['2026-11-16']);
  });
});

describe('opcoesComInativos', () => {
  it('acrescenta aos filtros turnos e frentes que só aparecem nos plantões (inativos)', () => {
    const r = opcoesComInativos(
      [turno()],
      [FRENTE_TC],
      [
        ocorrencia({
          turnoId: 't-velho',
          turnoNome: 'Velho',
          frenteId: 'f-velha',
          frenteRotulo: 'Velha',
        }),
        ocorrencia(),
      ],
    );
    expect(r.turnos).toEqual([
      { valor: 't-manha', rotulo: 'Manhã' },
      { valor: 't-velho', rotulo: 'Velho (inativo)' },
    ]);
    expect(r.frentes).toEqual([
      { valor: 'f-tc', rotulo: 'TC Neuro' },
      { valor: 'f-velha', rotulo: 'Velha (inativa)' },
    ]);
  });
});

describe('montarCalendarios por frente', () => {
  const { calendarios, legenda } = montarCalendarios({
    ocorrencias: [
      ocorrencia({ alocacaoId: 't1', turnoId: 't-tarde', turnoNome: 'Tarde', turnoOrdem: 2 }),
      ocorrencia({ alocacaoId: 'b', medicoNome: 'Bruno Lima', medicoId: 'm2' }),
      ocorrencia(),
      ocorrencia({ data: '2026-11-17' }),
    ],
    turnos,
    frentes,
    por: 'frente',
  });

  it('um calendário por frente, com a frente para o "+" e a contagem da semana', () => {
    expect(calendarios.map((c) => c.rotulo)).toEqual(['TC Neuro', 'RM Geral']);
    expect(calendarios[0]).toMatchObject({ frenteId: 'f-tc', plantoes: 4, medicos: 2 });
    expect(calendarios[0]?.turnoId).toBeUndefined();
    expect(calendarios[1]).toMatchObject({ plantoes: 0, medicos: 0 });
  });

  it('no dia, uma lista só, pela ordem do turno e depois do nome, com a cor do turno', () => {
    const dia = calendarios[0]?.porDia['2026-11-16'] ?? [];
    expect(dia.map((l) => `${l.ocorrencia.turnoNome} ${l.ocorrencia.medicoNome}`)).toEqual([
      'Manhã Ana Souza',
      'Manhã Bruno Lima',
      'Tarde Ana Souza',
    ]);
    expect(dia[0]?.cor).toBe('#214037');
  });

  it('a legenda são os turnos da semana, em ordem', () => {
    expect(legenda.map((l) => l.rotulo)).toEqual(['Manhã', 'Tarde']);
    expect(legenda[0]).toMatchObject({ id: 't-manha', cor: '#214037' });
  });
});

describe('montarCalendarios por turno', () => {
  it('um calendário por turno, a cor da frente na linha e a legenda das frentes', () => {
    const { calendarios, legenda } = montarCalendarios({
      ocorrencias: [
        ocorrencia(),
        ocorrencia({ alocacaoId: 'r', frenteId: 'f-rm', medicoNome: 'Ana' }),
      ],
      turnos,
      frentes,
      por: 'turno',
    });
    expect(calendarios.map((c) => c.rotulo)).toEqual(['Manhã', 'Tarde']);
    expect(calendarios[0]).toMatchObject({ turnoId: 't-manha', plantoes: 2 });
    expect(
      calendarios[0]?.porDia['2026-11-16']?.map((l) => [l.ocorrencia.alocacaoId, l.cor]),
    ).toEqual([
      ['a1', '#1F7A4D'],
      ['r', null],
    ]);
    expect(legenda.map((l) => l.rotulo)).toEqual(['TC Neuro', 'RM Geral']);
  });
});

describe('barrasDeAusencia', () => {
  const semana = [
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ];
  const ausencia = (dados: Partial<AusenciaDaSemana>): AusenciaDaSemana => ({
    id: 'x1',
    medico: { id: 'm1', nome: 'Ana Souza' },
    tipo: { id: 'tp', nome: 'Férias', cor: '#2F6FB2' },
    dataInicio: '2026-11-10',
    dataFim: '2026-11-18',
    diasSemana: [],
    ...dados,
  });

  it('uma linha por médico, em ordem de nome; a barra corta no começo da semana', () => {
    const linhas = barrasDeAusencia(
      [
        ausencia({
          id: 'b',
          medico: { id: 'm2', nome: 'Bruno' },
          dataInicio: '2026-11-20',
          dataFim: '2026-11-30',
        }),
        ausencia({}),
      ],
      semana,
    );
    expect(linhas.map((l) => l.medicoNome)).toEqual(['Ana Souza', 'Bruno']);
    expect(linhas[0]?.barras).toEqual([
      {
        ausenciaId: 'x1',
        tipoNome: 'Férias',
        cor: '#2F6FB2',
        de: 0,
        ate: 2,
        dataInicio: '2026-11-10',
        dataFim: '2026-11-18',
      },
    ]);
    expect(linhas[1]?.barras.map((b) => [b.de, b.ate])).toEqual([[4, 6]]);
  });

  it('com dias da semana marcados, uma barra por trecho seguido', () => {
    const linhas = barrasDeAusencia(
      [ausencia({ dataInicio: '2026-11-01', dataFim: '2026-11-30', diasSemana: [1, 2, 5] })],
      semana,
    );
    expect(linhas[0]?.barras.map((b) => [b.de, b.ate])).toEqual([
      [0, 1],
      [4, 4],
    ]);
  });

  it('as ausências do mesmo médico ficam na mesma linha; sem dia na semana, não entra', () => {
    const linhas = barrasDeAusencia(
      [
        ausencia({ id: 'a', dataInicio: '2026-11-16', dataFim: '2026-11-16' }),
        ausencia({ id: 'b', dataInicio: '2026-11-21', dataFim: '2026-11-22' }),
        ausencia({ id: 'c', medico: { id: 'm3', nome: 'Caio' }, diasSemana: [6] }),
      ],
      semana,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.barras.map((b) => b.ausenciaId)).toEqual(['a', 'b']);
  });
});

describe('emBlocos', () => {
  it('junta os médicos seguidos do mesmo turno (ou frente) num bloco com a cor dele', () => {
    const { calendarios } = montarCalendarios({
      ocorrencias: [
        ocorrencia({ alocacaoId: 't1', turnoId: 't-tarde', turnoNome: 'Tarde', turnoOrdem: 2 }),
        ocorrencia({ alocacaoId: 'b', medicoNome: 'Bruno Lima', medicoId: 'm2' }),
        ocorrencia(),
      ],
      turnos,
      frentes,
      por: 'frente',
    });
    const blocos = emBlocos(calendarios[0]?.porDia['2026-11-16'] ?? []);
    expect(blocos.map((b) => [b.id, b.cor, b.linhas.map((l) => l.ocorrencia.medicoNome)])).toEqual([
      ['t-manha', '#214037', ['Ana Souza', 'Bruno Lima']],
      ['t-tarde', '#214037', ['Ana Souza']],
    ]);
  });
});
