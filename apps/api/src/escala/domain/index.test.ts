import { describe, expect, it } from 'vitest';

import { conflitosDoMedico, expandirOcorrencias } from './index';

describe('domínio da escala', () => {
  it('a expansão alimenta a detecção de conflitos: só o mesmo turno conflita', () => {
    const base = {
      medicoId: 'ana',
      frenteId: 'tc',
      diasSemana: [1],
      todasSemanas: true,
      semanasDoMes: [],
      dataInicio: '2026-11-02',
      dataFim: null,
      produtividade: null,
      gratificado: false,
      todasPrioridades: true,
      todosSegmentos: true,
      subespecialidadeGeral: false,
      prioridadeIds: [],
      subespecialidadeIds: [],
      coberturaDeId: null,
      vigencia: 'fixa' as const,
    };
    const ocorrencias = expandirOcorrencias({
      de: '2026-11-02',
      ate: '2026-11-02',
      hoje: '2026-11-02',
      alocacoes: [
        { ...base, id: 'manha', turnoId: 'manha', horarioInicio: '07:00', horarioFim: '13:00' },
        {
          ...base,
          id: 'rx',
          turnoId: 'manha',
          frenteId: 'rx',
          horarioInicio: '07:00',
          horarioFim: '13:00',
        },
        { ...base, id: 'lista', turnoId: 'lista', horarioInicio: '07:00', horarioFim: '07:00' },
      ],
      turnos: [
        { id: 'manha', tipo: 'fixo', horarioInicio: '07:00', horarioFim: '13:00', ativo: true },
        { id: 'lista', tipo: 'lista', horarioInicio: '07:00', horarioFim: '07:00', ativo: true },
      ],
      frentes: [
        { id: 'tc', ativo: true },
        { id: 'rx', ativo: true },
      ],
      medicosAtivos: ['ana'],
      ausencias: [],
      tiposAusencia: [],
      ajustes: [],
    });
    const conflitos = conflitosDoMedico(ocorrencias);
    expect(conflitos.map((c) => [c.a.alocacaoId, c.b.alocacaoId].sort())).toEqual([
      ['manha', 'rx'],
    ]);
  });
});
