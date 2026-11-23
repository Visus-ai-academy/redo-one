import { describe, expect, it } from 'vitest';

import type { Arranjo } from '../arranjo';
import { type ConfiguracaoDistribuicao, REGRAS_NEUTRAS } from './configuracao';
import type { OcorrenciaRodada } from './medicos-disponiveis';
import type { CelulaRecebimento, PrioridadeOperacao } from './prioridades-operacao';
import { type EntradaRodada, type ExameFilaRodada, rodarMotor } from './rodada';

const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const MI = 'esp-mi';
const CT = 'mod-ct';
const CARDIO = 'esp-cardio';
/** As prioridades da operação dos valores iniciais (18 e 19/11/2026), resumidas. */
const op = (
  id: string,
  posicao: number,
  urgencia: PrioridadeOperacao['urgencia'],
  grafias: string[],
  padrao = false,
): PrioridadeOperacao => ({
  id,
  nome: id,
  posicao,
  urgencia,
  furaGradeNaAlocacao: id === 'op-urgencia',
  padrao,
  grafias,
  cor: null,
});
const PRIORIDADES_OPERACAO = [
  op('op-urgencia', 1, { tipo: 'sempre' }, ['Urgência', 'Emergência']),
  op('op-ambulatorio', 2, { tipo: 'prazo', horas: 24 }, ['Ambulatório']),
  op('op-internado', 3, { tipo: 'sempre' }, ['Internado']),
  op('op-rotina', 3, { tipo: 'nunca' }, ['Rotina'], true),
];

const CONFIG: ConfiguracaoDistribuicao = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
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
const medico = (
  id: string,
  arranjos: Arranjo[] = [arranjo()],
  extra: { cargaEmMaos?: number } = {},
) => ({
  id,
  nome: id,
  arranjos,
  cargaEmMaos: 0,
  cargaReservadaEmMaos: 0,
  ...extra,
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
    prioridadesOperacao: PRIORIDADES_OPERACAO,
    gradeRecebimento: [],
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

  it('Internado é urgência na operação, e só o recebe quem marca INTERNADO (19/11/2026)', () => {
    const exames = [
      exame({ id: 'rot', prazo: br('2026-11-17T09:00') }),
      exame({ id: 'int', prioridade: 'INTERNADO' }),
    ];
    const comInternado = ['op-rotina', 'op-internado'];
    const r = rodar({
      exames,
      medicos: [medico('A', [arranjo({ prioridadeIds: comInternado })])],
      ocorrencias: [oc('A', { prioridadeIds: comInternado, produtividade: 1 })],
    });
    expect(item(r, 'int')?.medicoId).toBe('A');
    expect(item(r, 'rot')?.motivo).toBe('sem_espaco');
    // "Só ROTINA" na alocação ou no arranjo: o Internado não vai (no legado, a grafia não casava).
    for (const soRotina of [
      { medicos: [medico('A', [arranjo({ prioridadeIds: ['op-rotina'] })])] },
      { ocorrencias: [oc('A', { prioridadeIds: ['op-rotina'] })] },
    ]) {
      expect(item(rodar({ exames, ...soRotina }), 'int')).toMatchObject({
        medicoId: null,
        motivo: 'sem_medico_elegivel',
      });
    }
  });

  it('o Internado segue a célula na Lista que marca URGÊNCIA e INTERNADO; só fura com a marca ligada nele (19/11)', () => {
    const grade: CelulaRecebimento[] = [
      {
        prioridadeOperacaoId: 'op-internado',
        turnoId: 'lista',
        regra: { tipo: 'prazo_minimo', horas: 48 },
      },
    ];
    const lista = oc('A', {
      alocacaoId: 'l-A',
      turnoId: 'lista',
      turnoTipo: 'lista',
      fim: br('2026-11-18T07:00'),
      prioridadeIds: ['op-rotina', 'op-urgencia', 'op-internado'],
    });
    const entrada = {
      exames: [exame({ id: 'int', prioridade: 'Internado' })],
      ocorrencias: [lista],
      gradeRecebimento: grade,
    };
    expect(item(rodar(entrada), 'int')).toMatchObject({
      medicoId: null,
      motivo: 'sem_medico_elegivel',
    });
    const furaNoInternado = PRIORIDADES_OPERACAO.map((p) =>
      p.id === 'op-internado' ? { ...p, furaGradeNaAlocacao: true } : p,
    );
    expect(item(rodar({ ...entrada, prioridadesOperacao: furaNoInternado }), 'int')?.medicoId).toBe(
      'A',
    );
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

  it('AMBULATÓRIO perto do prazo é urgência da operação; longe do prazo, não', () => {
    const exames = [
      exame({ id: 'rot', prazo: br('2026-11-17T09:00') }),
      exame({ id: 'amb', prioridade: 'Ambulatorio', prazo: br('2026-11-17T20:00') }),
    ];
    const r = rodar({ exames, ocorrencias: [oc('A', { produtividade: 1 })] });
    expect(item(r, 'amb')?.medicoId).toBe('A');
    expect(item(r, 'rot')?.motivo).toBe('sem_espaco');
  });

  it('a fila segue a posição da prioridade da operação, não o prazo', () => {
    const exames = [
      exame({ id: 'rot', prazo: br('2026-11-17T09:00') }),
      exame({ id: 'amb', prioridade: 'Ambulatório', prazo: br('2026-11-20T08:00') }),
    ];
    const r = rodar({ exames, ocorrencias: [oc('A', { produtividade: 1 })] });
    expect(item(r, 'amb')?.medicoId).toBe('A');
  });

  it('grafia sem de-para vale como a prioridade padrão e sai no aviso da rodada', () => {
    const r = rodar({
      exames: [exame({ id: 'x', prioridade: 'P9.Nova' }), exame({ prioridade: 'Rotina' })],
    });
    expect(item(r, 'x')?.medicoId).toBe('A');
    expect(r.grafiasSemDePara).toEqual(['P9.Nova']);
  });

  it('CARDIO ROTINA × Manhã = 48 h: o de 30 h não vai ao médico da Manhã de CARDIO, o de 50 h vai', () => {
    const doCardio = (id: string, horas: number) =>
      exame({
        id,
        especialidadeId: CARDIO,
        prazo: new Date(agora.getTime() + horas * 3_600_000),
      });
    const r = rodar({
      exames: [doCardio('30h', 30), doCardio('50h', 50)],
      ocorrencias: [
        oc('A', { frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null } }),
      ],
      regrasFrente: [
        {
          ...REGRAS_NEUTRAS,
          frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null },
          recebimento: [
            {
              prioridadeOperacaoId: 'op-rotina',
              turnoId: 'manha',
              regra: { tipo: 'prazo_minimo', horas: 48 },
            },
          ],
        },
      ],
    });
    expect(item(r, '30h')).toMatchObject({ medicoId: null, motivo: 'sem_medico_elegivel' });
    expect(item(r, '50h')?.medicoId).toBe('A');
  });

  it('na Lista sem URGÊNCIA, só quem marcou URGÊNCIA na alocação recebe a urgência', () => {
    const grade: CelulaRecebimento[] = [
      { prioridadeOperacaoId: 'op-urgencia', turnoId: 'lista', regra: { tipo: 'nao_recebe' } },
    ];
    const lista = (medicoId: string, prioridadeIds: string[]) =>
      oc(medicoId, {
        alocacaoId: `l-${medicoId}`,
        turnoId: 'lista',
        turnoTipo: 'lista',
        fim: br('2026-11-18T07:00'),
        prioridadeIds,
      });
    const r = rodar({
      exames: [exame({ id: 'u', prioridade: 'Urgência' })],
      medicos: [medico('A'), medico('B')],
      ocorrencias: [lista('A', ['op-rotina']), lista('B', ['op-rotina', 'op-urgencia'])],
      gradeRecebimento: grade,
    });
    expect(item(r, 'u')?.medicoId).toBe('B');
  });

  it('só exame NOVO entra', () => {
    const r = rodar({ exames: [exame({ id: 'velho', novo: false })] });
    expect(item(r, 'velho')).toMatchObject({ medicoId: null, motivo: 'nao_novo' });
  });

  it('recorte da rodada de clínica, com o motivo à vista', () => {
    const r = rodar({
      exames: [exame({ id: 'x', clienteId: 'X' }), exame({ id: 'y', clienteId: 'Y' })],
      filtro: { clienteIds: ['X'] },
      nomes: { X: 'CLÍNICA X' },
    });
    expect(item(r, 'x')?.medicoId).toBe('A');
    expect(item(r, 'y')).toMatchObject({
      motivo: 'fora_da_clinica',
      detalhe: 'A rodada distribui só CLÍNICA X.',
    });
  });

  it('recorte pela prioridade da operação, sem partir o pacote do paciente', () => {
    const r = rodar({
      exames: [
        exame({ id: 'u', prioridade: 'Urgência', paciente: 'P1' }),
        exame({ id: 'r1', paciente: 'P1' }),
        exame({ id: 'r2', paciente: 'P2' }),
      ],
      filtro: { prioridadeOperacaoIds: ['op-urgencia'] },
      nomes: { 'op-urgencia': 'URGÊNCIA' },
    });
    expect(item(r, 'u')?.medicoId).toBe('A');
    expect(item(r, 'r1')?.medicoId).toBe('A');
    expect(item(r, 'r2')).toMatchObject({
      motivo: 'fora_da_prioridade',
      detalhe: 'A rodada distribui só URGÊNCIA.',
    });
  });

  it('recorte de subespecialidades: o exame de fora é recusado, sem partir o pacote do paciente', () => {
    const r = rodar({
      exames: [
        exame({ id: 'neuro', subespecialidadeId: 'seg-neuro', paciente: 'P1' }),
        exame({ id: 'mesmo-pacote', paciente: 'P1' }),
        exame({ id: 'sem-seg', paciente: 'P2' }),
        exame({ id: 'outro', subespecialidadeId: 'seg-msk', paciente: 'P3' }),
      ],
      filtro: { subespecialidadeIds: ['seg-neuro'] },
      nomes: { 'seg-neuro': 'NEURO' },
    });
    expect(item(r, 'neuro')?.medicoId).toBe('A');
    expect(item(r, 'mesmo-pacote')?.medicoId).toBe('A');
    for (const id of ['sem-seg', 'outro']) {
      expect(item(r, id)).toMatchObject({
        motivo: 'fora_da_subespecialidade',
        detalhe: 'A rodada distribui só NEURO.',
      });
    }
  });

  it('recorte de subespecialidades com o "sem subespecialidade": o exame sem segmento passa', () => {
    const r = rodar({
      exames: [exame({ id: 'sem-seg' }), exame({ id: 'outro', subespecialidadeId: 'seg-msk' })],
      filtro: { subespecialidadeIds: [], subespecialidadeGeral: true },
    });
    expect(item(r, 'sem-seg')?.medicoId).toBe('A');
    expect(item(r, 'outro')).toMatchObject({
      motivo: 'fora_da_subespecialidade',
      detalhe: 'A rodada distribui só Sem subespecialidade.',
    });
  });

  it('recorte de frentes: o exame de outra frente fica de fora, e o médico só entra pelo período da frente', () => {
    const NEURO = 'esp-neuro';
    const RX = 'mod-rx';
    const r = rodar({
      exames: [
        exame({ id: 'mi' }),
        exame({ id: 'neuro', especialidadeId: NEURO }),
        exame({ id: 'rx-mi', modalidadeId: RX }),
      ],
      medicos: [medico('A'), medico('B')],
      ocorrencias: [
        oc('A', { frente: { tipo: 'especialidade', especialidadeId: NEURO, modalidadeId: null } }),
        oc('B'),
      ],
      filtro: {
        frentes: [{ tipo: 'especialidade', especialidadeId: MI, modalidadeId: null }],
      },
      nomes: { [MI]: 'MEDICINA INTERNA' },
    });
    expect(item(r, 'mi')?.medicoId).toBe('B');
    expect(item(r, 'rx-mi')?.medicoId).toBe('B');
    expect(item(r, 'neuro')).toMatchObject({
      motivo: 'fora_da_frente',
      detalhe: 'A rodada distribui só MEDICINA INTERNA.',
    });
    expect(r.funil.medicos.noTurno).toBe(1);
  });

  it('médico incluído entra mesmo fora dos turnos e das frentes do recorte', () => {
    const r = rodar({
      exames: [exame({ id: 'mi' })],
      medicos: [medico('A')],
      ocorrencias: [oc('A', { turnoId: 'tarde' })],
      filtro: {
        turnoIds: ['manha'],
        frentes: [{ tipo: 'modalidade', especialidadeId: null, modalidadeId: CT }],
        medicosIncluidos: ['A'],
      },
    });
    expect(item(r, 'mi')?.medicoId).toBe('A');
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

  it('exame tirado do médico na conferência: o porquê diz a conferência', () => {
    const r = rodar({
      exames: [
        exame({
          id: 'ret',
          entregues: [{ medicoId: 'A', em: br('2026-11-16T10:00'), origem: 'conferencia' }],
        }),
      ],
    });
    expect(item(r, 'ret')).toMatchObject({ motivo: 'retirado_do_medico' });
    expect(item(r, 'ret')?.detalhe).toMatch(/conferência/);
    expect(item(r, 'ret')).toMatchObject({
      elegiveis: [],
      barrados: { A: 'retirado_na_conferencia' },
    });
  });

  it('devolve os médicos que entraram na rodada, com o teto e a carga em mãos', () => {
    const r = rodar({ medicos: [medico('A', undefined, { cargaEmMaos: 3 })] });
    expect(r.medicos).toEqual([
      expect.objectContaining({ id: 'A', capacidade: expect.any(Number), cargaEmMaos: 3 }),
    ]);
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

describe('rodarMotor: médicos fora da rodada', () => {
  it('diz, por médico, por que ele ficou de fora (com o nome do turno e a hora)', () => {
    const r = rodar({
      medicos: [
        medico('A'),
        { ...medico('Bruna'), nome: 'Bruna' },
        { ...medico('Caio'), nome: 'Caio' },
        { ...medico('Dora'), nome: 'Dora' },
        { ...medico('Eva'), nome: 'Eva' },
      ],
      ocorrencias: [
        oc('A'),
        oc('Bruna', {
          turnoId: 'tarde',
          inicio: br('2026-11-17T13:00'),
          fim: br('2026-11-17T19:00'),
        }),
        oc('Caio', { ausente: true }),
        oc('Dora', {
          turnoId: 'noite',
          inicio: br('2026-11-18T19:00'),
          fim: br('2026-11-19T07:00'),
        }),
        oc('Eva', { inicio: br('2026-11-17T01:00'), fim: br('2026-11-17T07:00') }),
      ],
      filtro: { turnoIds: ['manha', 'noite'] },
      config: { ...CONFIG, antecedenciaPeriodoMin: 60 },
      agora: br('2026-11-17T08:00'),
      nomes: { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' },
    });
    expect(r.foraDaRodada).toEqual([
      {
        id: 'Bruna',
        nome: 'Bruna',
        motivo: 'turno_nao_marcado',
        detalhe: 'Turno Tarde não marcado na rodada.',
      },
      {
        id: 'Caio',
        nome: 'Caio',
        motivo: 'ausente',
        detalhe: 'Ausente na escala (Manhã).',
      },
      {
        id: 'Dora',
        nome: 'Dora',
        motivo: 'turno_a_comecar',
        detalhe: 'Turno Noite só começa em 18/11 às 19:00, fora da antecedência.',
      },
      {
        id: 'Eva',
        nome: 'Eva',
        motivo: 'turno_encerrado',
        detalhe: 'Turno Manhã já tinha terminado na leitura.',
      },
    ]);
  });

  it('turno de hoje que começa depois da antecedência', () => {
    const r = rodar({
      medicos: [medico('A'), { ...medico('G'), nome: 'Gil' }],
      ocorrencias: [
        oc('A'),
        oc('G', { turnoId: 'tarde', inicio: br('2026-11-17T13:00'), fim: br('2026-11-17T19:00') }),
      ],
      nomes: { tarde: 'Tarde' },
    });
    expect(r.foraDaRodada).toEqual([
      {
        id: 'G',
        nome: 'Gil',
        motivo: 'turno_a_comecar',
        detalhe: 'Turno Tarde só começa às 13:00, fora da antecedência.',
      },
    ]);
  });

  it('frente desmarcada e sem conta na MobileMed', () => {
    const r = rodar({
      medicos: [
        medico('A'),
        { ...medico('F'), nome: 'Fábio' },
        { ...medico('H'), nome: 'Hugo', semContaMobilemed: true },
      ],
      ocorrencias: [
        oc('A'),
        oc('F', { frente: { tipo: 'especialidade', especialidadeId: CARDIO, modalidadeId: null } }),
        oc('H'),
      ],
      exames: [exame({ especialidadeId: MI })],
      filtro: { frentes: [{ tipo: 'especialidade', especialidadeId: MI, modalidadeId: null }] },
      nomes: { manha: 'Manhã', tarde: 'Tarde', [CARDIO]: 'Cardio' },
    });
    expect(r.foraDaRodada).toEqual([
      {
        id: 'F',
        nome: 'Fábio',
        motivo: 'frente_nao_marcada',
        detalhe: 'Frente Cardio (Manhã) não marcada na rodada.',
      },
      {
        id: 'H',
        nome: 'Hugo',
        motivo: 'sem_conta_mobilemed',
        detalhe:
          'Em turno (Manhã), mas sem o id da MobileMed no cadastro: o robô não tem como atribuir a ele.',
      },
    ]);
  });
});
