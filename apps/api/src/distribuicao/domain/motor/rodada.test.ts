import { describe, expect, it } from 'vitest';

import type { Arranjo } from '../arranjo';
import type { ConfiguracaoDistribuicao } from './configuracao';
import type { OcorrenciaRodada } from './medicos-disponiveis';
import { type EntradaRodada, type ExameFilaRodada, rodarMotor } from './rodada';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const MI = 'esp-mi';
const CT = 'mod-ct';
const ROTINA = 'pri-rotina';
const URGENCIA = 'pri-urgencia';
/** As variações do catálogo: Ambulatório e Internado → ROTINA, Emergência → URGÊNCIA. */
const VARIACOES: Record<string, string> = {
  ROTINA: ROTINA,
  AMBULATORIO: ROTINA,
  INTERNADO: ROTINA,
  URGENCIA: URGENCIA,
  EMERGENCIA: URGENCIA,
};
const traduzirPrioridade = (grafia: string) =>
  VARIACOES[grafia.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()] ?? null;

const CONFIG: ConfiguracaoDistribuicao = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
  prioridadeIdsUrgentes: [URGENCIA],
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  toleranciaAcimaTeto: 0,
  margemUrgenciaPct: 0,
  folgaProporcaoPct: 20,
  prazoCriticoMin: 60,
  antecedenciaPeriodoMin: 180,
  cicloMinutos: 30,
  marcadoresEquilibrio: ['ONCO'],
  escalaRestringeEspecialidade: true,
  diasJaEntregue: 7,
  turnosPosteriores: null,
  lista: { prioridadeIds: [], prazoMinimoHoras: null },
};

const agora = br('2026-11-17T08:00');
let seq = 0;
const exame = (p: Partial<ExameFilaRodada> = {}): ExameFilaRodada => {
  const id = p.id ?? `e${++seq}`;
  return {
    id,
    exameId: null,
    clienteId: null,
    especialidadeId: MI,
    especialidadesDoSegmento: [],
    modalidadeId: CT,
    subespecialidadeId: null,
    prioridade: 'Rotina',
    nome: 'TC TORAX',
    paciente: `P${id}`,
    laudos: 1,
    prazo: br('2026-11-18T08:00'),
    entradaEm: br('2026-11-17T06:00'),
    novo: true,
    medicoAderente: null,
    entregues: [],
    ...p,
  };
};
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
const oc = (medicoId: string, p: Partial<OcorrenciaRodada> = {}): OcorrenciaRodada => ({
  alocacaoId: `aloc-${medicoId}`,
  medicoId,
  turnoId: 'manha',
  turnoTipo: 'fixo',
  frente: { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null },
  inicio: br('2026-11-17T07:00'),
  fim: br('2026-11-17T13:00'),
  produtividade: 20,
  gratificado: false,
  prioridadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  coberturaDeId: null,
  ausente: false,
  ...p,
});
const medico = (id: string, arranjos: Arranjo[] = [arranjo()]) => ({
  id,
  nome: id,
  arranjos,
  cargaEmMaos: 0,
  cargaReservadaEmMaos: 0,
});

const rodar = (p: Partial<EntradaRodada>) =>
  rodarMotor({
    agora,
    exames: [exame()],
    medicos: [medico('A')],
    ocorrencias: [oc('A')],
    equipes: [],
    ajustes: [],
    regrasFrente: [],
    config: CONFIG,
    traduzirPrioridade,
    prioridadesCliente: [],
    cotaEntregue: {},
    ...p,
  });
const item = (r: ReturnType<typeof rodar>, id: string) => r.itens.find((i) => i.exameId === id);

describe('rodarMotor', () => {
  it('distribui o exame elegível, com o prazo medido a partir de agora', () => {
    const r = rodar({});
    expect(r.itens).toEqual([
      expect.objectContaining({
        medicoId: 'A',
        motivo: null,
        alocacaoGratificadaId: null,
        coberturaDeId: null,
      }),
    ]);
    expect(r.totais).toMatchObject({ exames: 1, distribuidos: 1, emAberto: 0 });
  });

  it('Internado é variação de ROTINA: passa no recorte ROTINA da escala e do arranjo, sem ser urgente', () => {
    const r = rodar({
      exames: [exame({ id: 'int', prioridade: 'INTERNADO' })],
      medicos: [medico('A', [arranjo({ prioridadeIds: [ROTINA] })])],
      ocorrencias: [oc('A', { prioridadeIds: [ROTINA] })],
    });
    expect(item(r, 'int')?.medicoId).toBe('A');
  });

  it('Emergência é URGÊNCIA: urgente na fila e com a margem de urgência', () => {
    const exames = [
      exame({ id: 'rot', prazo: br('2026-11-17T09:00') }),
      exame({ id: 'eme', prioridade: 'Emergência' }),
    ];
    const r = rodar({
      exames,
      medicos: [medico('A')],
      ocorrencias: [oc('A', { produtividade: 1 })],
    });
    expect(item(r, 'eme')?.medicoId).toBe('A');
    expect(item(r, 'rot')?.motivo).toBe('sem_espaco');
  });

  it('só exame NOVO entra', () => {
    const r = rodar({ exames: [exame({ id: 'velho', novo: false })] });
    expect(item(r, 'velho')).toMatchObject({ medicoId: null, motivo: 'nao_novo' });
  });

  it('recortes da rodada de prioridade (pela tradução) e de clínica, com o motivo à vista', () => {
    const r = rodar({
      exames: [
        exame({ id: 'u', prioridade: 'Urgência', clienteId: 'X' }),
        exame({ id: 'r', clienteId: 'X' }),
        exame({ id: 'y', prioridade: 'Urgência', clienteId: 'Y' }),
      ],
      filtro: { prioridadeIds: [URGENCIA], clienteIds: ['X'] },
      nomes: { [URGENCIA]: 'URGÊNCIA', X: 'CLÍNICA X' },
    });
    expect(item(r, 'u')?.medicoId).toBe('A');
    expect(item(r, 'r')).toMatchObject({
      motivo: 'fora_da_prioridade',
      detalhe: 'A rodada distribui só URGÊNCIA.',
    });
    expect(item(r, 'y')).toMatchObject({
      motivo: 'fora_da_clinica',
      detalhe: 'A rodada distribui só CLÍNICA X.',
    });
  });

  it('sem médico elegível: o motivo diz onde a elegibilidade zerou', () => {
    const r = rodar({ medicos: [medico('A', [arranjo({ especialidadeId: 'outra' })])] });
    expect(item(r, r.itens[0]?.exameId ?? '')).toMatchObject({ motivo: 'sem_medico_elegivel' });
    expect(r.itens[0]?.detalhe).toMatch(/arranjo/);
  });

  it('exame retirado de quem o laudaria: motivo próprio', () => {
    const r = rodar({
      exames: [exame({ id: 'ret', entregues: [{ medicoId: 'A', em: br('2026-11-16T10:00') }] })],
    });
    expect(item(r, 'ret')).toMatchObject({ motivo: 'retirado_do_medico' });
  });

  it('a designação leva a cota gratificada e a cobertura', () => {
    const r = rodar({
      ocorrencias: [oc('A', { gratificado: true, alocacaoId: 'g1', coberturaDeId: 'TIT' })],
    });
    expect(r.itens[0]).toMatchObject({
      medicoId: 'A',
      gratificado: true,
      alocacaoGratificadaId: 'g1',
      coberturaDeId: 'TIT',
    });
  });

  it('o marcador de equilíbrio vem do nome do exame, sem acento e sem caixa', () => {
    const r = rodar({
      exames: [
        exame({ nome: 'RM Mama oncológica' }),
        exame({ nome: 'TC onco' }),
        exame({ nome: 'TC TORAX ONCO' }),
        exame({ nome: 'TC Abdome onco' }),
      ],
      medicos: [medico('A'), medico('B')],
      ocorrencias: [
        oc('A', { produtividade: 100 }),
        oc('B', { produtividade: 100, alocacaoId: 'b' }),
      ],
    });
    const porMedico = (m: string) => r.itens.filter((i) => i.medicoId === m).length;
    expect([porMedico('A'), porMedico('B')]).toEqual([2, 2]);
  });

  it('o funil e a trilha saem junto', () => {
    const r = rodar({});
    expect(r.funil.medicos.noHorario).toBe(1);
    expect(r.funil.exames.total).toBe(1);
    expect(r.trilha.pacotes).toBe(1);
  });
});
