import { describe, expect, it } from 'vitest';

import { REGRAS_NEUTRAS, type RegrasFrente, RegrasPorFrente } from './configuracao';
import {
  type CelulaRecebimento,
  criarLeitorPrioridade,
  type ExcecaoRecebimento,
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
  furaGradeNaAlocacao: true,
  padrao: false,
  cor: null,
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
  furaGradeNaAlocacao: false,
  padrao: false,
  cor: null,
  grafias: ['Ambulatório', 'Ambulatorio'],
};
const ROTINA: PrioridadeOperacao = {
  id: 'op-rotina',
  nome: 'ROTINA',
  posicao: 3,
  urgencia: { tipo: 'nunca' },
  furaGradeNaAlocacao: false,
  padrao: true,
  cor: null,
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

describe('GradeRecebimento com exceções temporárias', () => {
  const geral: CelulaRecebimento[] = [
    { prioridadeOperacaoId: ROTINA.id, turnoId: LISTA, regra: { tipo: 'prazo_minimo', horas: 24 } },
    { prioridadeOperacaoId: URGENCIA.id, turnoId: LISTA, regra: { tipo: 'nao_recebe' } },
  ];
  const regrasCardio = new RegrasPorFrente([
    regrasDa(frenteEsp(CARDIO), {
      recebimento: [
        {
          prioridadeOperacaoId: ROTINA.id,
          turnoId: LISTA,
          regra: { tipo: 'prazo_minimo', horas: 48 },
        },
      ],
    }),
  ]);
  let seq = 0;
  const excecao = (p: Partial<ExcecaoRecebimento> = {}): ExcecaoRecebimento => ({
    id: `exc-${++seq}`,
    turnoId: LISTA,
    frente: null,
    prioridadeOperacaoId: null,
    regra: { tipo: 'segue_sla' },
    de: '2026-11-25',
    ate: '2026-12-22',
    criadoEm: new Date('2026-11-25T12:00:00Z'),
    ...p,
  });

  it('toda a Lista segue o SLA até 22/12: sobrepõe a grade geral e a da frente no período', () => {
    const excecoes = [excecao()];
    const naVigencia = new GradeRecebimento(geral, regrasCardio, { excecoes, dia: '2026-12-22' });
    expect(naVigencia.regra(ROTINA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'segue_sla' });
    expect(naVigencia.regra(URGENCIA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'segue_sla' });
    expect(naVigencia.regra(ROTINA.id, LISTA, frenteEsp(CARDIO))).toEqual({ tipo: 'segue_sla' });
    expect(naVigencia.regra(null, LISTA, frenteEsp(MI))).toEqual({ tipo: 'segue_sla' });
  });

  it('fora do período volta sozinha ao que está na grade', () => {
    const excecoes = [excecao()];
    const depois = new GradeRecebimento(geral, regrasCardio, { excecoes, dia: '2026-12-23' });
    const antes = new GradeRecebimento(geral, regrasCardio, { excecoes, dia: '2026-11-24' });
    for (const g of [antes, depois]) {
      expect(g.regra(ROTINA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'prazo_minimo', horas: 24 });
      expect(g.regra(ROTINA.id, LISTA, frenteEsp(CARDIO))).toEqual({
        tipo: 'prazo_minimo',
        horas: 48,
      });
    }
  });

  it('vale só para o turno, a frente e a prioridade que recorta', () => {
    const excecoes = [
      excecao({
        frente: frenteEsp(CARDIO),
        prioridadeOperacaoId: ROTINA.id,
        regra: { tipo: 'nao_recebe' },
      }),
    ];
    const g = new GradeRecebimento(geral, regrasCardio, { excecoes, dia: '2026-12-01' });
    expect(g.regra(ROTINA.id, LISTA, frenteEsp(CARDIO))).toEqual({ tipo: 'nao_recebe' });
    expect(g.regra(ROTINA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'prazo_minimo', horas: 24 });
    expect(g.regra(URGENCIA.id, LISTA, frenteEsp(CARDIO))).toEqual({ tipo: 'nao_recebe' });
    expect(g.regra(ROTINA.id, MANHA, frenteEsp(CARDIO))).toEqual({ tipo: 'segue_sla' });
    // Frente de modalidade só casa com o período da mesma modalidade.
    const rx = new GradeRecebimento(geral, regrasCardio, {
      excecoes: [excecao({ frente: frenteMod(RX), regra: { tipo: 'nao_recebe' } })],
      dia: '2026-12-01',
    });
    expect(rx.regra(ROTINA.id, LISTA, frenteMod(RX))).toEqual({ tipo: 'nao_recebe' });
    expect(rx.regra(ROTINA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'prazo_minimo', horas: 24 });
  });

  it('a mais específica vence: frente+prioridade > frente ou prioridade > só o turno', () => {
    const soTurno = excecao({ regra: { tipo: 'segue_sla' }, criadoEm: new Date('2026-11-30') });
    const soPrioridade = excecao({
      prioridadeOperacaoId: ROTINA.id,
      regra: { tipo: 'prazo_minimo', horas: 6 },
      criadoEm: new Date('2026-11-01'),
    });
    const frenteEPrioridade = excecao({
      frente: frenteEsp(CARDIO),
      prioridadeOperacaoId: ROTINA.id,
      regra: { tipo: 'nao_recebe' },
      criadoEm: new Date('2026-10-01'),
    });
    const g = new GradeRecebimento(geral, regrasCardio, {
      excecoes: [soTurno, soPrioridade, frenteEPrioridade],
      dia: '2026-12-01',
    });
    expect(g.regra(ROTINA.id, LISTA, frenteEsp(CARDIO))).toEqual({ tipo: 'nao_recebe' });
    expect(g.regra(ROTINA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'prazo_minimo', horas: 6 });
    expect(g.regra(URGENCIA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'segue_sla' });
  });

  it('no empate de especificidade, vale a criada por último', () => {
    const antiga = excecao({ regra: { tipo: 'nao_recebe' }, criadoEm: new Date('2026-11-01') });
    const nova = excecao({ regra: { tipo: 'segue_sla' }, criadoEm: new Date('2026-11-20') });
    const g = new GradeRecebimento(geral, regrasCardio, {
      excecoes: [nova, antiga],
      dia: '2026-12-01',
    });
    expect(g.regra(ROTINA.id, LISTA, frenteEsp(MI))).toEqual({ tipo: 'segue_sla' });
  });
});
