import { describe, expect, it } from 'vitest';

import { CONFIGURACAO_INICIAL } from '../configuracao-global';
import type { ItemRodada, ResultadoRodada } from '../motor/rodada';
import type { ExameLido } from './entrada';
import { frenteNaRodada, montarProposta, ordemDeExecucao } from './proposta';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const agora = br('2026-11-18T09:00');

const lido = (idExame: string, p: Partial<ExameLido> = {}): ExameLido => ({
  idExame,
  pacienteChave: `hmac-${idExame}`,
  estudo: 'TC TORAX',
  unidade: 'HOSPITAL A',
  laudos: 1,
  realizadoEm: br('2026-11-18T06:00'),
  entradaEm: br('2026-11-18T06:10'),
  prazo: br('2026-11-20T06:00'),
  prioridadeGrafia: 'Rotina',
  prioridadeId: 'pri-rotina',
  prioridadeOperacaoId: 'op-rotina',
  posicao: 3,
  urgente: false,
  clienteId: 'cli-a',
  exameId: 'ex',
  especialidadeId: 'mi',
  modalidadeId: 'ct',
  subespecialidadeId: null,
  especialidadesDoSegmento: [],
  ...p,
});
const vai = (exameId: string, medicoId: string, p: Partial<ItemRodada> = {}): ItemRodada => ({
  exameId,
  medicoId,
  motivo: null,
  detalhe: null,
  agrupadoCom: null,
  gratificado: false,
  alocacaoGratificadaId: null,
  coberturaDeId: null,
  elegiveis: [medicoId],
  barrados: {},
  ...p,
});
const fica = (exameId: string): ItemRodada => ({
  ...vai(exameId, ''),
  medicoId: null,
  motivo: 'sem_medico_elegivel',
  detalhe: 'Nenhum médico.',
});
const resultado = (itens: ItemRodada[], p: Partial<ResultadoRodada> = {}): ResultadoRodada => ({
  itens,
  totais: { exames: itens.length, distribuidos: 0, emAberto: 0 },
  funil: {
    medicos: { escalados: 2, disponiveis: 2, noTurno: 2, noHorario: 2, comConta: 2 },
    exames: { total: 0, escala: 0, arranjo: 0, equipe: 0, reservado: 0, elegiveis: 0 },
  },
  trilha: [] as unknown as ResultadoRodada['trilha'],
  grafiasSemDePara: [],
  medicos: [
    {
      id: 'A',
      nome: 'Ana',
      capacidade: 20,
      cargaEmMaos: 5,
      cotaGratificada: 0,
      unidadeTeto: 'exames',
    },
    {
      id: 'B',
      nome: 'Bia',
      capacidade: null,
      cargaEmMaos: 0,
      cotaGratificada: 0,
      unidadeTeto: 'exames',
    },
  ],
  foraDaRodada: [],
  ...p,
});
const propor = (p: Partial<Parameters<typeof montarProposta>[0]> = {}) =>
  montarProposta({
    agora,
    lidos: [lido('r'), lido('u', { posicao: 1, urgente: true }), lido('x')],
    resultado: resultado([vai('r', 'A'), vai('u', 'B', { agrupadoCom: 'r' }), fica('x')]),
    config: CONFIGURACAO_INICIAL,
    prioridadesCliente: [],
    semCatalogo: 0,
    semCliente: 0,
    escalaDosMedicos: { A: { turnos: ['Manhã'], frentes: ['MEDICINA INTERNA'] } },
    habilitados: ['A', 'B', 'C', 'D', 'E'],
    ...p,
  });

describe('proposta da rodada', () => {
  it('cada designação guarda quem podia laudar e onde os outros pararam', () => {
    const { designacoes } = propor({
      resultado: resultado([
        vai('r', 'A', { elegiveis: ['A', 'B'], barrados: { C: 'arranjo' } }),
        vai('u', 'B'),
        fica('x'),
      ]),
    });
    expect(designacoes.find((d) => d.idExame === 'r')).toMatchObject({
      elegiveis: ['A', 'B'],
      barrados: { C: 'arranjo' },
      naMao: false,
    });
  });

  it('os insumos guardam os médicos que ficaram fora da rodada, com o motivo', () => {
    const fora = [
      {
        id: 'C',
        nome: 'Caio',
        motivo: 'turno_nao_marcado' as const,
        detalhe: 'Turno Tarde não marcado na rodada.',
      },
    ];
    const { insumos } = propor({ resultado: resultado([], { foraDaRodada: fora }) });
    expect(insumos.foraDaRodada).toEqual(fora);
  });

  it('os insumos guardam os médicos da rodada com turno, frentes, teto e carga', () => {
    const { insumos } = propor();
    expect(insumos.habilitados).toHaveLength(5);
    expect(insumos.medicos).toEqual([
      {
        id: 'A',
        nome: 'Ana',
        capacidade: 20,
        cargaEmMaos: 5,
        cotaGratificada: 0,
        unidadeTeto: 'exames',
        turnos: ['Manhã'],
        frentes: ['MEDICINA INTERNA'],
        aComecar: [],
      },
      {
        id: 'B',
        nome: 'Bia',
        capacidade: null,
        cargaEmMaos: 0,
        cotaGratificada: 0,
        unidadeTeto: 'exames',
        turnos: [],
        frentes: [],
        aComecar: [],
      },
    ]);
  });

  it('uma designação por exame lido, na ordem da fila (posição 1 primeiro)', () => {
    const { designacoes } = propor();
    expect(designacoes.map((d) => [d.idExame, d.ordem])).toEqual([
      ['u', 0],
      ['r', 1],
      ['x', 2],
    ]);
  });

  it('o distribuído vira prevista com o médico proposto; o resto, recusada com o motivo', () => {
    const { designacoes } = propor();
    expect(designacoes.find((d) => d.idExame === 'u')).toMatchObject({
      status: 'prevista',
      medicoId: 'B',
      medicoPropostoId: 'B',
      agrupadoCom: 'r',
      urgente: true,
    });
    expect(designacoes.find((d) => d.idExame === 'x')).toMatchObject({
      status: 'recusada',
      medicoId: null,
      medicoPropostoId: null,
      motivo: 'sem_medico_elegivel',
      detalhe: 'Nenhum médico.',
    });
  });

  it('o teto por rodada corta as designações na ordem da fila, com motivo à vista', () => {
    const { designacoes, avisos } = propor({
      config: { ...CONFIGURACAO_INICIAL, tetoPorRodada: 1 },
    });
    expect(designacoes.find((d) => d.idExame === 'u')?.status).toBe('prevista');
    expect(designacoes.find((d) => d.idExame === 'r')).toMatchObject({
      status: 'recusada',
      medicoId: null,
      medicoPropostoId: 'A',
      motivo: 'teto_da_rodada',
      detalhe: 'Acima do teto de 1 exame(s) por rodada: fica para a próxima.',
    });
    expect(avisos).toContain('1 exame(s) acima do teto de 1 por rodada ficam para a próxima.');
  });

  it('avisa catálogo, cliente, grafia sem de-para e ninguém em turno', () => {
    const { avisos } = propor({
      semCatalogo: 2,
      semCliente: 1,
      resultado: resultado([], {
        grafiasSemDePara: ['Eletivo'],
        funil: {
          medicos: { escalados: 0, disponiveis: 0, noTurno: 0, noHorario: 0, comConta: 0 },
          exames: { total: 0, escala: 0, arranjo: 0, equipe: 0, reservado: 0, elegiveis: 0 },
        },
      }),
      lidos: [],
    });
    expect(avisos).toEqual([
      'Nenhum médico habilitado está em turno agora.',
      '2 exame(s) com estudo fora do catálogo: cadastre em Exames.',
      '1 exame(s) com unidade sem cliente cadastrado: as regras de cliente não valem para eles.',
      'Prioridade da MobileMed sem de-para na distribuição: Eletivo (valeu como a padrão). Cadastre em Configurações › Distribuição.',
    ]);
  });

  it('conta os urgentes e guarda o que o motor viu para o "por quê"', () => {
    const r = propor();
    expect(r.urgentes).toBe(1);
    expect(r.insumos).toMatchObject({ grafiasSemDePara: [], leituraEm: agora.toISOString() });
    expect(r.insumos.funil.medicos.noHorario).toBe(2);
  });
});

describe('ordem de execução', () => {
  it('segue a fila do momento: posição, depois prazo', () => {
    const ordem = ordemDeExecucao(
      [
        {
          id: 'r-tarde',
          posicao: 3,
          urgente: false,
          prazo: br('2026-11-20T06:00'),
          entradaEm: agora,
          clienteId: null,
          especialidadeId: null,
          modalidadeId: null,
        },
        {
          id: 'r-cedo',
          posicao: 3,
          urgente: false,
          prazo: br('2026-11-19T06:00'),
          entradaEm: agora,
          clienteId: null,
          especialidadeId: null,
          modalidadeId: null,
        },
        {
          id: 'u',
          posicao: 1,
          urgente: true,
          prazo: null,
          entradaEm: agora,
          clienteId: null,
          especialidadeId: null,
          modalidadeId: null,
        },
      ],
      CONFIGURACAO_INICIAL,
      [],
      agora,
    );
    expect(ordem).toEqual(['u', 'r-cedo', 'r-tarde']);
  });
});

describe('proposta com os recolhidos', () => {
  const ficaram = {
    aberto: 1,
    trocado_por_fora: 0,
    pacote_aberto: 2,
    turno_em_curso: 3,
    frente_nao_recolhe: 0,
  };
  const comRecolhidos = () =>
    propor({
      lidos: [lido('r'), lido('rc1'), lido('rc2'), lido('rc3', { urgente: true })],
      resultado: resultado([vai('r', 'A'), vai('rc1', 'B'), vai('rc2', 'A'), fica('rc3')]),
      recolhimento: {
        recolhidos: [
          { idExame: 'rc1', deMedicoId: 'C', deMedicoIdMobilemed: 9, motivo: 'turno_encerrado' },
          { idExame: 'rc2', deMedicoId: 'D', deMedicoIdMobilemed: 9, motivo: 'ausencia' },
          { idExame: 'rc3', deMedicoId: 'C', deMedicoIdMobilemed: 9, motivo: 'turno_encerrado' },
        ],
        ficaram,
      },
    });

  it('marca de quem o exame sai e por quê; o que ninguém pega fica com quem tem (fora da proposta)', () => {
    const p = comRecolhidos();
    expect(p.designacoes.map((d) => [d.idExame, d.recolhidoDeId, d.motivoRecolhimento])).toEqual([
      ['r', null, null],
      ['rc1', 'C', 'turno_encerrado'],
      ['rc2', 'D', 'ausencia'],
    ]);
    expect(p.recolhidos).toBe(2);
    // O urgente que ficou com quem tem não conta nas urgências da proposta.
    expect(p.urgentes).toBe(0);
  });

  it('guarda o resumo do recolhimento e avisa quantos vão e quantos ficam', () => {
    const p = comRecolhidos();
    expect(p.insumos.recolhimento).toEqual({
      recolhiveis: 3,
      porAusencia: 1,
      propostos: 2,
      semDestino: 1,
      naoRecolhidos: ficaram,
    });
    expect(p.avisos).toContain(
      'Recolhimento: 3 exame(s) intocado(s) de médico fora do turno ou ausente (1 por ausência); 2 vão para outro médico nesta proposta, 1 fica(m) com quem tem.',
    );
  });

  it('sem recolhimento, nada muda', () => {
    const p = propor();
    expect(p.recolhidos).toBe(0);
    expect(p.insumos.recolhimento).toBeUndefined();
    expect(p.designacoes.every((d) => d.recolhidoDeId === null)).toBe(true);
  });
});

describe('a frente do exame na proposta', () => {
  const neuro = { id: 'f-neuro' };
  const rx = { id: 'f-rx' };

  it('só a frente de modalidade marcada: o exame fica nela', () => {
    expect(frenteNaRodada([neuro, rx], ['f-rx'])).toBe(rx);
  });

  it('as duas marcadas: a de especialidade antes da de modalidade', () => {
    expect(frenteNaRodada([neuro, rx], ['f-rx', 'f-neuro'])).toBe(neuro);
  });

  it('nenhuma frente marcada (rodada sem recorte de frente): a de especialidade antes', () => {
    expect(frenteNaRodada([neuro, rx], [])).toBe(neuro);
    expect(frenteNaRodada([null, rx], [])).toBe(rx);
  });

  it('nenhuma das frentes do exame marcada: a primeira que casa, como sem recorte', () => {
    expect(frenteNaRodada([neuro, rx], ['f-outra'])).toBe(neuro);
  });

  it('sem frente que case com o exame: null', () => {
    expect(frenteNaRodada([null, null], ['f-rx'])).toBeNull();
  });
});
