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
const ROTINA = 'pri-rotina';
const URGENCIA = 'pri-urgencia';
const PLANTAO = 'pri-plantao';
// Prioridades da operação.
const OP_URGENCIA = 'op-urgencia';
const OP_AMBULATORIO = 'op-ambulatorio';
const OP_ROTINA = 'op-rotina';
const OP_PLANTAO = 'op-plantao';
// Turnos da escala.
const MANHA = 'turno-manha';
const LISTA = 'turno-lista';
const CARDIO = 'esp-cardio';

const arranjo = (p: Partial<Arranjo> = {}): Arranjo => ({
  especialidadeId: null,
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
  prioridadeId: ROTINA,
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
    const soUrgencia = arranjo({ prioridadeIds: [URGENCIA] });
    expect(casaArranjo(soUrgencia, alvo({ prioridadeId: URGENCIA }))).toBe(true);
    expect(casaArranjo(soUrgencia, alvo({ prioridadeId: ROTINA }))).toBe(false);
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
    const soRotina = arranjo({ prioridadeIds: [ROTINA] });
    const urg = alvo({ prioridadeId: URGENCIA });
    expect(casaArranjo(soRotina, urg)).toBe(false);
    expect(casaArranjo(soRotina, urg, { prioridadesLiberadas: new Set([URGENCIA]) })).toBe(true);
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
    prioridadeIds: [URGENCIA],
    modoClientes: 'apenas',
    clienteIds: ['cedivar'],
  });
  const eq2 = { membros: ['larissa', 'rubens'], arranjos: [regraEq2], plantao: false };
  const equipe2 = [eq2];
  const cedivar = alvo({ modalidadeId: CT, prioridadeId: URGENCIA, clienteId: 'cedivar' });

  it('o recorte da equipe é só dos membros', () => {
    expect(direcionadoPara(equipe2, cedivar)).toEqual({
      medicos: new Set(['larissa', 'rubens']),
      plantao: false,
    });
    expect(direcionadoPara(equipe2, { ...cedivar, prioridadeId: ROTINA })).toBeNull();
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
    expect(direcionadoPara(plantao, { ...cedivar, prioridadeId: ROTINA })).toBeNull();
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
    prioridadeIdsUrgenciaCatalogo: [URGENCIA],
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
    exame({ prioridadeId: URGENCIA, prioridadeOperacaoId: OP_URGENCIA, urgente: true, ...p });
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
    const manhaUrgencia = periodo({ prioridadeIds: [URGENCIA] });
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
    expect(
      aceita([lista], exame({ prioridadeId: PLANTAO, prioridadeOperacaoId: OP_PLANTAO })),
    ).toBe(false);
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
    expect(
      aceita([mama], daMama({ prioridadeId: PLANTAO, prioridadeOperacaoId: OP_PLANTAO })),
    ).toBe(false);
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
      aceita([periodo({ turnoId: LISTA, gratificado: true, prioridadeIds: [ROTINA] })], urgencia()),
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
    const lib = { prioridadesLiberadas: new Set([URGENCIA]) };
    expect(porQuePeriodoRecusa(lista, urg, ctx())).not.toBeNull();
    expect(porQuePeriodoRecusa(lista, urg, ctx(lib))).toBeNull();
    expect(
      porQuePeriodoRecusa(
        lista,
        exame({ prioridadeId: PLANTAO, prioridadeOperacaoId: OP_PLANTAO }),
        ctx(lib),
      ),
    ).not.toBeNull();
    expect(
      porQuePeriodoRecusa(
        periodo({ turnoId: LISTA, lista: true, prioridadeIds: [ROTINA] }),
        urg,
        ctx(lib),
      ),
    ).toBeNull();
  });

  it('Dra. Daniela (05/11): na Lista, a rotina com prazo curto não entra', () => {
    expect(porQuePeriodoRecusa(lista, exame({ restanteMin: 60 }), ctx())).toMatch(/mínimo de 24h/);
  });

  it('alocação com URGÊNCIA marcada recebe pelo SLA o que a operação trata como urgência (HPRIMAVERA, RX)', () => {
    const listaRx = periodo({
      turnoId: LISTA,
      lista: true,
      frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: RX },
      prioridadeIds: [ROTINA, URGENCIA],
    });
    const urgRx = urgencia({ modalidadeId: RX, restanteMin: 60 });
    expect(porQuePeriodoRecusa(listaRx, urgRx, ctx())).toBeNull();
    expect(porQuePeriodoRecusa(listaRx, { ...urgRx, restanteMin: -30 }, ctx())).toBeNull();
    // O AMBULATÓRIO perto do prazo é urgência da operação: entra também (o catálogo é ROTINA).
    const ambulatorioUrgente = exame({
      modalidadeId: RX,
      prioridadeOperacaoId: OP_AMBULATORIO,
      urgente: true,
      restanteMin: 600,
    });
    expect(porQuePeriodoRecusa(listaRx, ambulatorioUrgente, ctx())).toBeNull();
    // Sem a URGÊNCIA marcada na alocação (ou sem recorte), vale a célula.
    expect(
      porQuePeriodoRecusa({ ...listaRx, prioridadeIds: [ROTINA] }, ambulatorioUrgente, ctx()),
    ).not.toBeNull();
    expect(porQuePeriodoRecusa({ ...listaRx, prioridadeIds: [] }, urgRx, ctx())).not.toBeNull();
    // Só o que é urgência: a rotina curta continua barrada.
    expect(
      porQuePeriodoRecusa(listaRx, exame({ modalidadeId: RX, restanteMin: 60 }), ctx()),
    ).not.toBeNull();
    // O recorte da alocação continua: a urgência marcada não abre a prioridade que ela não aceita.
    expect(
      porQuePeriodoRecusa({ ...listaRx, prioridadeIds: [URGENCIA] }, ambulatorioUrgente, ctx()),
    ).not.toBeNull();
  });

  it('a urgência pela alocação vale em qualquer turno e só para a URGÊNCIA do catálogo da configuração', () => {
    const manhaCardio = periodo({
      frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null },
      prioridadeIds: [ROTINA, URGENCIA],
    });
    // Uma ROTINA tratada como urgência na frente (sobrescrita) com 30 h, na Manhã de CARDIO (48 h).
    const rotinaUrgente = exame({ especialidadeId: CARDIO, urgente: true, restanteMin: 30 * 60 });
    expect(porQuePeriodoRecusa(manhaCardio, rotinaUrgente, ctx())).toBeNull();
    expect(
      porQuePeriodoRecusa(manhaCardio, rotinaUrgente, ctx({ prioridadeIdsUrgenciaCatalogo: [] })),
    ).not.toBeNull();
    const listaMi = periodo({ turnoId: LISTA, lista: true, prioridadeIds: [URGENCIA, PLANTAO] });
    expect(
      porQuePeriodoRecusa(
        listaMi,
        exame({ prioridadeId: PLANTAO, prioridadeOperacaoId: OP_PLANTAO }),
        ctx(),
      ),
    ).not.toBeNull();
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
        prioridadesLiberadas: new Set([ROTINA]),
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
