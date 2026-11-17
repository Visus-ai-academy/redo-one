import { describe, expect, it } from 'vitest';

import type { Arranjo } from '../arranjo';
import {
  type ConfiguracaoDistribuicao,
  REGRAS_NEUTRAS,
  type RegrasFrente,
  RegrasPorFrente,
} from './configuracao';
import {
  type AjusteDia,
  type EntradaMedicos,
  type ExameElegivel,
  montarMedicosDisponiveis,
  type OcorrenciaRodada,
} from './medicos-disponiveis';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const MI = 'esp-mi';
const MSK = 'esp-msk';
const CT = 'mod-ct';
const ROTINA = 'pri-rotina';
const URGENCIA = 'pri-urgencia';
const FRENTE_MI = { tipo: 'especialidade' as const, especialidadeId: MI, modalidadeId: null };
const FRENTE_MSK = { tipo: 'especialidade' as const, especialidadeId: MSK, modalidadeId: null };
const FRENTE_CT = { tipo: 'modalidade' as const, especialidadeId: null, modalidadeId: CT };

const CONFIG: ConfiguracaoDistribuicao = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
  prioridadesUrgentes: [URGENCIA],
  urgenciaPor: 'catalogo',
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  toleranciaAcimaTeto: 0,
  margemUrgenciaPct: 0,
  folgaAtrasadoPct: 20,
  prazoCriticoMin: 60,
  antecedenciaPeriodoMin: 180,
  cicloMinutos: 30,
  marcadoresEquilibrio: [],
  escalaRestringeEspecialidade: true,
  diasJaEntregue: 7,
  turnosPosteriores: null,
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

let seqOc = 0;
const oc = (medicoId: string, p: Partial<OcorrenciaRodada> = {}): OcorrenciaRodada => ({
  alocacaoId: `aloc${++seqOc}`,
  medicoId,
  turnoId: 'manha',
  turnoTipo: 'fixo',
  frente: FRENTE_MI,
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

const exame = (id: string, p: Partial<ExameElegivel> = {}): ExameElegivel => ({
  id,
  especialidadeId: MI,
  especialidadesDoSegmento: [],
  modalidadeId: CT,
  subespecialidadeId: null,
  prioridadeId: ROTINA,
  exameId: null,
  clienteId: null,
  restanteMin: 3000,
  entregues: [],
  ...p,
});

const medico = (
  id: string,
  arranjos: Arranjo[] = [arranjo()],
  extra: Partial<EntradaMedicos['medicos'][number]> = {},
) => ({
  id,
  nome: id,
  arranjos,
  cargaEmMaos: 0,
  cargaReservadaEmMaos: 0,
  ...extra,
});

const montar = (p: Partial<EntradaMedicos>) =>
  montarMedicosDisponiveis({
    agora: br('2026-11-17T08:00'),
    exames: [exame('e1')],
    medicos: [medico('A')],
    ocorrencias: [oc('A')],
    equipes: [],
    ajustes: [],
    regras: new RegrasPorFrente([]),
    config: CONFIG,
    cotaEntregue: {},
    ...p,
  });
const doMedico = (r: ReturnType<typeof montar>, id: string) => r.medicos.find((m) => m.id === id);

describe('montarMedicosDisponiveis: quem está na rodada', () => {
  it('ausente, turno encerrado e turno longe demais ficam de fora', () => {
    const r = montar({
      medicos: [medico('A'), medico('B'), medico('C'), medico('D')],
      ocorrencias: [
        oc('A'),
        oc('B', { ausente: true }),
        oc('C', { inicio: br('2026-11-17T01:00'), fim: br('2026-11-17T07:00') }),
        oc('D', { inicio: br('2026-11-17T13:00'), fim: br('2026-11-17T19:00') }),
      ],
    });
    expect(r.medicos.map((m) => m.id)).toEqual(['A']);
    expect(r.funil.medicos).toEqual({ escalados: 4, disponiveis: 3, noTurno: 3, noHorario: 1 });
  });

  it('turno marcado no filtro da rodada entra cheio; os outros turnos saem', () => {
    const r = montar({
      medicos: [medico('A'), medico('D')],
      ocorrencias: [
        oc('A'),
        oc('D', { turnoId: 'tarde', inicio: br('2026-11-17T13:00'), fim: br('2026-11-17T19:00') }),
      ],
      filtroTurnoIds: ['tarde'],
    });
    expect(r.medicos.map((m) => m.id)).toEqual(['D']);
    expect(doMedico(r, 'D')?.capacidade).toBe(20);
  });

  it('a Lista de quem está num turno marcado entra junto e soma (Jainy)', () => {
    const r = montar({
      ocorrencias: [
        oc('A', { turnoId: 'tarde', produtividade: 30 }),
        oc('A', {
          turnoId: 'lista',
          turnoTipo: 'lista',
          produtividade: 100,
          fim: br('2026-11-18T07:00'),
        }),
      ],
      filtroTurnoIds: ['tarde'],
    });
    expect(doMedico(r, 'A')?.capacidade).toBe(130);
  });

  it('plantão de ontem que vira a meia-noite entra; o de hoje, ainda longe, não', () => {
    const r = montar({
      agora: br('2026-11-17T00:30'),
      ocorrencias: [
        oc('A', {
          turnoId: 'noite',
          inicio: br('2026-11-16T19:00'),
          fim: br('2026-11-17T07:00'),
          produtividade: 24,
        }),
        oc('A', {
          turnoId: 'noite',
          inicio: br('2026-11-17T19:00'),
          fim: br('2026-11-18T07:00'),
          produtividade: 24,
          ausente: true,
        }),
      ],
    });
    expect(doMedico(r, 'A')?.capacidade).toBe(24);
  });

  it('a carga em mãos do recorte exclusivo sai da carga do teto', () => {
    const r = montar({
      medicos: [medico('A', [arranjo()], { cargaEmMaos: 16, cargaReservadaEmMaos: 13 })],
    });
    expect(doMedico(r, 'A')).toMatchObject({ cargaInicial: 3, cargaReservada: 13 });
  });
});

describe('montarMedicosDisponiveis: escala gratificada', () => {
  it('a cota é a produtividade menos o já executado; só gratificado tem capacidade comum zero', () => {
    const grat = oc('A', { gratificado: true, produtividade: 8, alocacaoId: 'g1' });
    const r = montar({ ocorrencias: [grat], cotaEntregue: { g1: 3 } });
    expect(doMedico(r, 'A')).toMatchObject({ capacidade: 0, cotaGratificada: 5 });
    expect(doMedico(r, 'A')?.gratificadoPara('e1')).toBe(true);
    expect(r.gratificadoPara('A', 'e1')).toBe('g1');
  });

  it('cota fechada não abate', () => {
    const r = montar({
      ocorrencias: [oc('A', { gratificado: true, produtividade: 8, alocacaoId: 'g1' })],
      cotaEntregue: { g1: 8 },
    });
    expect(doMedico(r, 'A')?.gratificadoPara('e1')).toBe(false);
  });
});

describe('montarMedicosDisponiveis: elegibilidade', () => {
  it('o período decide: a Lista da frente barra a rotina curta', () => {
    const regras = new RegrasPorFrente([
      {
        ...REGRAS_NEUTRAS,
        frente: FRENTE_MI,
        listaPrioridadeIds: [ROTINA],
        listaPrazoMinimoHoras: 24,
      },
    ]);
    const r = montar({
      regras,
      exames: [exame('curto', { restanteMin: 60 }), exame('longo', { restanteMin: 2000 })],
      ocorrencias: [oc('A', { turnoTipo: 'lista', fim: br('2026-11-18T07:00') })],
    });
    expect(doMedico(r, 'A')?.elegivelPara('curto')).toBe(false);
    expect(doMedico(r, 'A')?.elegivelPara('longo')).toBe(true);
    expect(r.etapaElegibilidade.get('curto')).toBe('escala');
  });

  it('o arranjo decide depois da escala', () => {
    const r = montar({ medicos: [medico('A', [arranjo({ especialidadeId: MSK })])] });
    expect(doMedico(r, 'A')?.elegivelPara('e1')).toBe(false);
    expect(r.etapaElegibilidade.get('e1')).toBe('arranjo');
  });

  it('a escala que nomeia o segmento fura o recorte de segmento do arranjo', () => {
    const r = montar({
      medicos: [medico('A', [arranjo({ especialidadeId: MSK, subespecialidadeGeral: true })])],
      ocorrencias: [oc('A', { frente: FRENTE_MSK, subespecialidadeIds: ['colunas'] })],
      exames: [exame('col', { especialidadeId: MSK, subespecialidadeId: 'colunas' })],
    });
    expect(doMedico(r, 'A')?.elegivelPara('col')).toBe(true);
  });

  it('o recorte de equipe é só dos membros; a de plantão não vai a ninguém', () => {
    const doCliente = arranjo({ modoClientes: 'apenas', clienteIds: ['cli'] });
    const exames = [exame('e1', { clienteId: 'cli' })];
    const base = { exames, medicos: [medico('A'), medico('B')], ocorrencias: [oc('A'), oc('B')] };
    const r = montar({
      ...base,
      equipes: [{ membros: ['A'], arranjos: [doCliente], plantao: false }],
    });
    expect(doMedico(r, 'A')?.elegivelPara('e1')).toBe(true);
    expect(doMedico(r, 'B')?.elegivelPara('e1')).toBe(false);
    const p = montar({
      ...base,
      equipes: [{ membros: ['A'], arranjos: [doCliente], plantao: true }],
    });
    expect(doMedico(p, 'A')?.elegivelPara('e1')).toBe(false);
    expect(p.etapaElegibilidade.get('e1')).toBe('plantao');
  });

  it('clínica exclusiva: só os exclusivos recebem, fora do teto', () => {
    const exclusivo = arranjo({ especialidadeId: MI, clientesExclusivosIds: ['CLI'] });
    const r = montar({
      exames: [exame('e1', { clienteId: 'CLI' })],
      medicos: [medico('A', [exclusivo]), medico('B')],
      ocorrencias: [oc('A'), oc('B')],
    });
    expect(doMedico(r, 'A')?.reservadoPara('e1')).toBe(true);
    expect(doMedico(r, 'B')?.elegivelPara('e1')).toBe(false);
  });

  it('a clínica exclusiva de quem não está na rodada barra os outros', () => {
    const exclusivo = arranjo({ especialidadeId: MI, clientesExclusivosIds: ['CLI'] });
    const r = montar({
      exames: [exame('e1', { clienteId: 'CLI' })],
      medicos: [medico('A', [exclusivo]), medico('B')],
      ocorrencias: [oc('B')],
    });
    expect(doMedico(r, 'B')?.elegivelPara('e1')).toBe(false);
    expect(r.etapaElegibilidade.get('e1')).toBe('reservado');
  });

  it('nunca volta ao médico de quem foi retirado nos últimos N dias', () => {
    const r = montar({
      exames: [
        exame('recente', { entregues: [{ medicoId: 'A', em: br('2026-11-14T10:00') }] }),
        exame('antigo', { entregues: [{ medicoId: 'A', em: br('2026-11-05T10:00') }] }),
      ],
    });
    expect(doMedico(r, 'A')?.elegivelPara('recente')).toBe(false);
    expect(r.etapaElegibilidade.get('recente')).toBe('retirado');
    expect(doMedico(r, 'A')?.elegivelPara('antigo')).toBe(true);
  });

  it('horário sem robô fecha só o período fixo que começa nele (o plantão), não a Lista', () => {
    const regras = new RegrasPorFrente([
      {
        ...REGRAS_NEUTRAS,
        frente: FRENTE_CT,
        horariosSemRobo: [{ diasSemana: [], inicio: '19:00', fim: '07:00' }],
      },
    ]);
    const agora = br('2026-11-17T06:42');
    const plantao = oc('P', {
      turnoId: 'noite',
      inicio: br('2026-11-16T19:00'),
      fim: br('2026-11-17T07:00'),
    });
    const lista = oc('L', {
      turnoTipo: 'lista',
      inicio: br('2026-11-16T07:00'),
      fim: br('2026-11-17T07:00'),
    });
    const r = montar({
      agora,
      regras,
      medicos: [medico('P'), medico('L')],
      ocorrencias: [plantao, lista],
    });
    expect(doMedico(r, 'P')?.elegivelPara('e1')).toBe(false);
    expect(doMedico(r, 'L')?.elegivelPara('e1')).toBe(true);
  });

  it('cobertura: o titular é marcado quando só a escala coberta aceita o exame', () => {
    const r = montar({ ocorrencias: [oc('A', { coberturaDeId: 'TIT' })] });
    expect(r.coberturaPara('A', 'e1')).toBe('TIT');
  });

  it('segmento único pelo arranjo ou pelos períodos', () => {
    const r = montar({
      medicos: [medico('A', [arranjo({ subespecialidadeIds: ['cp'] })]), medico('B')],
      ocorrencias: [oc('A'), oc('B', { subespecialidadeIds: ['cp'] })],
    });
    expect(doMedico(r, 'A')?.segmentoUnico).toBe('cp');
    expect(doMedico(r, 'B')?.segmentoUnico).toBe('cp');
  });
});

describe('montarMedicosDisponiveis: ajuste do dia', () => {
  const ajuste = (p: Partial<AjusteDia> = {}): AjusteDia => ({
    medicoId: 'A',
    laudosExtra: 10,
    prioridadeIdsLiberadas: [],
    listaSegueSla: false,
    recorte: {
      clienteId: null,
      especialidadeId: null,
      modalidadeId: null,
      subespecialidadeId: null,
    },
    inicio: br('2026-11-17T07:00'),
    fim: br('2026-11-17T19:00'),
    ...p,
  });

  it('laudos extras no recorte e na vigência; sobrepostos vale o maior', () => {
    const r = montar({
      exames: [exame('x', { clienteId: 'X' }), exame('y', { clienteId: 'Y' })],
      ajustes: [
        ajuste({
          recorte: {
            clienteId: 'X',
            especialidadeId: null,
            modalidadeId: null,
            subespecialidadeId: null,
          },
        }),
        ajuste({ laudosExtra: 4 }),
      ],
    });
    expect(doMedico(r, 'A')?.extraPara('x')).toBe(10);
    expect(doMedico(r, 'A')?.extraPara('y')).toBe(4);
    const fora = montar({ agora: br('2026-11-17T06:00'), ajustes: [ajuste()] });
    expect(doMedico(fora, 'A')?.extraPara('e1')).toBe(0);
  });

  it('prioridade liberada fura o arranjo e o recorte do período', () => {
    const base = {
      medicos: [medico('A', [arranjo({ prioridadeIds: [ROTINA] })])],
      exames: [exame('u', { prioridadeId: URGENCIA })],
    };
    expect(doMedico(montar(base), 'A')?.elegivelPara('u')).toBe(false);
    const r = montar({
      ...base,
      ajustes: [ajuste({ laudosExtra: 0, prioridadeIdsLiberadas: [URGENCIA] })],
    });
    expect(doMedico(r, 'A')?.elegivelPara('u')).toBe(true);
  });

  it('"a Lista segue o SLA" tira a regra da Lista e, antes da cheia, guarda o curto para o turno posterior', () => {
    const regras = new RegrasPorFrente([
      {
        ...REGRAS_NEUTRAS,
        frente: FRENTE_MI,
        listaPrioridadeIds: [ROTINA],
        listaPrazoMinimoHoras: 24,
      } as RegrasFrente,
    ]);
    const lista = oc('A', {
      turnoId: 'lista',
      turnoTipo: 'lista',
      fim: br('2026-11-18T07:00'),
      produtividade: 30,
    });
    const tarde = oc('T', {
      turnoId: 'tarde',
      inicio: br('2026-11-17T13:00'),
      fim: br('2026-11-17T19:00'),
      produtividade: 1,
    });
    const exames = [exame('curto', { restanteMin: 120 }), exame('depois', { restanteMin: 900 })];
    const config = { ...CONFIG, turnosPosteriores: { turnoIds: ['tarde'], cheiaEm: '10:50' } };
    const r = montar({
      regras,
      config,
      exames,
      medicos: [medico('A'), medico('T')],
      ocorrencias: [lista, tarde],
      ajustes: [ajuste({ laudosExtra: 0, listaSegueSla: true })],
    });
    expect(doMedico(r, 'A')?.elegivelPara('curto')).toBe(false);
    expect(r.guardadosParaPosteriores.has('curto')).toBe(true);
    expect(doMedico(r, 'A')?.elegivelPara('depois')).toBe(true);
    // A Tarde tem vaga para 1 dos 1 guardados: nada a reservar na Lista.
    expect(doMedico(r, 'A')?.capacidade).toBe(30);
  });
});
