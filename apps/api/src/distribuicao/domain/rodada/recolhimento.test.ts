import { describe, expect, it } from 'vitest';

import type { FrenteEscala } from '../arranjo';
import {
  type EntradaRecolhimento,
  type ExameComMedico,
  entregasComRecolhidos,
  leituraComRecolhidos,
  type PeriodoDoMedico,
  protegidoPelaEscala,
  recolher,
} from './recolhimento';

/** Instante em Brasília: `h('13:30')` = 18/11 13:30; `h('07:00', 17)` = 17/11 07:00. */
const h = (hora: string, dia = 18) =>
  new Date(`2026-11-${String(dia).padStart(2, '0')}T${hora}:00-03:00`);

const AGORA = h('15:00');
const PARAMETROS = { carenciaMin: 60, carenciaListaMin: 1440, antecedenciaMin: 180 };

const NEURO: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'neuro', modalidadeId: null };
const RX: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'rx' };

/** Médico → conta na MobileMed. */
const CONTAS = new Map<string, number | null>([
  ['ana', 1],
  ['bia', 2],
  ['caio', 3],
]);

const periodo = (
  medicoId: string,
  inicio: Date,
  fim: Date,
  extra: Partial<PeriodoDoMedico> = {},
): PeriodoDoMedico => ({ medicoId, inicio, fim, lista: false, ausente: false, ...extra });

const MANHA_ANA = periodo('ana', h('07:00'), h('13:00'));

const exame = (idExame: string, extra: Partial<ExameComMedico> = {}): ExameComMedico => ({
  idExame,
  medicoIdMobilemed: 1,
  status: 'NOVO',
  pacienteChave: `p-${idExame}`,
  especialidadeId: 'neuro',
  modalidadeId: 'tc',
  ...extra,
});

function entrada(p: Partial<EntradaRecolhimento> = {}): EntradaRecolhimento {
  return {
    agora: AGORA,
    parametros: PARAMETROS,
    exames: [exame('e1')],
    entregas: new Map([['e1', { medicoId: 'ana', em: h('09:00') }]]),
    contas: CONTAS,
    periodos: [MANHA_ANA],
    ausencias: [],
    recolhe: () => true,
    ...p,
  };
}

const ids = (r: ReturnType<typeof recolher>) => r.recolhidos.map((x) => x.idExame);

describe('recolhimento: exame entregue pelo robô, não aberto, com o turno encerrado', () => {
  it('recolhe o exame do turno que acabou há mais que a carência, de quem o tinha', () => {
    const r = recolher(entrada());
    expect(r.recolhidos).toEqual([{ idExame: 'e1', deMedicoId: 'ana', motivo: 'turno_encerrado' }]);
  });

  it('desligado (carência nula): nada é recolhido, nem por ausência', () => {
    const r = recolher(
      entrada({ parametros: null, ausencias: [{ medicoId: 'ana', frentes: [] }] }),
    );
    expect(r.recolhidos).toEqual([]);
  });

  it('dentro da carência o exame fica com o médico', () => {
    const r = recolher(entrada({ agora: h('13:59') }));
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.turno_em_curso).toBe(1);
  });

  it('com o turno em curso o exame fica', () => {
    const r = recolher(entrada({ agora: h('11:00') }));
    expect(r.recolhidos).toEqual([]);
  });

  it('sem limite de dias para trás: o entregue há 10 dias e não laudado volta', () => {
    const r = recolher(
      entrada({
        entregas: new Map([['e1', { medicoId: 'ana', em: h('09:00', 8) }]]),
        periodos: [periodo('ana', h('07:00', 8), h('13:00', 8)), MANHA_ANA],
      }),
    );
    expect(ids(r)).toEqual(['e1']);
  });

  it('o turno que conta é o da entrega, não o de agora (a Manhã de hoje não segura a de ontem)', () => {
    const r = recolher(
      entrada({
        agora: h('10:00'),
        entregas: new Map([['e1', { medicoId: 'ana', em: h('09:00', 17) }]]),
        periodos: [periodo('ana', h('07:00', 17), h('13:00', 17)), MANHA_ANA],
      }),
    );
    expect(ids(r)).toEqual(['e1']);
  });

  it('trocado à mão depois do robô: fica com quem trocou', () => {
    const r = recolher(entrada({ exames: [exame('e1', { medicoIdMobilemed: 2 })] }));
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.trocado_por_fora).toBe(1);
  });

  it('já aberto pelo médico (não NOVO): fica', () => {
    const r = recolher(entrada({ exames: [exame('e1', { status: 'LAUDANDO' })] }));
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.aberto).toBe(1);
  });

  it('frente que não recolhe ao fim do turno (CARDIO, MAMA): fica', () => {
    const r = recolher(entrada({ recolhe: (e) => e.especialidadeId !== 'neuro' }));
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.frente_nao_recolhe).toBe(1);
  });
});

describe('recolhimento: o pacote paciente × médico sai inteiro ou fica inteiro', () => {
  const pacote = (extra: Partial<ExameComMedico> = {}) => [
    exame('e1', { pacienteChave: 'p' }),
    exame('e2', { pacienteChave: 'p', ...extra }),
  ];

  it('o irmão NOVO do mesmo paciente com o mesmo médico sai junto, mesmo sem designação do robô', () => {
    const r = recolher(entrada({ exames: pacote() }));
    expect(r.recolhidos).toEqual([
      { idExame: 'e1', deMedicoId: 'ana', motivo: 'turno_encerrado' },
      { idExame: 'e2', deMedicoId: 'ana', motivo: 'turno_encerrado' },
    ]);
  });

  it('o mesmo paciente com outro médico é outro pacote: não vai junto', () => {
    const r = recolher(entrada({ exames: pacote({ medicoIdMobilemed: 2 }) }));
    expect(ids(r)).toEqual(['e1']);
  });

  it('nada do pacote sai se algum exame dele está laudando', () => {
    const r = recolher(entrada({ exames: pacote({ status: 'LAUDANDO' }) }));
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.pacote_aberto).toBe(1);
  });

  it('nada do pacote sai se algum exame dele ainda está protegido pela escala', () => {
    const r = recolher(
      entrada({
        exames: pacote(),
        entregas: new Map([
          ['e1', { medicoId: 'ana', em: h('09:00') }],
          ['e2', { medicoId: 'ana', em: h('14:00') }],
        ]),
        periodos: [MANHA_ANA, periodo('ana', h('13:00'), h('19:00'))],
      }),
    );
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.turno_em_curso).toBe(2);
  });

  it('nada do pacote sai se algum exame dele é de frente que não recolhe', () => {
    const r = recolher(
      entrada({
        exames: pacote({ especialidadeId: 'cardio' }),
        recolhe: (e) => e.especialidadeId !== 'cardio',
      }),
    );
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.frente_nao_recolhe).toBe(2);
  });
});

describe('recolhimento: médico com ausência aprovada que cobre hoje', () => {
  it('perde todo exame NOVO, mesmo os que o robô não entregou e mesmo em turno', () => {
    const r = recolher(
      entrada({
        agora: h('10:00'),
        exames: [exame('e1'), exame('e2'), exame('e3', { status: 'LAUDANDO' })],
        ausencias: [{ medicoId: 'ana', frentes: [] }],
      }),
    );
    expect(r.recolhidos).toEqual([
      { idExame: 'e1', deMedicoId: 'ana', motivo: 'ausencia' },
      { idExame: 'e2', deMedicoId: 'ana', motivo: 'ausencia' },
    ]);
  });

  it('ausência de só algumas frentes leva só os exames delas', () => {
    const r = recolher(
      entrada({
        entregas: new Map(),
        exames: [
          exame('e1'),
          exame('e2', { especialidadeId: 'abdome', modalidadeId: 'rx' }),
          exame('e3', { especialidadeId: 'abdome', modalidadeId: 'tc' }),
        ],
        ausencias: [{ medicoId: 'ana', frentes: [NEURO, RX] }],
      }),
    );
    expect(ids(r)).toEqual(['e1', 'e2']);
  });

  it('pacote laudando e frente que não recolhe seguem as regras de sempre', () => {
    const r = recolher(
      entrada({
        entregas: new Map(),
        exames: [
          exame('e1', { pacienteChave: 'p' }),
          exame('e2', { pacienteChave: 'p', status: 'LAUDANDO' }),
          exame('e3', { especialidadeId: 'cardio' }),
        ],
        ausencias: [{ medicoId: 'ana', frentes: [] }],
        recolhe: (e) => e.especialidadeId !== 'cardio',
      }),
    );
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.pacote_aberto).toBe(1);
    expect(r.ficaram.frente_nao_recolhe).toBe(1);
  });

  it('a ausência de outro médico não mexe nos exames deste', () => {
    const r = recolher(
      entrada({ agora: h('10:00'), ausencias: [{ medicoId: 'bia', frentes: [] }] }),
    );
    expect(r.recolhidos).toEqual([]);
  });
});

describe('protegidoPelaEscala (dashboards-one `protegidoPelaEscala`)', () => {
  const proteje = (periodos: PeriodoDoMedico[], entregue: Date, agora: Date) =>
    protegidoPelaEscala(periodos, entregue, agora, PARAMETROS);

  it('Lista: fica com o médico até a carência da Lista depois do fim dela', () => {
    const lista = [periodo('ana', h('07:00', 17), h('07:00'), { lista: true })];
    expect(proteje(lista, h('08:00', 17), h('09:00'))).toBe(true);
    expect(proteje(lista, h('08:00', 17), h('06:59', 19))).toBe(true);
    expect(proteje(lista, h('08:00', 17), h('07:00', 19))).toBe(false);
  });

  it('entregue dentro da antecedência: o turno da entrega é o que vai começar', () => {
    const tarde = [periodo('ana', h('13:00'), h('19:00'))];
    expect(proteje(tarde, h('11:00'), h('15:00'))).toBe(true);
  });

  it('entregue antes da antecedência: vale o próximo turno do mesmo dia', () => {
    const tarde = [periodo('ana', h('13:00'), h('19:00'))];
    expect(proteje(tarde, h('08:00'), h('15:00'))).toBe(true);
    expect(proteje(tarde, h('08:00'), h('20:01'))).toBe(false);
  });

  it('entregue fora de qualquer período: protegido só se estiver em turno agora', () => {
    const manha = [periodo('ana', h('07:00'), h('13:00'))];
    expect(proteje(manha, h('03:00', 17), h('10:00'))).toBe(true);
    expect(proteje(manha, h('03:00', 17), h('15:00'))).toBe(false);
  });

  it('o período com ausência não protege', () => {
    const manha = [periodo('ana', h('07:00'), h('13:00'), { ausente: true })];
    expect(proteje(manha, h('09:00'), h('10:00'))).toBe(false);
  });
});

describe('a leitura da rodada com os recolhidos', () => {
  const PACIENTE = { codigo: 'P1', nome: 'Fulano' };
  const emMaos = (idExame: string, medicoIdMobilemed: number) => ({
    idExame,
    medicoIdMobilemed,
    status: 'NOVO',
    prioridade: 'Rotina',
    estudo: 'TC CRANIO',
    unidade: 'HOSPITAL A',
    modalidade: 'CT',
    especialidade: 'NEURO',
    laudos: 2,
    realizadoEm: h('08:00'),
    entradaEm: h('08:10'),
    prazo: h('20:00'),
    paciente: PACIENTE,
  });
  const semDono = (idExame: string) => {
    const { medicoIdMobilemed: _, ...e } = emMaos(idExame, 0);
    return e;
  };
  const leitura = { semMedico: [semDono('s1')], emMaos: [emMaos('r1', 1), emMaos('m1', 2)] };

  it('o recolhido sai das mãos do médico e entra na fila da rodada, com o que a MobileMed mostra', () => {
    const l = leituraComRecolhidos(leitura, [
      { idExame: 'r1', deMedicoId: 'ana', motivo: 'turno_encerrado' },
    ]);
    expect(l.emMaos.map((e) => e.idExame)).toEqual(['m1']);
    expect(l.semMedico.map((e) => e.idExame)).toEqual(['s1', 'r1']);
    expect(l.semMedico[1]).toEqual(semDono('r1'));
  });

  it('sem recolhidos a leitura é a mesma', () => {
    expect(leituraComRecolhidos(leitura, [])).toEqual(leitura);
  });

  it('o recolhido não volta a quem o tinha: entra como entrega do recolhimento', () => {
    const anterior = { medicoId: 'bia', em: h('07:00', 17), origem: 'conferencia' as const };
    const porExame = entregasComRecolhidos(
      new Map([['r1', [anterior]]]),
      [
        { idExame: 'r1', deMedicoId: 'ana', motivo: 'turno_encerrado' },
        { idExame: 'r2', deMedicoId: 'caio', motivo: 'ausencia' },
      ],
      AGORA,
    );
    expect(porExame.get('r1')).toEqual([
      anterior,
      { medicoId: 'ana', em: AGORA, origem: 'recolhimento' },
    ]);
    expect(porExame.get('r2')).toEqual([{ medicoId: 'caio', em: AGORA, origem: 'recolhimento' }]);
  });
});
