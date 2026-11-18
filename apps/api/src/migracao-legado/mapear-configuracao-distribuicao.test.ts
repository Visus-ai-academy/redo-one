import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type {
  LegadoCatalogo,
  LegadoConfiguracaoDistribuicao,
  LegadoConfiguracaoRobo,
  LegadoPolitica,
} from './legado';
import { mapearCatalogo } from './mapear-catalogo';
import { mapearConfiguracaoDistribuicao } from './mapear-configuracao-distribuicao';

const lista = { descricao: null, cor: null, ordem: 0, ativo: true };

const legadoCatalogo: LegadoCatalogo = {
  modalidades: ['CT', 'MR', 'RX'].map((nome) => ({ id: `mo-${nome}`, nome, ...lista })),
  especialidades: [
    { id: 'es-neuro', nome: 'NEURO', ...lista },
    { id: 'es-mi', nome: 'MEDICINA INTERNA', ...lista },
    { id: 'es-msk', nome: 'MUSCULO ESQUELETICO', ...lista },
    { id: 'es-mama', nome: 'MAMA', ...lista },
    { id: 'es-mamo', nome: 'MAMO', ...lista },
    { id: 'es-cardio', nome: 'CARDIO', ...lista },
    { id: 'es-tc', nome: 'TC', ...lista, modalidade: 'CT' },
  ],
  subespecialidades: ['CABEÇA E PESCOÇO', 'COLUNAS', 'ANGIO', 'CRÂNIO'].map((nome) => ({
    id: `su-${nome}`,
    nome,
    ...lista,
  })),
  subespecialidadesEspecialidades: [],
  categorias: [],
  prioridades: [
    { id: 'pr-rot', nome: 'ROTINA', ...lista },
    { id: 'pr-urg', nome: 'URGÊNCIA', ...lista },
  ],
  prioridadesUrgentes: [],
  prioridadesDePara: [
    { id: 'pd-int', prioridadeOriginal: 'Internado', nomeFinal: 'ROTINA', ativo: true },
    { id: 'pd-eme', prioridadeOriginal: 'Emergência', nomeFinal: 'URGÊNCIA', ativo: true },
  ],
  especialidadeRegras: [],
  exames: [],
  regrasQuebra: [],
  examesForaPadrao: [],
  contratados: [],
  clientes: ['A', 'B'].map((n) => ({
    id: `cl-${n}`,
    nome: `CLINICA ${n}`,
    nomeFantasia: null,
    razaoSocial: null,
    cnpj: null,
    cpf: null,
    tipoPessoa: null,
    contratadoId: null,
    ativo: true,
    observacoes: null,
  })),
  clientesOcultos: [],
  clienteNomeAliases: [],
  clienteApelidos: [],
};

const catalogo = mapearCatalogo(legadoCatalogo).tabelas;
const esp = (nome: string) => catalogo.especialidades.find((e) => e.nome === nome)?.id as string;
const mod = (codigo: string) => catalogo.modalidades.find((m) => m.codigo === codigo)?.id as string;
const sub = (nome: string) => catalogo.subespecialidades.find((s) => s.nome === nome)?.id as string;
const turnos = [
  { id: 'tu-manha', nome: 'Manhã', tipo: 'fixo' as const },
  { id: 'tu-tarde', nome: 'Tarde', tipo: 'fixo' as const },
  { id: 'tu-lista', nome: 'Lista', tipo: 'lista' as const },
];

const config: LegadoConfiguracaoRobo = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
  prioridadesUrgentes: ['URGENCIA', 'EMERGENCIA', 'INTERNADO'],
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  escalaRestringeEspecialidade: true,
  toleranciaAcimaCapacidade: 0,
  reservaUrgenciaPct: 10,
  folgaAtrasadoPct: 20,
  cicloMinutos: 30,
  marcadoresEquilibrio: ['ONCO'],
  listaPrioridades: ['Rotina'],
  listaPrazoMinimoHoras: 24,
  roboRecolherAposTurnoMin: 60,
  roboAtivo: true,
  roboExpiracaoMin: 45,
  roboTetoPorRodada: null,
  roboListaDepoisDosFixos: [],
};

const politica = (p: Partial<LegadoPolitica>): LegadoPolitica => ({
  id: 'p',
  escopo: 'especialidade',
  especialidade: null,
  modalidade: null,
  ativo: true,
  automatico: true,
  metodoDivisao: 'igualitario',
  proporcoes: null,
  loteTamanho: null,
  cotaValor: null,
  cotaJanela: null,
  pesos: null,
  tetosSubespecialidade: null,
  ...p,
});

const producao: LegadoConfiguracaoDistribuicao = {
  config,
  politicas: [
    politica({ id: 'g', escopo: 'global' }),
    politica({
      id: 'mi',
      especialidade: 'MEDICINA INTERNA',
      metodoDivisao: 'proporcao',
      proporcoes: { CT: 40, MR: 60 },
    }),
    politica({
      id: 'msk-rx',
      escopo: 'especialidade_modalidade',
      especialidade: 'MUSCULO ESQUELETICO',
      modalidade: 'RX',
    }),
    politica({ id: 'msk', especialidade: 'MUSCULO ESQUELETICO' }),
    politica({ id: 'cardio', especialidade: 'CARDIO' }),
    politica({
      id: 'neuro',
      especialidade: 'NEURO',
      tetosSubespecialidade: {
        'CABEÇA E PESCOÇO': { max: 7, reduzido: { max: 4, produtividadeAte: 15 } },
      },
    }),
    politica({ id: 'mama', especialidade: 'MAMA' }),
  ],
  janelas: [
    {
      id: 'j1',
      nome: 'Plantão de TC',
      diasSemana: [],
      horaInicio: '19:00',
      horaFim: '07:00',
      modalidade: 'CT',
      especialidade: null,
      ativo: true,
    },
  ],
  prioridadesCliente: [
    { clienteId: 'cl-A', especialidadeId: 'es-mi', nivel: 1 },
    { clienteId: 'cl-B', especialidadeId: 'es-tc', nivel: 2 },
    { clienteId: 'cl-sumiu', especialidadeId: 'es-mi', nivel: 1 },
  ],
};

const mapear = (legado = producao) =>
  mapearConfiguracaoDistribuicao(legado, { legadoCatalogo, catalogo, turnos });

const regrasDa = (m: ReturnType<typeof mapear>, id: string) =>
  m.regrasFrente.find((r) => (r.frente.especialidadeId ?? r.frente.modalidadeId) === id);

describe('mapearConfiguracaoDistribuicao', () => {
  it('configuração global com os valores de produção', () => {
    const { configuracao, avisos } = mapear();
    expect(configuracao).toEqual({
      ordemFila: config.ordemFila,
      agruparPorPaciente: true,
      janelaPacienteHoras: 0,
      toleranciaAcimaTeto: 0,
      margemUrgenciaPct: 10,
      folgaProporcaoPct: 20,
      prazoCriticoMin: 60,
      antecedenciaPeriodoMin: 180,
      cicloMinutos: 30,
      marcadoresEquilibrio: ['ONCO'],
      escalaRestringeEspecialidade: true,
      diasJaEntregue: 7,
      turnosPosteriores: { turnoIds: ['tu-tarde'], cheiaEm: '10:50' },
      recolhimentoAposTurnoMin: 60,
      recolhimentoAposListaMin: 1440,
      roboAtivo: true,
      expiracaoPropostaMin: 45,
      tetoPorRodada: null,
    });
    expect(avisos.filter((a) => a.tabela === 'configuracao_distribuicao')).toEqual([]);
  });

  it('prioridades da operação dos valores aprovados (18/11/2026), com o de-para sem repetir grafia', () => {
    const { prioridadesOperacao } = mapear();
    expect(
      prioridadesOperacao.map((p) => [p.nome, p.posicao, p.urgencia, p.padrao, p.grafias]),
    ).toEqual([
      [
        'URGÊNCIA',
        1,
        { tipo: 'sempre' },
        false,
        ['Emergência', 'P1', 'P1.Imediato', 'P2', 'P2.Urgente', 'Urgência', 'Urgente'],
      ],
      ['AMBULATÓRIO', 2, { tipo: 'prazo', horas: 24 }, false, ['Ambulatório']],
      ['INTERNADO', 3, { tipo: 'nunca' }, false, ['Internado', 'P3', 'P3.Internado']],
      ['ROTINA', 3, { tipo: 'nunca' }, true, ['P4', 'P4.Rotina+', 'P5', 'P5.Rotina', 'Rotina']],
      ['PLANTÃO', 3, { tipo: 'nunca' }, false, ['Plantão']],
    ]);
    // Ids estáveis: a carga de novo atualiza as mesmas.
    expect(prioridadesOperacao[0]?.id).toBe(idDoLegado('prioridades_operacao', 'URGÊNCIA'));
  });

  it('grade geral: só a Lista tem célula (24 h nas rotinas, URGÊNCIA e PLANTÃO não entram)', () => {
    const { prioridadesOperacao, gradeRecebimento } = mapear();
    const nome = (id: string) => prioridadesOperacao.find((p) => p.id === id)?.nome;
    expect(gradeRecebimento.map((c) => [nome(c.prioridadeOperacaoId), c.turnoId, c.regra])).toEqual(
      [
        ['AMBULATÓRIO', 'tu-lista', { tipo: 'prazo_minimo', horas: 24 }],
        ['INTERNADO', 'tu-lista', { tipo: 'prazo_minimo', horas: 24 }],
        ['ROTINA', 'tu-lista', { tipo: 'prazo_minimo', horas: 24 }],
        ['URGÊNCIA', 'tu-lista', { tipo: 'nao_recebe' }],
        ['PLANTÃO', 'tu-lista', { tipo: 'nao_recebe' }],
      ],
    );
  });

  it('sem a linha de configuração no dashboards-one, não grava configuração', () => {
    expect(mapear({ ...producao, config: null }).configuracao).toBeNull();
  });

  it('MEDICINA INTERNA: proporção MR 60 / CT 40', () => {
    expect(regrasDa(mapear(), esp('MEDICINA INTERNA'))?.divisao).toEqual({
      metodo: 'proporcao',
      proporcoes: [
        { modalidadeId: mod('CT'), percentual: 40 },
        { modalidadeId: mod('MR'), percentual: 60 },
      ].sort((a, b) => (a.modalidadeId < b.modalidadeId ? -1 : 1)),
    });
  });

  it('NEURO: teto de CABEÇA E PESCOÇO (7, reduzido 4 até 15, sem piso gravado) e a mistura do neurologista', () => {
    const neuro = regrasDa(mapear(), esp('NEURO'));
    expect(neuro?.segmentos).toEqual([
      {
        subespecialidadeId: sub('CABEÇA E PESCOÇO'),
        teto: 7,
        tetoReduzido: { produtividadeAte: 15, teto: 4 },
        piso: null,
        pacoteAParte: false,
      },
    ]);
    expect(neuro?.mistura).toEqual([
      { especialidadeId: null, subespecialidadeId: sub('COLUNAS') },
      { especialidadeId: esp('NEURO'), subespecialidadeId: sub('ANGIO') },
      { especialidadeId: esp('NEURO'), subespecialidadeId: sub('CRÂNIO') },
      { especialidadeId: esp('NEURO'), subespecialidadeId: null },
      { especialidadeId: esp('MUSCULO ESQUELETICO'), subespecialidadeId: null },
    ]);
  });

  it('MSK: COLUNAS em pacote à parte', () => {
    expect(regrasDa(mapear(), esp('MUSCULO ESQUELETICO'))?.segmentos).toEqual([
      {
        subespecialidadeId: sub('COLUNAS'),
        teto: null,
        tetoReduzido: null,
        piso: null,
        pacoteAParte: true,
      },
    ]);
  });

  it('MAMA e CARDIO: não recolhem e a Lista segue o SLA nas rotinas (URGÊNCIA e PLANTÃO como na geral)', () => {
    const m = mapear();
    const nome = (id: string) => m.prioridadesOperacao.find((p) => p.id === id)?.nome;
    for (const frente of ['MAMA', 'CARDIO']) {
      const r = regrasDa(m, esp(frente));
      expect(r?.recolheAoFimDoTurno).toBe(false);
      expect(r?.recebimento.map((c) => [nome(c.prioridadeOperacaoId), c.turnoId, c.regra])).toEqual(
        [
          ['AMBULATÓRIO', 'tu-lista', { tipo: 'segue_sla' }],
          ['INTERNADO', 'tu-lista', { tipo: 'segue_sla' }],
          ['ROTINA', 'tu-lista', { tipo: 'segue_sla' }],
        ].sort((a, b) => {
          const id = (n: unknown) => m.prioridadesOperacao.find((p) => p.nome === n)?.id ?? '';
          return id(a[0]) < id(b[0]) ? -1 : 1;
        }),
      );
    }
  });

  it('janela sem automação de CT vira horário sem robô da frente CT', () => {
    expect(regrasDa(mapear(), mod('CT'))?.horariosSemRobo).toEqual([
      { diasSemana: [], inicio: '19:00', fim: '07:00' },
    ]);
  });

  it('frente sem nada (global, MSK × RX igualitária) não vira cadastro; teto e lote não migram', () => {
    const m = mapear({
      ...producao,
      politicas: [
        ...producao.politicas,
        politica({
          id: 'rx',
          escopo: 'modalidade',
          modalidade: 'RX',
          cotaValor: 150,
          cotaJanela: 'dia',
        }),
      ],
    });
    expect(regrasDa(m, mod('RX'))).toBeUndefined();
    expect(m.avisos.some((a) => /150/.test(a.motivo))).toBe(true);
    expect(m.regrasFrente).toHaveLength(6);
  });

  it('política manual (automatico = false) desliga o robô na frente', () => {
    const m = mapear({
      ...producao,
      politicas: [politica({ id: 'x', escopo: 'modalidade', modalidade: 'RX', automatico: false })],
    });
    expect(regrasDa(m, mod('RX'))?.distribuiPeloRobo).toBe(false);
  });

  it('prioridade do cliente: especialidade ou frente de modalidade; cliente que não migrou sai com aviso', () => {
    const m = mapear();
    expect(m.prioridadesCliente).toEqual([
      {
        clienteId: idDoLegado('clientes', 'cl-A'),
        itens: [
          {
            frente: {
              tipo: 'especialidade',
              especialidadeId: esp('MEDICINA INTERNA'),
              modalidadeId: null,
            },
            nivel: 1,
          },
        ],
      },
      {
        clienteId: idDoLegado('clientes', 'cl-B'),
        itens: [
          {
            frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: mod('CT') },
            nivel: 2,
          },
        ],
      },
    ]);
    expect(m.avisos.some((a) => a.tabela === 'prioridades_cliente')).toBe(true);
  });
});
