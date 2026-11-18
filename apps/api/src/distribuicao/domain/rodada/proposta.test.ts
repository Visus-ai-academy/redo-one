import { describe, expect, it } from 'vitest';

import { CONFIGURACAO_INICIAL } from '../configuracao-global';
import type { ItemRodada, ResultadoRodada } from '../motor/rodada';
import type { ExameLido } from './entrada';
import { montarProposta, ordemDeExecucao } from './proposta';

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
    medicos: { escalados: 2, disponiveis: 2, noTurno: 2, noHorario: 2 },
    exames: { total: 0, escala: 0, arranjo: 0, equipe: 0, reservado: 0, elegiveis: 0 },
  },
  trilha: [] as unknown as ResultadoRodada['trilha'],
  grafiasSemDePara: [],
  medicos: [
    { id: 'A', nome: 'Ana', capacidade: 20, cargaEmMaos: 5, cotaGratificada: 0 },
    { id: 'B', nome: 'Bia', capacidade: null, cargaEmMaos: 0, cotaGratificada: 0 },
  ],
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
        turnos: ['Manhã'],
        frentes: ['MEDICINA INTERNA'],
      },
      {
        id: 'B',
        nome: 'Bia',
        capacidade: null,
        cargaEmMaos: 0,
        cotaGratificada: 0,
        turnos: [],
        frentes: [],
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
          medicos: { escalados: 0, disponiveis: 0, noTurno: 0, noHorario: 0 },
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
