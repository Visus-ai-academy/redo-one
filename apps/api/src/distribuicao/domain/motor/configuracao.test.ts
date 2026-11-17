import { describe, expect, it } from 'vitest';

import {
  horarioSemRoboVigente,
  minutosDoHorario,
  naFaixa,
  REGRAS_NEUTRAS,
  RegrasPorFrente,
} from './configuracao';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

describe('horário sem robô', () => {
  const plantaoTc = { diasSemana: [], inicio: '19:00', fim: '07:00' };

  it('a faixa pode cruzar a meia-noite', () => {
    expect(naFaixa(plantaoTc, minutosDoHorario('23:00'))).toBe(true);
    expect(naFaixa(plantaoTc, minutosDoHorario('06:59'))).toBe(true);
    expect(naFaixa(plantaoTc, minutosDoHorario('07:00'))).toBe(false);
    expect(naFaixa(plantaoTc, minutosDoHorario('13:00'))).toBe(false);
  });

  it('usa o relógio de Brasília, não UTC (o TC das 16h ficava bloqueado no legado antigo)', () => {
    expect(horarioSemRoboVigente(plantaoTc, br('2026-10-16T16:00'))).toBe(false);
    expect(horarioSemRoboVigente(plantaoTc, br('2026-10-16T06:42'))).toBe(true);
  });

  it('respeita os dias da semana (sexta = 5)', () => {
    expect(horarioSemRoboVigente({ ...plantaoTc, diasSemana: [6] }, br('2026-10-16T23:00'))).toBe(
      false,
    );
    expect(horarioSemRoboVigente({ ...plantaoTc, diasSemana: [5] }, br('2026-10-16T23:00'))).toBe(
      true,
    );
  });
});

describe('RegrasPorFrente.doExame', () => {
  const mi = {
    ...REGRAS_NEUTRAS,
    frente: { tipo: 'especialidade' as const, especialidadeId: 'mi', modalidadeId: null },
    tetoPorMedico: 1,
  };
  const rx = {
    ...REGRAS_NEUTRAS,
    frente: { tipo: 'modalidade' as const, especialidadeId: null, modalidadeId: 'rx' },
    tetoPorMedico: 2,
  };
  const regras = new RegrasPorFrente([mi, rx]);

  it('a especialidade vence a modalidade; sem ela, a modalidade; sem nenhuma, null', () => {
    expect(regras.doExame({ especialidadeId: 'mi', modalidadeId: 'rx' })?.tetoPorMedico).toBe(1);
    expect(regras.doExame({ especialidadeId: 'neuro', modalidadeId: 'rx' })?.tetoPorMedico).toBe(2);
    expect(regras.doExame({ especialidadeId: 'neuro', modalidadeId: 'ct' })).toBeNull();
  });
});
