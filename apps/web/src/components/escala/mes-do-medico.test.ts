import { describe, expect, it } from 'vitest';

import { calendarioDoMedico, doMes, ordenarPlantoes, resumoDoMes } from './mes-do-medico';
import { ocorrencia } from './teste-dados';

const tarde = {
  turnoId: 't-tarde',
  turnoNome: 'Tarde',
  turnoCor: '#7A4D00',
  turnoOrdem: 2,
  horarioInicio: '13:00',
  horarioFim: '19:00',
};

describe('ordenarPlantoes', () => {
  it('por dia, turno, frente e hora de início', () => {
    const ordenados = ordenarPlantoes([
      ocorrencia({ alocacaoId: 'c', data: '2026-11-17' }),
      ocorrencia({ alocacaoId: 'b', ...tarde }),
      ocorrencia({ alocacaoId: 'a' }),
    ]);
    expect(ordenados.map((o) => o.alocacaoId)).toEqual(['a', 'b', 'c']);
  });
});

describe('calendarioDoMedico', () => {
  it('semanas do mês (seg a sex), dias de fora marcados e os plantões no dia certo', () => {
    const { colunas, semanas } = calendarioDoMedico({
      data: '2026-11-10',
      ocorrencias: [
        ocorrencia({ alocacaoId: 't', data: '2026-11-18', diaSemana: 3, ...tarde }),
        ocorrencia({ alocacaoId: 'm', data: '2026-11-18', diaSemana: 3 }),
        ocorrencia({ alocacaoId: 'x', data: '2026-10-28', diaSemana: 3 }),
      ],
    });
    expect(colunas).toEqual([1, 2, 3, 4, 5]);
    expect(semanas).toHaveLength(6);
    // Cada semana só com os dias das colunas (seg a sex).
    expect(semanas[0]?.map((d) => d.data)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
    expect(semanas[0]?.[0]?.doMes).toBe(false);
    expect(semanas[0]?.[2]?.plantoes.map((o) => o.alocacaoId)).toEqual(['x']);
    const dia18 = semanas.flat().find((d) => d.data === '2026-11-18');
    expect(dia18?.doMes).toBe(true);
    expect(dia18?.plantoes.map((o) => o.alocacaoId)).toEqual(['m', 't']);
  });

  it('sáb e dom entram com plantão ou ausência no mês, ou com o alternador', () => {
    const comDomingo = calendarioDoMedico({
      data: '2026-11-10',
      ocorrencias: [ocorrencia({ data: '2026-11-22', diaSemana: 0, ausente: true })],
    });
    expect(comDomingo.colunas).toEqual([1, 2, 3, 4, 5, 0]);
    expect(comDomingo.semanas[0]).toHaveLength(6);

    const comAlternador = calendarioDoMedico({
      data: '2026-11-10',
      ocorrencias: [],
      mostrarFimDeSemana: true,
    });
    expect(comAlternador.colunas).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe('doMes e resumoDoMes', () => {
  const ocorrencias = [
    ocorrencia({ data: '2026-11-16' }),
    ocorrencia({ data: '2026-11-19', diaSemana: 4, ...tarde }),
    ocorrencia({ data: '2026-11-20', diaSemana: 5, ...tarde }),
    // Da grade, mas de outro mês: fica de fora do resumo.
    ocorrencia({ data: '2026-12-03', diaSemana: 4, ...tarde }),
  ];

  it('doMes deixa só os plantões do mês mostrado', () => {
    expect(doMes(ocorrencias, '2026-11-10').map((o) => o.data)).toEqual([
      '2026-11-16',
      '2026-11-19',
      '2026-11-20',
    ]);
  });

  it('total do mês e as linhas por frente, turno e horário', () => {
    const { total, linhas } = resumoDoMes(ocorrencias, '2026-11-10');
    expect(total).toBe(3);
    expect(linhas.map((l) => [l.frente, l.turno, l.dias, l.horario, l.plantoes])).toEqual([
      ['TC Neuro', 'Manhã', 'Seg', '07:00–13:00', 1],
      ['TC Neuro', 'Tarde', 'Qui e Sex', '13:00–19:00', 2],
    ]);
  });
});
