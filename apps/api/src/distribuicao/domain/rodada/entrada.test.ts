import { describe, expect, it } from 'vitest';

import type { Arranjo } from '../arranjo';
import { CONFIGURACAO_INICIAL } from '../configuracao-global';
import type { OcorrenciaRodada } from '../motor/medicos-disponiveis';
import type { PrioridadeOperacao } from '../motor/prioridades-operacao';
import {
  type CatalogoDaFila,
  type ExameDaLeitura,
  type InsumosRodada,
  montarEntrada,
  RECORTES_VAZIOS,
} from './entrada';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const agora = br('2026-11-18T09:00');
const MI = 'esp-mi';
const CT = 'mod-ct';

const catalogo: CatalogoDaFila = {
  classificar: (e) =>
    e.estudo === 'TC TORAX'
      ? {
          exameId: 'ex-tc-torax',
          especialidadeId: MI,
          modalidadeId: CT,
          subespecialidadeId: null,
          especialidadesDoSegmento: [],
        }
      : {
          exameId: null,
          especialidadeId: null,
          modalidadeId: null,
          subespecialidadeId: null,
          especialidadesDoSegmento: [],
        },
  cliente: (unidade) => (unidade === 'HOSPITAL A' ? 'cli-a' : null),
  traduzirPrioridade: (g) => (g === 'Rotina' ? 'pri-rotina' : g === 'Urgência' ? 'pri-urg' : null),
};

const op = (id: string, posicao: number, urg: PrioridadeOperacao['urgencia'], grafias: string[]) =>
  ({
    id,
    nome: id,
    posicao,
    urgencia: urg,
    padrao: id === 'op-rotina',
    grafias,
  }) as PrioridadeOperacao;

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
  inicio: br('2026-11-18T07:00'),
  fim: br('2026-11-18T13:00'),
  produtividade: 20,
  gratificado: false,
  prioridadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  coberturaDeId: null,
  ausente: false,
  ...p,
});

const insumos = (p: Partial<InsumosRodada> = {}): InsumosRodada => ({
  config: CONFIGURACAO_INICIAL,
  medicos: [
    { id: 'A', nome: 'Dra. A', idMobilemed: 101, arranjos: [arranjo()] },
    { id: 'B', nome: 'Dr. B', idMobilemed: 102, arranjos: [arranjo()] },
  ],
  equipes: [],
  ocorrencias: [oc('A'), oc('B')],
  frentes: { 'f-mi': { tipo: 'especialidade', especialidadeId: MI, modalidadeId: null } },
  ajustes: [],
  regrasFrente: [],
  prioridadesOperacao: [
    op('op-urg', 1, { tipo: 'sempre' }, ['Urgência']),
    op('op-rotina', 3, { tipo: 'nunca' }, ['Rotina']),
  ],
  gradeRecebimento: [],
  prioridadesCliente: [],
  nomes: {},
  ...p,
});

let seq = 0;
const exame = (p: Partial<ExameDaLeitura> = {}): ExameDaLeitura => ({
  idExame: `x${++seq}`,
  prioridade: 'Rotina',
  estudo: 'TC TORAX',
  unidade: 'HOSPITAL A',
  modalidade: 'CT',
  especialidade: null,
  laudos: null,
  realizadoEm: br('2026-11-18T06:00'),
  entradaEm: br('2026-11-18T06:10'),
  prazo: br('2026-11-20T06:00'),
  status: 'NOVO',
  paciente: { codigo: '00123', nome: 'Paciente Fictício' },
  ...p,
});

const pseudonimo = (t: string) => `hmac(${t})`;
const montar = (p: Partial<Parameters<typeof montarEntrada>[0]> = {}) =>
  montarEntrada({
    agora,
    leitura: { semMedico: [exame({ idExame: 'e1' })], emMaos: [] },
    catalogo,
    insumos: insumos(),
    entregas: { porExame: new Map(), cotaEntregue: {} },
    recortes: RECORTES_VAZIOS,
    pseudonimo,
    ...p,
  });

describe('montar a entrada do motor a partir da leitura da fila', () => {
  it('casa o exame com o catálogo e o cliente, e troca o paciente pelo HMAC (nunca o nome)', () => {
    const { entrada, lidos } = montar();
    expect(entrada.exames[0]).toMatchObject({
      id: 'e1',
      exameId: 'ex-tc-torax',
      clienteId: 'cli-a',
      especialidadeId: MI,
      modalidadeId: CT,
      paciente: 'hmac(codigo:123)',
      laudos: 1,
      novo: true,
    });
    expect(
      JSON.stringify({ entrada: { ...entrada, traduzirPrioridade: null }, lidos }),
    ).not.toMatch(/Fict/);
    expect(lidos[0]).toMatchObject({
      idExame: 'e1',
      pacienteChave: 'hmac(codigo:123)',
      prioridadeId: 'pri-rotina',
      prioridadeOperacaoId: 'op-rotina',
      posicao: 3,
      urgente: false,
    });
  });

  it('marca a urgência da operação e o status diferente de NOVO', () => {
    const { entrada, lidos } = montar({
      leitura: {
        semMedico: [
          exame({ idExame: 'u', prioridade: 'Urgência' }),
          exame({ idExame: 'p', status: 'Pré-laudado' }),
        ],
        emMaos: [],
      },
    });
    expect(lidos.find((l) => l.idExame === 'u')).toMatchObject({ urgente: true, posicao: 1 });
    expect(entrada.exames.find((e) => e.id === 'p')?.novo).toBe(false);
    expect(entrada.exames.find((e) => e.id === 'u')?.novo).toBe(true);
  });

  it('conta exame fora do catálogo e unidade sem cliente', () => {
    const r = montar({
      leitura: {
        semMedico: [exame({ estudo: 'OUTRO' }), exame({ unidade: 'CLINICA X' })],
        emMaos: [],
      },
    });
    expect(r.semCatalogo).toBe(1);
    expect(r.semCliente).toBe(1);
  });

  it('carga em mãos e aderência vêm dos exames com médico, pela conta na MobileMed', () => {
    const { entrada } = montar({
      leitura: {
        semMedico: [exame({ idExame: 'e1' })],
        emMaos: [
          {
            idExame: 'm1',
            medicoIdMobilemed: 102,
            estudo: 'TC TORAX',
            unidade: 'HOSPITAL A',
            modalidade: 'CT',
            especialidade: null,
            laudos: 2,
            paciente: { codigo: '123', nome: 'Paciente Fictício' },
          },
          {
            idExame: 'm2',
            medicoIdMobilemed: 999,
            estudo: 'TC TORAX',
            unidade: 'HOSPITAL A',
            modalidade: 'CT',
            especialidade: null,
            laudos: 1,
            paciente: { codigo: '9', nome: 'Outro' },
          },
        ],
      },
    });
    expect(entrada.medicos.find((m) => m.id === 'B')?.cargaEmMaos).toBe(2);
    expect(entrada.medicos.find((m) => m.id === 'A')?.cargaEmMaos).toBe(0);
    expect(entrada.exames[0]?.medicoAderente).toBe('B');
  });

  it('a carga exclusiva em mãos é a da clínica exclusiva do médico', () => {
    const { entrada } = montar({
      insumos: insumos({
        medicos: [
          {
            id: 'A',
            nome: 'Dra. A',
            idMobilemed: 101,
            arranjos: [arranjo({ clientesExclusivosIds: ['cli-a'] })],
          },
        ],
      }),
      leitura: {
        semMedico: [],
        emMaos: [
          {
            idExame: 'm1',
            medicoIdMobilemed: 101,
            estudo: 'TC TORAX',
            unidade: 'HOSPITAL A',
            modalidade: 'CT',
            especialidade: null,
            laudos: 1,
            paciente: { codigo: '1', nome: 'X' },
          },
        ],
      },
    });
    expect(entrada.medicos[0]).toMatchObject({ cargaEmMaos: 1, cargaReservadaEmMaos: 1 });
  });

  it('já entregue e cota gratificada vêm do histórico das designações', () => {
    const em = br('2026-11-17T10:00');
    const { entrada } = montar({
      entregas: { porExame: new Map([['e1', [{ medicoId: 'A', em }]]]), cotaEntregue: { g1: 4 } },
    });
    expect(entrada.exames[0]?.entregues).toEqual([{ medicoId: 'A', em }]);
    expect(entrada.cotaEntregue).toEqual({ g1: 4 });
  });

  it('aplica os recortes: médicos excluídos saem; turnos, frentes, prioridades, clientes e incluídos vão ao filtro', () => {
    const { entrada } = montar({
      recortes: {
        turnoIds: ['manha'],
        frenteIds: ['f-mi', 'f-inexistente'],
        prioridadeOperacaoIds: ['op-urg'],
        clienteIds: ['cli-a'],
        medicosExcluidos: ['B'],
        medicosIncluidos: ['A'],
      },
    });
    expect(entrada.medicos.map((m) => m.id)).toEqual(['A']);
    expect(entrada.filtro).toEqual({
      turnoIds: ['manha'],
      frentes: [{ tipo: 'especialidade', especialidadeId: MI, modalidadeId: null }],
      prioridadeOperacaoIds: ['op-urg'],
      clienteIds: ['cli-a'],
      medicosIncluidos: ['A'],
    });
  });

  it('a configuração do motor é a global, sem os campos que só a rodada usa', () => {
    const { entrada } = montar();
    expect(entrada.config).not.toHaveProperty('roboAtivo');
    expect(entrada.config.diasJaEntregue).toBe(CONFIGURACAO_INICIAL.diasJaEntregue);
  });
});
