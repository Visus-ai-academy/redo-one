import { describe, expect, it } from 'vitest';

import type { Arranjo } from '../arranjo';
import { REGRAS_NEUTRAS, type RegrasFrente, RegrasPorFrente } from './configuracao';
import {
  type AlvoExame,
  type ContextoPeriodo,
  casaArranjo,
  direcionadoPara,
  escalaMarcaSegmento,
  type PeriodoEscala,
  porQuePeriodoRecusa,
  reservadoPara,
  segmentoUnico,
} from './elegibilidade';
import { type CelulaRecebimento, GradeRecebimento } from './prioridades-operacao';

// Ids do catálogo (fictícios, com nomes legíveis).
const NEURO = 'esp-neuro';
const MAMA = 'esp-mama';
const MSK = 'esp-msk';
const MI = 'esp-mi';
const RX = 'mod-rx';
const CT = 'mod-ct';
const MR = 'mod-mr';
const COLUNAS = 'seg-colunas';
const AVC = 'seg-avc';
const TUMOR = 'seg-tumor';
// Prioridades da operação.
const OP_URGENCIA = 'op-urgencia';
const OP_AMBULATORIO = 'op-ambulatorio';
const OP_ROTINA = 'op-rotina';
const OP_PLANTAO = 'op-plantao';
const OP_INTERNADO = 'op-internado';
// Turnos da escala.
const MANHA = 'turno-manha';
const LISTA = 'turno-lista';
const CARDIO = 'esp-cardio';

const arranjo = (p: Partial<Arranjo> = {}): Arranjo => ({
  especialidadeId: null,
  modalidadeId: null,
  especialidadeIds: [],
  modalidadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  prioridadeIds: [],
  modoClientes: 'todos',
  clienteIds: [],
  modoExames: 'todos',
  exameIds: [],
  clientesExclusivosIds: [],
  ...p,
});

const alvo = (p: Partial<AlvoExame> = {}): AlvoExame => ({
  especialidadeId: NEURO,
  especialidadesDoSegmento: [],
  modalidadeId: RX,
  subespecialidadeId: null,
  prioridadeOperacaoId: OP_ROTINA,
  urgente: false,
  exameId: null,
  clienteId: null,
  restanteMin: 3000,
  ...p,
});

describe('casaArranjo', () => {
  it('arranjo sem especialidade vale para todas ("lauda todo RX" numa linha só)', () => {
    const todoRx = arranjo({ modalidadeIds: [RX] });
    expect(casaArranjo(todoRx, alvo({ especialidadeId: NEURO }))).toBe(true);
    expect(casaArranjo(todoRx, alvo({ especialidadeId: MSK }))).toBe(true);
    expect(casaArranjo(todoRx, alvo({ modalidadeId: CT }))).toBe(false);
  });

  it('frente de modalidade com especialidades: "RX de MI e MSK" numa linha só', () => {
    const rxMiMsk = arranjo({ modalidadeId: RX, especialidadeIds: [MI, MSK] });
    expect(casaArranjo(rxMiMsk, alvo({ especialidadeId: MI }))).toBe(true);
    expect(casaArranjo(rxMiMsk, alvo({ especialidadeId: MSK }))).toBe(true);
    expect(casaArranjo(rxMiMsk, alvo({ especialidadeId: NEURO }))).toBe(false);
    expect(casaArranjo(rxMiMsk, alvo({ especialidadeId: MI, modalidadeId: CT }))).toBe(false);
    expect(casaArranjo(rxMiMsk, alvo({ especialidadeId: MI, modalidadeId: null }))).toBe(false);
    // O segmento alcança a especialidade (COLUNAS é de NEURO e de MSK).
    expect(
      casaArranjo(
        rxMiMsk,
        alvo({ especialidadeId: NEURO, especialidadesDoSegmento: [NEURO, MSK] }),
      ),
    ).toBe(true);
  });

  it('frente de modalidade sem especialidades: toda a modalidade', () => {
    const todoRx = arranjo({ modalidadeId: RX });
    expect(casaArranjo(todoRx, alvo({ especialidadeId: CARDIO }))).toBe(true);
    expect(casaArranjo(todoRx, alvo({ especialidadeId: null }))).toBe(true);
    expect(casaArranjo(todoRx, alvo({ modalidadeId: CT }))).toBe(false);
  });

  it('modalidade desconhecida não passa por lista restrita', () => {
    expect(casaArranjo(arranjo({ modalidadeIds: [RX] }), alvo({ modalidadeId: null }))).toBe(false);
  });

  it('arranjo com especialidade exige a mesma', () => {
    const soNeuro = arranjo({ especialidadeId: NEURO });
    expect(casaArranjo(soNeuro, alvo())).toBe(true);
    expect(casaArranjo(soNeuro, alvo({ especialidadeId: MSK }))).toBe(false);
  });

  it('eixo vazio é "todos"', () => {
    expect(casaArranjo(arranjo(), alvo({ especialidadeId: 'qualquer', modalidadeId: MR }))).toBe(
      true,
    );
  });

  it('prioridade: só as marcadas', () => {
    const soUrgencia = arranjo({ prioridadeIds: [OP_URGENCIA] });
    expect(casaArranjo(soUrgencia, alvo({ prioridadeOperacaoId: OP_URGENCIA }))).toBe(true);
    expect(casaArranjo(soUrgencia, alvo({ prioridadeOperacaoId: OP_ROTINA }))).toBe(false);
  });

  it('prioridade é a da operação: o arranjo "só Rotina" (26 no legado) não recebe Internado', () => {
    const soRotina = arranjo({ prioridadeIds: [OP_ROTINA] });
    expect(casaArranjo(soRotina, alvo())).toBe(true);
    expect(casaArranjo(soRotina, alvo({ prioridadeOperacaoId: OP_INTERNADO }))).toBe(false);
    const inteira = arranjo({
      prioridadeIds: [OP_ROTINA, OP_URGENCIA, OP_AMBULATORIO, OP_INTERNADO],
    });
    expect(casaArranjo(inteira, alvo({ prioridadeOperacaoId: OP_INTERNADO }))).toBe(true);
    // Grafia sem de-para: só o arranjo sem recorte de prioridade.
    expect(casaArranjo(inteira, alvo({ prioridadeOperacaoId: null }))).toBe(false);
    expect(casaArranjo(arranjo(), alvo({ prioridadeOperacaoId: null }))).toBe(true);
  });

  it('exames e clientes pelos modos apenas/exceto', () => {
    const soExame = arranjo({ modoExames: 'apenas', exameIds: ['ex1'] });
    expect(casaArranjo(soExame, alvo({ exameId: 'ex1' }))).toBe(true);
    expect(casaArranjo(soExame, alvo({ exameId: 'ex2' }))).toBe(false);
    const exceto = arranjo({ modoClientes: 'exceto', clienteIds: ['cli1'] });
    expect(casaArranjo(exceto, alvo({ clienteId: 'cli1' }))).toBe(false);
    expect(casaArranjo(exceto, alvo({ clienteId: 'cli2' }))).toBe(true);
  });

  it('segmento é recorte duro: exame sem segmento não vai para quem restringiu', () => {
    const soAvc = arranjo({ subespecialidadeIds: [AVC] });
    expect(casaArranjo(soAvc, alvo({ subespecialidadeId: AVC }))).toBe(true);
    expect(casaArranjo(soAvc, alvo({ subespecialidadeId: TUMOR }))).toBe(false);
    expect(casaArranjo(soAvc, alvo({ subespecialidadeId: null }))).toBe(false);
    expect(casaArranjo(arranjo(), alvo({ subespecialidadeId: null }))).toBe(true);
    expect(
      casaArranjo(
        arranjo({ subespecialidadeIds: [AVC, TUMOR] }),
        alvo({ subespecialidadeId: TUMOR }),
      ),
    ).toBe(true);
  });

  it('o geral marcado libera o exame sem segmento', () => {
    const avcMaisGeral = arranjo({ subespecialidadeIds: [AVC], subespecialidadeGeral: true });
    expect(casaArranjo(avcMaisGeral, alvo({ subespecialidadeId: null }))).toBe(true);
    expect(casaArranjo(avcMaisGeral, alvo({ subespecialidadeId: AVC }))).toBe(true);
    expect(casaArranjo(avcMaisGeral, alvo({ subespecialidadeId: TUMOR }))).toBe(false);
    const soGeral = arranjo({ subespecialidadeGeral: true });
    expect(casaArranjo(soGeral, alvo({ subespecialidadeId: null }))).toBe(true);
    expect(casaArranjo(soGeral, alvo({ subespecialidadeId: AVC }))).toBe(false);
  });

  it('segmento de várias especialidades: a coluna de MSK vai para quem faz NEURO', () => {
    const colunaMsk = alvo({
      especialidadeId: MSK,
      subespecialidadeId: COLUNAS,
      especialidadesDoSegmento: [NEURO, MSK],
    });
    expect(
      casaArranjo(arranjo({ especialidadeId: NEURO, subespecialidadeIds: [COLUNAS] }), colunaMsk),
    ).toBe(true);
    expect(casaArranjo(arranjo({ especialidadeId: NEURO }), colunaMsk)).toBe(true);
    expect(
      casaArranjo(arranjo({ especialidadeId: NEURO, subespecialidadeIds: [AVC] }), colunaMsk),
    ).toBe(false);
    // Dr. Marcelo: MSK só geral não recebe coluna.
    expect(
      casaArranjo(arranjo({ especialidadeId: MSK, subespecialidadeGeral: true }), colunaMsk),
    ).toBe(false);
    // Sem o segmento, nada atravessa.
    expect(casaArranjo(arranjo({ especialidadeId: NEURO }), alvo({ especialidadeId: MSK }))).toBe(
      false,
    );
  });

  it('a prioridade liberada (ajuste do dia) fura só o eixo da prioridade', () => {
    const soRotina = arranjo({ prioridadeIds: [OP_ROTINA] });
    const urg = alvo({ prioridadeOperacaoId: OP_URGENCIA });
    expect(casaArranjo(soRotina, urg)).toBe(false);
    expect(casaArranjo(soRotina, urg, { prioridadesLiberadas: new Set([OP_URGENCIA]) })).toBe(true);
  });

  it('a escala que marca o segmento fura só o eixo do segmento (Dr. André, 28/10)', () => {
    const mskSoGeral = arranjo({
      especialidadeId: MSK,
      modalidadeIds: [MR],
      subespecialidadeGeral: true,
    });
    const coluna = alvo({
      especialidadeId: MSK,
      modalidadeId: MR,
      subespecialidadeId: COLUNAS,
      especialidadesDoSegmento: [NEURO, MSK],
    });
    expect(casaArranjo(mskSoGeral, coluna)).toBe(false);
    expect(casaArranjo(mskSoGeral, coluna, { segmentoDaEscala: true })).toBe(true);
    expect(
      casaArranjo(mskSoGeral, { ...coluna, modalidadeId: CT }, { segmentoDaEscala: true }),
    ).toBe(false);
    expect(
      casaArranjo(
        { ...mskSoGeral, modoClientes: 'exceto', clienteIds: ['cli1'] },
        { ...coluna, clienteId: 'cli1' },
        { segmentoDaEscala: true },
      ),
    ).toBe(false);
  });
});

describe('cliente com unidades (casa pela unidade)', () => {
  // CEDI_RO é unidade do principal CEDIDIAG: o exame chega com as duas.
  const PRINCIPAL = 'cli-cedidiag';
  const UNIDADE = 'cli-cedi-ro';
  const OUTRA = 'cli-cedi-rj';
  const daUnidade = alvo({ clienteId: PRINCIPAL, unidadeId: UNIDADE });

  it('"exceto" a unidade barra só ela; "exceto" o principal barra todas as unidades', () => {
    expect(casaArranjo(arranjo({ modoClientes: 'exceto', clienteIds: [UNIDADE] }), daUnidade)).toBe(
      false,
    );
    expect(casaArranjo(arranjo({ modoClientes: 'exceto', clienteIds: [OUTRA] }), daUnidade)).toBe(
      true,
    );
    expect(
      casaArranjo(arranjo({ modoClientes: 'exceto', clienteIds: [PRINCIPAL] }), daUnidade),
    ).toBe(false);
  });

  it('"apenas" a unidade aceita só ela; "apenas" o principal aceita todas as unidades', () => {
    expect(casaArranjo(arranjo({ modoClientes: 'apenas', clienteIds: [UNIDADE] }), daUnidade)).toBe(
      true,
    );
    expect(casaArranjo(arranjo({ modoClientes: 'apenas', clienteIds: [OUTRA] }), daUnidade)).toBe(
      false,
    );
    expect(
      casaArranjo(arranjo({ modoClientes: 'apenas', clienteIds: [PRINCIPAL] }), daUnidade),
    ).toBe(true);
  });

  it('a clínica exclusiva vale pela unidade e pelo principal', () => {
    const reserva = (cliente: string) => [
      { medicoId: 'm', arranjo: arranjo({ clientesExclusivosIds: [cliente] }) },
    ];
    expect([...reservadoPara(reserva(UNIDADE), daUnidade)]).toEqual(['m']);
    expect([...reservadoPara(reserva(PRINCIPAL), daUnidade)]).toEqual(['m']);
    expect([...reservadoPara(reserva(OUTRA), daUnidade)]).toEqual([]);
  });
});

describe('reservadoPara (clínica exclusiva)', () => {
  const regra = arranjo({
    especialidadeId: MSK,
    modoClientes: 'apenas',
    clienteIds: ['CLINIMAGEM'],
    clientesExclusivosIds: ['CLINIMAGEM'],
  });
  const exame = alvo({
    especialidadeId: MSK,
    modalidadeId: MR,
    exameId: 'joelho',
    clienteId: 'CLINIMAGEM',
  });

  it('o recorte da frente, naquela clínica, é dos que a marcaram', () => {
    const reservas = [{ medicoId: 'BRUNO', arranjo: regra }];
    expect([...reservadoPara(reservas, exame)]).toEqual(['BRUNO']);
    expect(reservadoPara(reservas, { ...exame, clienteId: 'OUTRA' }).size).toBe(0);
    expect(reservadoPara(reservas, { ...exame, especialidadeId: NEURO }).size).toBe(0);
    expect(reservadoPara(reservas, { ...exame, clienteId: null }).size).toBe(0);
  });

  it('dois exclusivos no mesmo recorte dividem; o recorte de cada um vale', () => {
    const dois = [
      { medicoId: 'BRUNO', arranjo: regra },
      { medicoId: 'TIAGO', arranjo: { ...regra, modalidadeIds: [MR] } },
    ];
    expect([...reservadoPara(dois, exame)].sort()).toEqual(['BRUNO', 'TIAGO']);
    expect([...reservadoPara(dois, { ...exame, modalidadeId: CT })]).toEqual(['BRUNO']);
  });

  it('a reserva vale só nas clínicas exclusivas, não em todas as do arranjo', () => {
    const doisClientes = { ...regra, clienteIds: ['CLINIMAGEM', 'OUTRA'] };
    const reservas = [{ medicoId: 'BRUNO', arranjo: doisClientes }];
    expect(reservadoPara(reservas, { ...exame, clienteId: 'OUTRA' }).size).toBe(0);
  });
});

describe('direcionadoPara (arranjo de equipe)', () => {
  const regraEq2 = arranjo({
    especialidadeId: NEURO,
    modalidadeIds: [CT],
    prioridadeIds: [OP_URGENCIA],
    modoClientes: 'apenas',
    clienteIds: ['cedivar'],
  });
  const eq2 = { membros: ['larissa', 'rubens'], arranjos: [regraEq2], plantao: false };
  const equipe2 = [eq2];
  const cedivar = alvo({
    modalidadeId: CT,
    prioridadeOperacaoId: OP_URGENCIA,
    clienteId: 'cedivar',
  });

  it('o recorte da equipe é só dos membros', () => {
    expect(direcionadoPara(equipe2, cedivar)).toEqual({
      medicos: new Set(['larissa', 'rubens']),
      plantao: false,
    });
    expect(direcionadoPara(equipe2, { ...cedivar, prioridadeOperacaoId: OP_ROTINA })).toBeNull();
    expect(direcionadoPara(equipe2, { ...cedivar, clienteId: 'outra' })).toBeNull();
    expect(direcionadoPara(equipe2, { ...cedivar, clienteId: null })).toBeNull();
  });

  it('duas equipes no mesmo recorte somam membros', () => {
    const duas = [...equipe2, { membros: ['kenia'], arranjos: [regraEq2], plantao: false }];
    expect(direcionadoPara(duas, cedivar)?.medicos).toEqual(
      new Set(['larissa', 'rubens', 'kenia']),
    );
  });

  it('equipe de plantão: ninguém recebe pelo robô, mesmo com outra equipe no recorte', () => {
    const plantao = [{ ...eq2, plantao: true }];
    expect(direcionadoPara(plantao, cedivar)).toEqual({ medicos: new Set(), plantao: true });
    const comOutra = [...plantao, { membros: ['kenia'], arranjos: [regraEq2], plantao: false }];
    expect(direcionadoPara(comOutra, cedivar)?.medicos).toEqual(new Set());
    expect(direcionadoPara(plantao, { ...cedivar, prioridadeOperacaoId: OP_ROTINA })).toBeNull();
  });
});

describe('porQuePeriodoRecusa', () => {
  // A grade geral dos valores iniciais: a Lista com prazo mínimo de 24 h para AMBULATÓRIO e
  // ROTINA, e sem URGÊNCIA e PLANTÃO; os outros turnos seguem o SLA (sem célula).
  const GERAL: CelulaRecebimento[] = [
    {
      prioridadeOperacaoId: OP_AMBULATORIO,
      turnoId: LISTA,
      regra: { tipo: 'prazo_minimo', horas: 24 },
    },
    { prioridadeOperacaoId: OP_ROTINA, turnoId: LISTA, regra: { tipo: 'prazo_minimo', horas: 24 } },
    { prioridadeOperacaoId: OP_URGENCIA, turnoId: LISTA, regra: { tipo: 'nao_recebe' } },
    { prioridadeOperacaoId: OP_PLANTAO, turnoId: LISTA, regra: { tipo: 'nao_recebe' } },
  ];
  // MAMA e CARDIO: a Lista segue o SLA nas rotinas; CARDIO de manhã só com mais de 48 h.
  const regrasMama: RegrasFrente = {
    ...REGRAS_NEUTRAS,
    frente: { tipo: 'especialidade', especialidadeId: MAMA, modalidadeId: null },
    recebimento: [OP_AMBULATORIO, OP_ROTINA].map((prioridadeOperacaoId) => ({
      prioridadeOperacaoId,
      turnoId: LISTA,
      regra: { tipo: 'segue_sla' as const },
    })),
  };
  const regrasCardio: RegrasFrente = {
    ...REGRAS_NEUTRAS,
    frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null },
    recebimento: [
      ...regrasMama.recebimento,
      {
        prioridadeOperacaoId: OP_ROTINA,
        turnoId: MANHA,
        regra: { tipo: 'prazo_minimo', horas: 48 },
      },
    ],
  };
  const regras = new RegrasPorFrente([regrasMama, regrasCardio]);
  const ctx = (p: Partial<ContextoPeriodo> = {}): ContextoPeriodo => ({
    escalaRestringeEspecialidade: true,
    grade: new GradeRecebimento(GERAL, regras),
    prioridadeIdsQueFuramGrade: [OP_URGENCIA],
    ...p,
  });
  const periodo = (p: Partial<PeriodoEscala> = {}): PeriodoEscala => ({
    alocacaoId: 'a',
    turnoId: MANHA,
    lista: false,
    gratificado: false,
    frente: { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
    prioridadeIds: [],
    subespecialidadeIds: [],
    subespecialidadeGeral: false,
    coberturaDeId: null,
    ...p,
  });
  const exame = (p: Partial<AlvoExame> = {}) =>
    alvo({ especialidadeId: MI, modalidadeId: CT, restanteMin: 3000, ...p });
  const urgencia = (p: Partial<AlvoExame> = {}) =>
    exame({ prioridadeOperacaoId: OP_URGENCIA, urgente: true, ...p });
  const aceita = (ps: PeriodoEscala[], a = exame(), c = ctx()) =>
    ps.some((p) => porQuePeriodoRecusa(p, a, c) === null);
  const lista = periodo({ turnoId: LISTA, lista: true });

  it('frente de especialidade: o exame de outra especialidade não passa', () => {
    expect(aceita([periodo()], exame({ especialidadeId: NEURO }))).toBe(false);
    expect(
      aceita(
        [periodo()],
        exame({ especialidadeId: NEURO }),
        ctx({ escalaRestringeEspecialidade: false }),
      ),
    ).toBe(true);
  });

  it('o segmento de várias especialidades entra pela frente de uma delas', () => {
    const colunaMsk = exame({
      especialidadeId: MSK,
      subespecialidadeId: COLUNAS,
      especialidadesDoSegmento: [NEURO, MSK],
    });
    const neuro = periodo({
      frente: { tipo: 'especialidade', especialidadeId: NEURO, modalidadeId: null },
    });
    expect(aceita([neuro], colunaMsk)).toBe(true);
    expect(aceita([periodo()], colunaMsk)).toBe(false);
  });

  it('recortes não se somam: o recorte de um período não vale no outro', () => {
    const manhaUrgencia = periodo({ prioridadeIds: [OP_URGENCIA] });
    expect(aceita([manhaUrgencia], exame())).toBe(false);
    expect(aceita([manhaUrgencia, lista], exame())).toBe(true);
  });

  it('célula sem valor segue o SLA: a Manhã recebe a rotina vencendo e a urgência', () => {
    expect(aceita([periodo()], exame({ restanteMin: -30 }))).toBe(true);
    expect(aceita([periodo()], exame({ restanteMin: null }))).toBe(true);
    expect(aceita([periodo()], urgencia({ restanteMin: 30 }))).toBe(true);
  });

  it('prazo mínimo: só acima do mínimo; prazo ilegível não entra', () => {
    expect(aceita([lista], exame({ restanteMin: 25 * 60 }))).toBe(true);
    expect(aceita([lista], exame({ restanteMin: 24 * 60 }))).toBe(false);
    expect(aceita([lista], exame({ restanteMin: 60 }))).toBe(false);
    expect(aceita([lista], exame({ restanteMin: null }))).toBe(false);
  });

  it('não recebe: nem com prazo longo', () => {
    expect(aceita([lista], urgencia({ restanteMin: 50 * 60 }))).toBe(false);
    expect(aceita([lista], exame({ prioridadeOperacaoId: OP_PLANTAO }))).toBe(false);
    expect(porQuePeriodoRecusa(lista, urgencia(), ctx())).toMatch(/não recebe/);
  });

  it('CARDIO ROTINA × Manhã = 48 h: o exame de 30 h não vai ao médico da Manhã de CARDIO, o de 50 h vai', () => {
    const manhaCardio = periodo({
      frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null },
    });
    const doCardio = (horas: number) => exame({ especialidadeId: CARDIO, restanteMin: horas * 60 });
    expect(aceita([manhaCardio], doCardio(30))).toBe(false);
    expect(aceita([manhaCardio], doCardio(50))).toBe(true);
    // Só a frente sobrescrita muda: a Manhã de MI segue o SLA.
    expect(aceita([periodo()], exame({ restanteMin: 30 * 60 }))).toBe(true);
  });

  it('frente que sobrescreve a Lista com "segue o SLA" (MAMA) recebe a rotina abaixo de 24 h', () => {
    const mama = periodo({
      turnoId: LISTA,
      lista: true,
      frente: { tipo: 'especialidade', especialidadeId: MAMA, modalidadeId: null },
    });
    const daMama = (p: Partial<AlvoExame>) => exame({ especialidadeId: MAMA, ...p });
    expect(aceita([mama], daMama({ restanteMin: 60 }))).toBe(true);
    expect(aceita([mama], daMama({ restanteMin: -10 }))).toBe(true);
    // Só as células sobrescritas mudam: o PLANTÃO segue sem entrar na Lista.
    expect(aceita([mama], daMama({ prioridadeOperacaoId: OP_PLANTAO }))).toBe(false);
  });

  it('a célula é a da frente do período, não a do exame', () => {
    const listaMama = periodo({
      turnoId: LISTA,
      lista: true,
      frente: { tipo: 'especialidade', especialidadeId: MAMA, modalidadeId: null },
    });
    // Com a escala sem restringir especialidade, o exame de MI na Lista de MAMA vale pela MAMA.
    const semRestricao = ctx({ escalaRestringeEspecialidade: false });
    expect(aceita([listaMama], exame({ restanteMin: 60 }), semRestricao)).toBe(true);
    expect(aceita([lista], exame({ especialidadeId: MAMA, restanteMin: 60 }), semRestricao)).toBe(
      false,
    );
  });

  it('gratificado segue o SLA puro (fora da grade), mas o recorte da escala continua', () => {
    const grat = periodo({ turnoId: LISTA, lista: false, gratificado: true });
    expect(aceita([grat], urgencia({ restanteMin: -30 }))).toBe(true);
    expect(aceita([grat], exame({ restanteMin: null }))).toBe(true);
    expect(
      aceita(
        [periodo({ turnoId: LISTA, gratificado: true, prioridadeIds: [OP_ROTINA] })],
        urgencia(),
      ),
    ).toBe(false);
  });

  it('frente de modalidade restringe sempre, qualquer especialidade', () => {
    const rx = periodo({ frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: RX } });
    expect(aceita([rx], exame({ especialidadeId: NEURO, modalidadeId: RX }))).toBe(true);
    expect(aceita([rx], exame(), ctx({ escalaRestringeEspecialidade: false }))).toBe(false);
  });

  it('segmento: recorte duro, o geral marcado libera o exame sem segmento', () => {
    expect(aceita([periodo({ subespecialidadeIds: [AVC] })], exame())).toBe(false);
    expect(
      aceita([periodo({ subespecialidadeIds: [AVC] })], exame({ subespecialidadeId: AVC })),
    ).toBe(true);
    expect(
      aceita([periodo({ subespecialidadeIds: [AVC], subespecialidadeGeral: true })], exame()),
    ).toBe(true);
    expect(
      aceita([periodo({ subespecialidadeGeral: true })], exame({ subespecialidadeId: AVC })),
    ).toBe(false);
  });

  it('prioridade liberada fura a célula e o recorte de prioridade, só para ela', () => {
    const urg = urgencia({ restanteMin: 60 });
    const lib = { prioridadesLiberadas: new Set([OP_URGENCIA]) };
    expect(porQuePeriodoRecusa(lista, urg, ctx())).not.toBeNull();
    expect(porQuePeriodoRecusa(lista, urg, ctx(lib))).toBeNull();
    expect(
      porQuePeriodoRecusa(lista, exame({ prioridadeOperacaoId: OP_PLANTAO }), ctx(lib)),
    ).not.toBeNull();
    expect(
      porQuePeriodoRecusa(
        periodo({ turnoId: LISTA, lista: true, prioridadeIds: [OP_ROTINA] }),
        urg,
        ctx(lib),
      ),
    ).toBeNull();
  });

  it('Dra. Daniela (05/11): na Lista, a rotina com prazo curto não entra', () => {
    expect(porQuePeriodoRecusa(lista, exame({ restanteMin: 60 }), ctx())).toMatch(/mínimo de 24h/);
  });

  it('alocação com URGÊNCIA marcada recebe a urgência pelo SLA (HPRIMAVERA, RX)', () => {
    const listaRx = periodo({
      turnoId: LISTA,
      lista: true,
      frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: RX },
      prioridadeIds: [OP_ROTINA, OP_URGENCIA, OP_AMBULATORIO],
    });
    const urgRx = urgencia({ modalidadeId: RX, restanteMin: 60 });
    expect(porQuePeriodoRecusa(listaRx, urgRx, ctx())).toBeNull();
    expect(porQuePeriodoRecusa(listaRx, { ...urgRx, restanteMin: -30 }, ctx())).toBeNull();
    // Sem a URGÊNCIA marcada na alocação (ou sem recorte), vale a célula.
    expect(
      porQuePeriodoRecusa({ ...listaRx, prioridadeIds: [OP_ROTINA] }, urgRx, ctx()),
    ).not.toBeNull();
    expect(porQuePeriodoRecusa({ ...listaRx, prioridadeIds: [] }, urgRx, ctx())).not.toBeNull();
    // Só o que é urgência: a rotina curta continua barrada.
    expect(
      porQuePeriodoRecusa(listaRx, exame({ modalidadeId: RX, restanteMin: 60 }), ctx()),
    ).not.toBeNull();
  });

  it('só a prioridade do próprio exame fura (19/11): o AMBULATÓRIO perto do prazo segue a célula, a menos que tenha a marca', () => {
    const listaRx = periodo({
      turnoId: LISTA,
      lista: true,
      frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: RX },
      prioridadeIds: [OP_ROTINA, OP_URGENCIA, OP_AMBULATORIO],
    });
    const ambulatorioUrgente = exame({
      modalidadeId: RX,
      prioridadeOperacaoId: OP_AMBULATORIO,
      urgente: true,
      restanteMin: 600,
    });
    expect(porQuePeriodoRecusa(listaRx, ambulatorioUrgente, ctx())).toMatch(/mínimo de 24h/);
    const furaNoAmbulatorio = ctx({ prioridadeIdsQueFuramGrade: [OP_URGENCIA, OP_AMBULATORIO] });
    expect(porQuePeriodoRecusa(listaRx, ambulatorioUrgente, furaNoAmbulatorio)).toBeNull();
    // A marca vale só para o urgente: o Ambulatório longe do prazo segue a célula.
    expect(
      porQuePeriodoRecusa(
        listaRx,
        { ...ambulatorioUrgente, urgente: false, restanteMin: 20 * 60 },
        furaNoAmbulatorio,
      ),
    ).not.toBeNull();
    // A prioridade do exame precisa estar marcada na alocação.
    expect(
      porQuePeriodoRecusa(
        { ...listaRx, prioridadeIds: [OP_URGENCIA] },
        ambulatorioUrgente,
        furaNoAmbulatorio,
      ),
    ).not.toBeNull();
  });

  it('a marca vale em qualquer turno: a ROTINA urgente na frente de CARDIO segue a célula da Manhã sem ela', () => {
    const manhaCardio = periodo({
      frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null },
      prioridadeIds: [OP_ROTINA, OP_URGENCIA],
    });
    // Uma ROTINA tratada como urgência na frente (sobrescrita) com 30 h, na Manhã de CARDIO (48 h).
    const rotinaUrgente = exame({ especialidadeId: CARDIO, urgente: true, restanteMin: 30 * 60 });
    expect(porQuePeriodoRecusa(manhaCardio, rotinaUrgente, ctx())).toMatch(/mínimo de 48h/);
    expect(
      porQuePeriodoRecusa(
        manhaCardio,
        rotinaUrgente,
        ctx({ prioridadeIdsQueFuramGrade: [OP_URGENCIA, OP_ROTINA] }),
      ),
    ).toBeNull();
    const listaMi = periodo({
      turnoId: LISTA,
      lista: true,
      prioridadeIds: [OP_URGENCIA, OP_PLANTAO],
    });
    expect(
      porQuePeriodoRecusa(listaMi, exame({ prioridadeOperacaoId: OP_PLANTAO }), ctx()),
    ).not.toBeNull();
    expect(
      porQuePeriodoRecusa(listaMi, urgencia(), ctx({ prioridadeIdsQueFuramGrade: [] })),
    ).toMatch(/não recebe/);
  });

  describe('Internado na Lista (19/11/2026: "se não tiver configurado que o Internado segue o SLA, não deve")', () => {
    // A Lista como no legado: marca as quatro; só a URGÊNCIA fura a grade pela alocação.
    const listaInteira = periodo({
      turnoId: LISTA,
      lista: true,
      prioridadeIds: [OP_ROTINA, OP_URGENCIA, OP_AMBULATORIO, OP_INTERNADO],
    });
    const internadoUrgente = exame({
      prioridadeOperacaoId: OP_INTERNADO,
      urgente: true,
      restanteMin: 10 * 60,
    });
    const comCelulaInternado = (regra: CelulaRecebimento['regra']) =>
      ctx({
        grade: new GradeRecebimento(
          [...GERAL, { prioridadeOperacaoId: OP_INTERNADO, turnoId: LISTA, regra }],
          regras,
        ),
      });

    it('célula "prazo mínimo 24 h": o Internado com prazo abaixo de 24 h fica de fora, mesmo com a URGÊNCIA marcada', () => {
      const c = comCelulaInternado({ tipo: 'prazo_minimo', horas: 24 });
      expect(porQuePeriodoRecusa(listaInteira, internadoUrgente, c)).toBe(
        'Recebimento: o prazo (10h) não passa do mínimo de 24h deste turno. A urgência marcada na alocação só fura a grade nas prioridades com essa opção ligada.',
      );
      expect(
        porQuePeriodoRecusa(listaInteira, { ...internadoUrgente, restanteMin: 30 * 60 }, c),
      ).toBeNull();
      expect(
        porQuePeriodoRecusa(
          { ...listaInteira, prioridadeIds: [OP_INTERNADO] },
          internadoUrgente,
          c,
        ),
      ).not.toBeNull();
    });

    it('célula "segue o SLA": o Internado entra com qualquer prazo', () => {
      const c = comCelulaInternado({ tipo: 'segue_sla' });
      expect(porQuePeriodoRecusa(listaInteira, internadoUrgente, c)).toBeNull();
      expect(
        porQuePeriodoRecusa(listaInteira, { ...internadoUrgente, restanteMin: -30 }, c),
      ).toBeNull();
    });

    it('a URGÊNCIA marcada continua furando o "não recebe" da Lista; ligada no Internado, ele fura também', () => {
      const c = comCelulaInternado({ tipo: 'prazo_minimo', horas: 24 });
      expect(porQuePeriodoRecusa(listaInteira, urgencia({ restanteMin: 60 }), c)).toBeNull();
      expect(
        porQuePeriodoRecusa(listaInteira, internadoUrgente, {
          ...c,
          prioridadeIdsQueFuramGrade: [OP_URGENCIA, OP_INTERNADO],
        }),
      ).toBeNull();
    });
  });

  describe('recorte de prioridade pela prioridade da operação (19/11/2026, como a grafia do legado)', () => {
    const internado = exame({ prioridadeOperacaoId: OP_INTERNADO });
    const ambulatorio = exame({ prioridadeOperacaoId: OP_AMBULATORIO });
    const plantao = exame({ prioridadeOperacaoId: OP_PLANTAO });

    it('"só ROTINA" (20 alocações no legado) recusa Internado e Ambulatório, com motivo legível', () => {
      const soRotina = periodo({ prioridadeIds: [OP_ROTINA] });
      expect(porQuePeriodoRecusa(soRotina, exame(), ctx())).toBeNull();
      expect(porQuePeriodoRecusa(soRotina, internado, ctx())).toBe(
        'O período não aceita a prioridade do exame (não está marcada na alocação).',
      );
      expect(porQuePeriodoRecusa(soRotina, ambulatorio, ctx())).not.toBeNull();
    });

    it('a lista inteira do legado (Rotina, Urgência, Ambulatório, Internado) recebe todas menos Plantão', () => {
      const inteira = periodo({
        prioridadeIds: [OP_ROTINA, OP_URGENCIA, OP_AMBULATORIO, OP_INTERNADO],
      });
      for (const e of [exame(), urgencia(), internado, ambulatorio]) {
        expect(porQuePeriodoRecusa(inteira, e, ctx())).toBeNull();
      }
      expect(porQuePeriodoRecusa(inteira, plantao, ctx())).not.toBeNull();
    });

    it('o plantonista PLANTÃO + URGÊNCIA recebe as duas e recusa Rotina e Internado', () => {
      const plantonista = periodo({ prioridadeIds: [OP_PLANTAO, OP_URGENCIA] });
      expect(porQuePeriodoRecusa(plantonista, plantao, ctx())).toBeNull();
      expect(porQuePeriodoRecusa(plantonista, urgencia(), ctx())).toBeNull();
      expect(porQuePeriodoRecusa(plantonista, exame(), ctx())).not.toBeNull();
      // Internado é urgência na operação, mas não está marcado: a urgência não abre o recorte.
      expect(
        porQuePeriodoRecusa(plantonista, { ...internado, urgente: true }, ctx()),
      ).not.toBeNull();
    });

    it('grafia sem de-para (sem prioridade da operação) só entra no período sem recorte', () => {
      const semDePara = exame({ prioridadeOperacaoId: null });
      expect(porQuePeriodoRecusa(periodo(), semDePara, ctx())).toBeNull();
      expect(porQuePeriodoRecusa(periodo({ prioridadeIds: [OP_ROTINA] }), semDePara, ctx())).toBe(
        'O período recorta prioridades e a do exame não tem de-para na operação.',
      );
    });

    it('o ajuste do dia libera a prioridade da operação, não a do catálogo', () => {
      const soRotina = periodo({ prioridadeIds: [OP_ROTINA] });
      const lib = { prioridadesLiberadas: new Set([OP_INTERNADO]) };
      expect(porQuePeriodoRecusa(soRotina, internado, ctx(lib))).toBeNull();
      expect(porQuePeriodoRecusa(soRotina, ambulatorio, ctx(lib))).not.toBeNull();
    });
  });

  it('"segue o SLA neste dia" (ajuste do dia) dispensa o prazo mínimo de qualquer turno, não o "não recebe"', () => {
    expect(
      porQuePeriodoRecusa(lista, exame({ restanteMin: 60 }), ctx({ segueSlaNoDia: true })),
    ).toBeNull();
    const manhaCardio = periodo({
      frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null },
    });
    const curto = exame({ especialidadeId: CARDIO, restanteMin: 30 * 60 });
    expect(porQuePeriodoRecusa(manhaCardio, curto, ctx())).not.toBeNull();
    expect(porQuePeriodoRecusa(manhaCardio, curto, ctx({ segueSlaNoDia: true }))).toBeNull();
    expect(
      porQuePeriodoRecusa(lista, urgencia({ restanteMin: 60 }), ctx({ segueSlaNoDia: true })),
    ).not.toBeNull();
  });

  it('com o corte dos turnos posteriores, a Lista que segue o SLA no dia não leva o que eles vão pegar', () => {
    const corte = new Map([[MI, 360]]);
    const c = ctx({ segueSlaNoDia: true, cortePosteriores: corte });
    expect(porQuePeriodoRecusa(lista, exame({ restanteMin: 300 }), c)).not.toBeNull();
    expect(porQuePeriodoRecusa(lista, exame({ restanteMin: 400 }), c)).toBeNull();
    // A prioridade liberada nominalmente não é cortada.
    expect(
      porQuePeriodoRecusa(lista, exame({ restanteMin: 300 }), {
        ...c,
        prioridadesLiberadas: new Set([OP_ROTINA]),
      }),
    ).toBeNull();
    // O corte é da Lista: a Manhã que segue o SLA no dia não é cortada.
    expect(porQuePeriodoRecusa(periodo(), exame({ restanteMin: 300 }), c)).toBeNull();
  });
});

describe('escalaMarcaSegmento e segmentoUnico', () => {
  const p = (subespecialidadeIds: string[], subespecialidadeGeral = false) => ({
    subespecialidadeIds,
    subespecialidadeGeral,
  });

  it('a escala marca o segmento só quando o nomeia', () => {
    expect(escalaMarcaSegmento([p([COLUNAS])], COLUNAS)).toBe(true);
    expect(escalaMarcaSegmento([p([])], COLUNAS)).toBe(false);
    expect(escalaMarcaSegmento([p([], true)], null)).toBe(false);
  });

  it('segmento único: todos os recortes no mesmo e único segmento', () => {
    expect(segmentoUnico([p(['cp']), p(['cp'])])).toBe('cp');
    expect(segmentoUnico([p(['cp']), p([])])).toBeNull();
    expect(segmentoUnico([p(['cp', 'cranio'])])).toBeNull();
    expect(segmentoUnico([p(['cp'], true)])).toBeNull();
    expect(segmentoUnico([])).toBeNull();
  });
});
