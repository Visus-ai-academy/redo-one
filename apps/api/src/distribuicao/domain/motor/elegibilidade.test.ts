import { describe, expect, it } from 'vitest';

import type { Arranjo } from '../arranjo';
import { REGRAS_NEUTRAS, type RegrasFrente, RegrasPorFrente } from './configuracao';
import {
  type AlvoExame,
  arranjoMarcaPrioridade,
  type ContextoPeriodo,
  casaArranjo,
  direcionadoPara,
  escalaMarcaSegmento,
  type PeriodoEscala,
  porQuePeriodoRecusa,
  reservadoPara,
  segmentoUnico,
} from './elegibilidade';

// Ids do catálogo (fictícios, com nomes legíveis).
const NEURO = 'esp-neuro';
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

describe('arranjoMarcaPrioridade', () => {
  const urg = alvo({ especialidadeId: MI, modalidadeId: MR, prioridadeId: URGENCIA });
  it('marca quando o arranjo que casa o exame inclui a prioridade, ou não recorta', () => {
    expect(arranjoMarcaPrioridade([arranjo({ prioridadeIds: [URGENCIA] })], urg)).toBe(true);
    expect(arranjoMarcaPrioridade([arranjo()], urg)).toBe(true);
    expect(arranjoMarcaPrioridade([arranjo({ prioridadeIds: [ROTINA] })], urg)).toBe(false);
    expect(
      arranjoMarcaPrioridade([arranjo({ especialidadeId: NEURO, prioridadeIds: [URGENCIA] })], urg),
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
  const regrasMi: RegrasFrente = {
    ...REGRAS_NEUTRAS,
    frente: { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
    listaPrioridadeIds: [ROTINA],
    listaPrazoMinimoHoras: 24,
  };
  const regrasRx: RegrasFrente = {
    ...REGRAS_NEUTRAS,
    frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: RX },
    listaPrioridadeIds: [ROTINA],
    listaPrazoMinimoHoras: 24,
  };
  const ctx = (p: Partial<ContextoPeriodo> = {}): ContextoPeriodo => ({
    escalaRestringeEspecialidade: true,
    regras: new RegrasPorFrente([regrasMi, regrasRx]),
    prioridadeIdsUrgentes: [URGENCIA],
    ...p,
  });
  const periodo = (p: Partial<PeriodoEscala> = {}): PeriodoEscala => ({
    alocacaoId: 'a',
    turnoId: 't',
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
  const aceita = (ps: PeriodoEscala[], a = exame(), c = ctx()) =>
    ps.some((p) => porQuePeriodoRecusa(p, a, c) === null);
  const lista = periodo({ lista: true });

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

  it('Lista: só as prioridades da frente e com prazo acima do mínimo; prazo ilegível não entra', () => {
    expect(aceita([lista], exame({ restanteMin: 60 }))).toBe(false);
    expect(aceita([lista], exame({ restanteMin: null }))).toBe(false);
    expect(aceita([lista], exame({ prioridadeId: URGENCIA, restanteMin: -30 }))).toBe(false);
  });

  it('Lista gratificada segue o SLA puro, mas o recorte da escala continua', () => {
    const grat = periodo({ lista: false, gratificado: true });
    expect(aceita([grat], exame({ prioridadeId: URGENCIA, restanteMin: -30 }))).toBe(true);
    expect(aceita([grat], exame({ restanteMin: null }))).toBe(true);
    expect(
      aceita(
        [periodo({ gratificado: true, prioridadeIds: [ROTINA] })],
        exame({ prioridadeId: URGENCIA }),
      ),
    ).toBe(false);
  });

  it('Lista de frente sem regra (ou com prazo nulo) segue o SLA', () => {
    const mama = periodo({
      lista: true,
      frente: { tipo: 'especialidade', especialidadeId: 'esp-mama', modalidadeId: null },
    });
    expect(
      aceita(
        [mama],
        exame({ especialidadeId: 'esp-mama', prioridadeId: URGENCIA, restanteMin: -10 }),
        ctx(),
      ),
    ).toBe(true);
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

  it('prioridade liberada fura a Lista e o recorte de prioridade, só para ela', () => {
    const urg = exame({ prioridadeId: URGENCIA, restanteMin: 60 });
    const lib = { prioridadesLiberadas: new Set([URGENCIA]) };
    expect(porQuePeriodoRecusa(lista, urg, ctx())).not.toBeNull();
    expect(porQuePeriodoRecusa(lista, urg, ctx(lib))).toBeNull();
    expect(porQuePeriodoRecusa(lista, exame({ prioridadeId: PLANTAO }), ctx(lib))).not.toBeNull();
    expect(
      porQuePeriodoRecusa(periodo({ lista: true, prioridadeIds: [ROTINA] }), urg, ctx(lib)),
    ).toBeNull();
  });

  it('o arranjo que marca a prioridade abre a prioridade na Lista, não o prazo mínimo', () => {
    const marca = ctx({ arranjoMarcaPrioridade: true });
    expect(
      porQuePeriodoRecusa(lista, exame({ prioridadeId: URGENCIA, restanteMin: 25 * 60 }), marca),
    ).toBeNull();
    expect(
      porQuePeriodoRecusa(lista, exame({ prioridadeId: URGENCIA, restanteMin: 60 }), marca),
    ).not.toBeNull();
    // Dra. Daniela (05/11): rotina com prazo curto não entra.
    expect(porQuePeriodoRecusa(lista, exame({ restanteMin: 60 }), marca)).not.toBeNull();
    // O recorte do período continua.
    expect(
      porQuePeriodoRecusa(
        periodo({ lista: true, prioridadeIds: [ROTINA] }),
        exame({ prioridadeId: URGENCIA, restanteMin: 25 * 60 }),
        marca,
      ),
    ).not.toBeNull();
  });

  it('Lista com urgência marcada na alocação recebe as urgências pelo SLA (HPRIMAVERA, RX)', () => {
    const listaRx = periodo({
      lista: true,
      frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: RX },
      prioridadeIds: [ROTINA, URGENCIA],
    });
    const urgRx = exame({ modalidadeId: RX, prioridadeId: URGENCIA, restanteMin: 60 });
    expect(porQuePeriodoRecusa(listaRx, urgRx, ctx())).toBeNull();
    expect(porQuePeriodoRecusa(listaRx, { ...urgRx, restanteMin: -30 }, ctx())).toBeNull();
    // Sem a urgência marcada na alocação (ou sem recorte), a Lista segue a regra dela.
    expect(
      porQuePeriodoRecusa({ ...listaRx, prioridadeIds: [ROTINA] }, urgRx, ctx()),
    ).not.toBeNull();
    expect(porQuePeriodoRecusa({ ...listaRx, prioridadeIds: [] }, urgRx, ctx())).not.toBeNull();
    // Só a prioridade urgente: a rotina curta continua barrada.
    expect(porQuePeriodoRecusa(listaRx, { ...urgRx, prioridadeId: ROTINA }, ctx())).not.toBeNull();
  });

  it('a urgência pela alocação vale em qualquer frente e só para as prioridades urgentes da configuração', () => {
    const listaMi = periodo({ lista: true, prioridadeIds: [URGENCIA, PLANTAO] });
    expect(
      porQuePeriodoRecusa(listaMi, exame({ prioridadeId: URGENCIA, restanteMin: 60 }), ctx()),
    ).toBeNull();
    expect(
      porQuePeriodoRecusa(listaMi, exame({ prioridadeId: PLANTAO, restanteMin: 60 }), ctx()),
    ).not.toBeNull();
    expect(
      porQuePeriodoRecusa(
        listaMi,
        exame({ prioridadeId: URGENCIA, restanteMin: 60 }),
        ctx({ prioridadeIdsUrgentes: [] }),
      ),
    ).not.toBeNull();
  });

  it('"a Lista segue o SLA" (ajuste do dia) dispensa a regra da Lista', () => {
    expect(
      porQuePeriodoRecusa(
        lista,
        exame({ prioridadeId: URGENCIA, restanteMin: 60 }),
        ctx({ listaSegueSla: true }),
      ),
    ).toBeNull();
  });

  it('com o corte dos turnos posteriores, a Lista que segue o SLA não leva o que eles vão pegar', () => {
    const corte = new Map([[MI, 360]]);
    const c = ctx({ listaSegueSla: true, cortePosteriores: corte });
    expect(porQuePeriodoRecusa(lista, exame({ restanteMin: 300 }), c)).not.toBeNull();
    expect(porQuePeriodoRecusa(lista, exame({ restanteMin: 400 }), c)).toBeNull();
    // A prioridade liberada nominalmente não é cortada.
    expect(
      porQuePeriodoRecusa(lista, exame({ restanteMin: 300 }), {
        ...c,
        prioridadesLiberadas: new Set([ROTINA]),
      }),
    ).toBeNull();
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
