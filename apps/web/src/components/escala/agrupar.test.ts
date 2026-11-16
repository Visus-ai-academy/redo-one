import { describe, expect, it } from 'vitest';

import {
  aplicarRecorte,
  chavesEmConflito,
  contarPorDia,
  descreverPonta,
  filtrarPorMedico,
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
