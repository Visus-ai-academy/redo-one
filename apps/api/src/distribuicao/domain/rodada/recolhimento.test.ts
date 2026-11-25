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
const PARAMETROS = {
  carenciaMin: 60,
  carenciaPorTurno: new Map([['lista', 1440]]),
  antecedenciaMin: 180,
  escalaRestringeEspecialidade: true,
};

const NEURO: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'neuro', modalidadeId: null };
const RX: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'rx' };
const TC: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'tc' };

/** Médico → contas na MobileMed (a principal primeiro; a Ana tem também a 11). */
const CONTAS = new Map<string, readonly number[]>([
  ['ana', [1, 11]],
  ['bia', [2]],
  ['caio', [3]],
]);

const periodo = (
  medicoId: string,
  inicio: Date,
  fim: Date,
  extra: Partial<PeriodoDoMedico> = {},
): PeriodoDoMedico => ({
  medicoId,
  inicio,
  fim,
  turnoId: 'manha',
  lista: false,
  ausente: false,
  frente: NEURO,
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  ...extra,
  todosSegmentos:
    extra.todosSegmentos ?? (!extra.subespecialidadeIds?.length && !extra.subespecialidadeGeral),
});

const MANHA_ANA = periodo('ana', h('07:00'), h('13:00'));

const exame = (idExame: string, extra: Partial<ExameComMedico> = {}): ExameComMedico => ({
  idExame,
  medicoIdMobilemed: 1,
  status: 'NOVO',
  pacienteChave: `p-${idExame}`,
  especialidadeId: 'neuro',
  modalidadeId: 'tc',
  subespecialidadeId: null,
  especialidadesDoSegmento: [],
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
    expect(r.recolhidos).toEqual([
      { idExame: 'e1', deMedicoId: 'ana', deMedicoIdMobilemed: 1, motivo: 'turno_encerrado' },
    ]);
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

  it('vale a escala de agora, não o turno da entrega: a Manhã de hoje segura o entregue ontem', () => {
    const r = recolher(
      entrada({
        agora: h('10:00'),
        entregas: new Map([['e1', { medicoId: 'ana', em: h('09:00', 17) }]]),
        periodos: [periodo('ana', h('07:00', 17), h('13:00', 17)), MANHA_ANA],
      }),
    );
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.turno_em_curso).toBe(1);
  });

  it('Lista: recebe na terça para laudar até quarta; na quinta volta, mesmo com a Lista de quinta', () => {
    const listas = [17, 18, 19].map((d) =>
      periodo('ana', h('00:00', d), h('23:59', d), { turnoId: 'lista', lista: true }),
    );
    const r = recolher(
      entrada({
        agora: h('10:00', 19),
        entregas: new Map([['e1', { medicoId: 'ana', em: h('09:00', 17) }]]),
        periodos: listas,
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

describe('recolhimento: fica enquanto algum turno em curso do médico cobre o exame', () => {
  // Entregue às 9h na Manhã NEURO (7h–13h); às 14h30 a Manhã passou da carência.
  const tarde = (extra: Partial<PeriodoDoMedico> = {}) =>
    periodo('ana', h('13:00'), h('19:00'), extra);
  const naTarde = (extra: Partial<PeriodoDoMedico> = {}, exames = [exame('e1')]) =>
    recolher(entrada({ agora: h('14:30'), exames, periodos: [MANHA_ANA, tarde(extra)] }));

  it('na Tarde da mesma frente (NEURO): fica com ela, sem troca entre médicos em turno', () => {
    const r = naTarde();
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.turno_em_curso).toBe(1);
  });

  it('na Tarde de frente de modalidade que cobre o exame (TC): fica', () => {
    expect(naTarde({ frente: TC }).recolhidos).toEqual([]);
  });

  it('na Tarde de outra frente, que não cobre o exame (RX): recolhe', () => {
    expect(ids(naTarde({ frente: RX }))).toEqual(['e1']);
  });

  it('na Tarde NEURO com recorte de segmento que não cobre o exame: recolhe', () => {
    const r = naTarde({ subespecialidadeIds: ['coluna'] }, [
      exame('e1', { subespecialidadeId: 'cranio' }),
    ]);
    expect(ids(r)).toEqual(['e1']);
  });

  it('na Tarde NEURO com o recorte que inclui o segmento do exame: fica', () => {
    const r = naTarde({ subespecialidadeIds: ['cranio'] }, [
      exame('e1', { subespecialidadeId: 'cranio' }),
    ]);
    expect(r.recolhidos).toEqual([]);
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
      { idExame: 'e1', deMedicoId: 'ana', deMedicoIdMobilemed: 1, motivo: 'turno_encerrado' },
      { idExame: 'e2', deMedicoId: 'ana', deMedicoIdMobilemed: 1, motivo: 'turno_encerrado' },
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
        exames: pacote({ especialidadeId: 'abdome', modalidadeId: 'rx' }),
        entregas: new Map([
          ['e1', { medicoId: 'ana', em: h('09:00') }],
          ['e2', { medicoId: 'ana', em: h('14:00') }],
        ]),
        periodos: [MANHA_ANA, periodo('ana', h('13:00'), h('19:00'), { frente: RX })],
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
      { idExame: 'e1', deMedicoId: 'ana', deMedicoIdMobilemed: 1, motivo: 'ausencia' },
      { idExame: 'e2', deMedicoId: 'ana', deMedicoIdMobilemed: 1, motivo: 'ausencia' },
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

describe('recolhimento: médico com outras contas na MobileMed', () => {
  it('o entregue que está noutra conta do mesmo médico não é trocado por fora: sai dela', () => {
    const r = recolher(entrada({ exames: [exame('e1', { medicoIdMobilemed: 11 })] }));
    expect(r.recolhidos).toEqual([
      { idExame: 'e1', deMedicoId: 'ana', deMedicoIdMobilemed: 11, motivo: 'turno_encerrado' },
    ]);
    expect(r.ficaram.trocado_por_fora).toBe(0);
  });

  it('o pacote é do médico: o exame aberto na outra conta prende o da principal', () => {
    const r = recolher(
      entrada({
        exames: [
          exame('e1'),
          exame('e2', { medicoIdMobilemed: 11, status: 'LAUDANDO', pacienteChave: 'p-e1' }),
        ],
      }),
    );
    expect(r.recolhidos).toEqual([]);
    expect(r.ficaram.pacote_aberto).toBe(1);
  });

  it('ausente: perde o NOVO de qualquer conta dele, mesmo o que o robô não deu', () => {
    const r = recolher(
      entrada({
        exames: [exame('e1', { medicoIdMobilemed: 11 })],
        entregas: new Map(),
        ausencias: [{ medicoId: 'ana', frentes: [] }],
      }),
    );
    expect(r.recolhidos).toEqual([
      { idExame: 'e1', deMedicoId: 'ana', deMedicoIdMobilemed: 11, motivo: 'ausencia' },
    ]);
  });
});

describe('protegidoPelaEscala: algum período em curso do médico cobre o exame', () => {
  const proteje = (
    periodos: PeriodoDoMedico[],
    agora: Date,
    p = PARAMETROS,
    entregue = h('09:00', 17),
  ) => protegidoPelaEscala(periodos, exame('e1'), entregue, agora, p);

  it('Lista: fica com o médico até a carência da Lista depois do fim dela', () => {
    const lista = [periodo('ana', h('07:00', 17), h('07:00'), { turnoId: 'lista', lista: true })];
    expect(proteje(lista, h('09:00'))).toBe(true);
    expect(proteje(lista, h('06:59', 19))).toBe(true);
    expect(proteje(lista, h('07:00', 19))).toBe(false);
  });

  it('Lista todo dia: conta a Lista da entrega, e a de hoje não segura o entregue anteontem', () => {
    const listas = [17, 18, 19].map((d) =>
      periodo('ana', h('07:00', d), h('07:00', d + 1), { turnoId: 'lista', lista: true }),
    );
    expect(proteje(listas, h('06:59', 19))).toBe(true);
    expect(proteje(listas, h('08:00', 19))).toBe(false);
  });

  it('Lista não segura o exame entregue fora dela (num turno comum)', () => {
    const turnos = [
      periodo('ana', h('07:00', 17), h('13:00', 17)),
      periodo('ana', h('13:00', 17), h('13:00'), { turnoId: 'lista', lista: true }),
    ];
    expect(proteje(turnos, h('15:00', 17))).toBe(false);
    expect(proteje(turnos, h('15:00', 17), PARAMETROS, h('14:00', 17))).toBe(true);
  });

  it('prazo próprio do turno: a Tarde com 30 min recolhe antes do prazo padrão', () => {
    const tarde = [periodo('ana', h('13:00'), h('19:00'), { turnoId: 'tarde' })];
    const p = { ...PARAMETROS, carenciaPorTurno: new Map([['tarde', 30]]) };
    expect(proteje(tarde, h('19:29'), p, h('14:00'))).toBe(true);
    expect(proteje(tarde, h('19:30'), p, h('14:00'))).toBe(false);
    // Sem prazo próprio, o padrão (60 min).
    expect(proteje(tarde, h('19:59'), PARAMETROS, h('14:00'))).toBe(true);
  });

  it('a Lista sem prazo próprio usa o prazo padrão (a regra da entrega na Lista continua)', () => {
    const lista = [periodo('ana', h('07:00', 17), h('07:00'), { turnoId: 'lista', lista: true })];
    const p = { ...PARAMETROS, carenciaPorTurno: new Map<string, number>() };
    expect(proteje(lista, h('07:59'), p)).toBe(true);
    expect(proteje(lista, h('08:00'), p)).toBe(false);
  });

  it('o prazo vale pelo turno, não pelo tipo: um turno fixo pode ter 24 h', () => {
    const manha = [periodo('ana', h('07:00', 17), h('13:00', 17))];
    const p = { ...PARAMETROS, carenciaPorTurno: new Map([['manha', 1440]]) };
    expect(proteje(manha, h('12:59'), p)).toBe(true);
    expect(proteje(manha, h('13:00'), p)).toBe(false);
  });

  it('o período que vai começar protege dentro da antecedência, não antes', () => {
    const tarde = [periodo('ana', h('13:00'), h('19:00'))];
    expect(proteje(tarde, h('10:00'))).toBe(true);
    expect(proteje(tarde, h('09:59'))).toBe(false);
  });

  it('sem período em curso (com a carência), não protege', () => {
    const manha = [periodo('ana', h('07:00'), h('13:00'))];
    expect(proteje(manha, h('13:59'))).toBe(true);
    expect(proteje(manha, h('14:00'))).toBe(false);
  });

  it('o período com ausência não protege', () => {
    const manha = [periodo('ana', h('07:00'), h('13:00'), { ausente: true })];
    expect(proteje(manha, h('10:00'))).toBe(false);
  });

  it('a frente de especialidade só recorta quando a escala restringe a especialidade', () => {
    const abdome: FrenteEscala = {
      tipo: 'especialidade',
      especialidadeId: 'abdome',
      modalidadeId: null,
    };
    const manha = [periodo('ana', h('07:00'), h('13:00'), { frente: abdome })];
    expect(proteje(manha, h('10:00'))).toBe(false);
    expect(proteje(manha, h('10:00'), { ...PARAMETROS, escalaRestringeEspecialidade: false })).toBe(
      true,
    );
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
      { idExame: 'r1', deMedicoId: 'ana', deMedicoIdMobilemed: 1, motivo: 'turno_encerrado' },
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
        { idExame: 'r1', deMedicoId: 'ana', deMedicoIdMobilemed: 1, motivo: 'turno_encerrado' },
        { idExame: 'r2', deMedicoId: 'caio', deMedicoIdMobilemed: 3, motivo: 'ausencia' },
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
