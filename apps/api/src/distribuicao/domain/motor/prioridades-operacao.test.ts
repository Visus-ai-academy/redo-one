import { describe, expect, it } from 'vitest';

import { REGRAS_NEUTRAS, type RegrasFrente, RegrasPorFrente } from './configuracao';
import {
  type CelulaRecebimento,
  criarLeitorPrioridade,
  GradeRecebimento,
  type PrioridadeOperacao,
  urgenciaNaFrente,
  urgente,
} from './prioridades-operacao';

const CARDIO = 'esp-cardio';
const MAMA = 'esp-mama';
const MI = 'esp-mi';
const RX = 'mod-rx';
const MANHA = 'turno-manha';
const LISTA = 'turno-lista';

/** Os valores iniciais aprovados em 18/11/2026. */
const URGENCIA: PrioridadeOperacao = {
  id: 'op-urgencia',
  nome: 'URGÊNCIA',
  posicao: 1,
  urgencia: { tipo: 'sempre' },
  padrao: false,
  grafias: [
    'Urgência',
    'Urgencia',
    'Urgente',
    'Emergência',
    'P1',
    'P1.Imediato',
    'P2',
    'P2.Urgente',
  ],
};
const AMBULATORIO: PrioridadeOperacao = {
  id: 'op-ambulatorio',
  nome: 'AMBULATÓRIO',
  posicao: 2,
  urgencia: { tipo: 'prazo', horas: 24 },
  padrao: false,
  grafias: ['Ambulatório', 'Ambulatorio'],
};
const ROTINA: PrioridadeOperacao = {
  id: 'op-rotina',
  nome: 'ROTINA',
  posicao: 3,
  urgencia: { tipo: 'nunca' },
  padrao: true,
  grafias: ['Rotina', 'P4', 'P4.Rotina+', 'P5', 'P5.Rotina'],
};
const PRIORIDADES = [URGENCIA, AMBULATORIO, ROTINA];

const frenteEsp = (especialidadeId: string) =>
  ({ tipo: 'especialidade', especialidadeId, modalidadeId: null }) as const;
const frenteMod = (modalidadeId: string) =>
  ({ tipo: 'modalidade', especialidadeId: null, modalidadeId }) as const;
const regrasDa = (frente: RegrasFrente['frente'], p: Partial<RegrasFrente> = {}): RegrasFrente => ({
  ...REGRAS_NEUTRAS,
  frente,
  ...p,
});

describe('criarLeitorPrioridade', () => {
  const ler = criarLeitorPrioridade(PRIORIDADES);

  it('acha a prioridade da operação pela grafia, sem acento e sem diferenciar maiúsculas', () => {
    expect(ler('EMERGENCIA').prioridade?.id).toBe('op-urgencia');
    expect(ler(' p2.urgente ').prioridade?.id).toBe('op-urgencia');
    expect(ler('ambulatório').prioridade?.id).toBe('op-ambulatorio');
    expect(ler('Rotina').semDePara).toBe(false);
  });

  it('grafia sem de-para (ou vazia) vale como a prioridade padrão e é sinalizada', () => {
    expect(ler('P9.Desconhecida')).toEqual({ prioridade: ROTINA, semDePara: true });
    expect(ler(null)).toEqual({ prioridade: ROTINA, semDePara: true });
  });

  it('sem prioridade padrão cadastrada, a grafia desconhecida fica sem prioridade', () => {
    const semPadrao = criarLeitorPrioridade([URGENCIA, { ...ROTINA, padrao: false }]);
    expect(semPadrao('xyz')).toEqual({ prioridade: null, semDePara: true });
  });
});

describe('urgente', () => {
  it('nunca, sempre ou quando o prazo restante fica abaixo de N horas', () => {
    expect(urgente({ tipo: 'nunca' }, -60)).toBe(false);
    expect(urgente({ tipo: 'sempre' }, 5000)).toBe(true);
    expect(urgente({ tipo: 'prazo', horas: 24 }, 23 * 60)).toBe(true);
    expect(urgente({ tipo: 'prazo', horas: 24 }, -10)).toBe(true);
    expect(urgente({ tipo: 'prazo', horas: 24 }, 24 * 60)).toBe(false);
    // Prazo ilegível não prova urgência.
    expect(urgente({ tipo: 'prazo', horas: 24 }, null)).toBe(false);
  });
});

describe('urgenciaNaFrente', () => {
  it('a da frente do exame (especialidade, depois modalidade) sobrescreve a da prioridade', () => {
    const regras = new RegrasPorFrente([
      regrasDa(frenteEsp(CARDIO), {
        urgencias: [{ prioridadeOperacaoId: AMBULATORIO.id, urgencia: { tipo: 'nunca' } }],
      }),
      regrasDa(frenteMod(RX), {
        urgencias: [{ prioridadeOperacaoId: ROTINA.id, urgencia: { tipo: 'prazo', horas: 6 } }],
      }),
    ]);
    const cardioRx = { especialidadeId: CARDIO, modalidadeId: RX };
    expect(urgenciaNaFrente(AMBULATORIO, cardioRx, regras)).toEqual({ tipo: 'nunca' });
    // A especialidade não sobrescreve a ROTINA: vale a da modalidade.
    expect(urgenciaNaFrente(ROTINA, cardioRx, regras)).toEqual({ tipo: 'prazo', horas: 6 });
    expect(
      urgenciaNaFrente(AMBULATORIO, { especialidadeId: MI, modalidadeId: null }, regras),
    ).toEqual(AMBULATORIO.urgencia);
  });
});

describe('GradeRecebimento', () => {
  const geral: CelulaRecebimento[] = [
    { prioridadeOperacaoId: ROTINA.id, turnoId: LISTA, regra: { tipo: 'prazo_minimo', horas: 24 } },
    { prioridadeOperacaoId: URGENCIA.id, turnoId: LISTA, regra: { tipo: 'nao_recebe' } },
  ];

  it('célula sem valor na grade geral segue o SLA', () => {
    const grade = new GradeRecebimento(geral, new RegrasPorFrente([]));
    expect(grade.regra(ROTINA.id, MANHA, frenteEsp(MI))).toEqual({ tipo: 'segue_sla' });
    expect(grade.regra(ROTINA.id, LISTA, frenteEsp(MI))).toEqual({
      tipo: 'prazo_minimo',
      horas: 24,
    });
    expect(grade.regra(null, LISTA, frenteEsp(MI))).toEqual({ tipo: 'segue_sla' });
  });

  it('a frente do período sobrescreve só as células que mudam (CARDIO ROTINA × Manhã 48 h)', () => {
    const regras = new RegrasPorFrente([
      regrasDa(frenteEsp(CARDIO), {
        recebimento: [
          {
            prioridadeOperacaoId: ROTINA.id,
            turnoId: MANHA,
            regra: { tipo: 'prazo_minimo', horas: 48 },
          },
          { prioridadeOperacaoId: ROTINA.id, turnoId: LISTA, regra: { tipo: 'segue_sla' } },
        ],
      }),
      regrasDa(frenteEsp(MAMA)),
    ]);
    const grade = new GradeRecebimento(geral, regras);
    expect(grade.regra(ROTINA.id, MANHA, frenteEsp(CARDIO))).toEqual({
      tipo: 'prazo_minimo',
      horas: 48,
    });
    expect(grade.regra(ROTINA.id, LISTA, frenteEsp(CARDIO))).toEqual({ tipo: 'segue_sla' });
    expect(grade.regra(URGENCIA.id, LISTA, frenteEsp(CARDIO))).toEqual({ tipo: 'nao_recebe' });
    expect(grade.regra(ROTINA.id, MANHA, frenteEsp(MAMA))).toEqual({ tipo: 'segue_sla' });
  });
});
