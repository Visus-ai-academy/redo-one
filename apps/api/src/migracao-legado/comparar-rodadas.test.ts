import { describe, expect, it } from 'vitest';

import type { PrioridadeOperacao } from '../distribuicao/domain/motor/prioridades-operacao';
import {
  type ComparacaoExame,
  cargaDosRecolhidos,
  compararExames,
  cotaEntregueDoLegado,
  entregasDoLegado,
  frentesPorRotulo,
  idExameDaDesignacao,
  instanteDaRodada,
  type LegadoDesignacaoRodada,
  type LegadoRodada,
  leituraDaRodada,
  recortesDaRodada,
  resumirComparacao,
} from './comparar-rodadas';
import { idDoLegado } from './comum';

const designacao = (p: Partial<LegadoDesignacaoRodada> = {}): LegadoDesignacaoRodada => ({
  rodadaId: 'r1',
  chaveExame: 'chave-1',
  nomePaciente: 'PACIENTE TESTE',
  estudoDescricao: 'RX TORAX',
  dataRealizacao: '2026-11-23T12:00:00.000Z',
  empresa: 'CLINICA X',
  prioridade: 'Rotina',
  modalidade: 'RX',
  especialidade: 'RX',
  subespecialidade: null,
  laudos: 1,
  dataPrazo: '2026-11-24T12:00:00.000Z',
  idExameMobilemed: 100,
  medicoId: null,
  status: 'pulada',
  motivo: 'sem_medico_elegivel',
  recolhidoDeId: null,
  alocacaoGratificadaId: null,
  executadaEm: null,
  ...p,
});

const rodada = (p: Partial<LegadoRodada> = {}): LegadoRodada => ({
  id: 'r1',
  criadoEm: '2026-11-23T19:30:15.000Z',
  aprovadaEm: null,
  status: 'concluida',
  automatica: true,
  turnoIds: [],
  frentes: [],
  prioridades: [],
  medicosExcluidos: [],
  medicosIncluidos: [],
  clientesPrioritarios: [],
  incluiFimDeSemana: false,
  cargas: [],
  ...p,
});

const prioridade = (p: Partial<PrioridadeOperacao> & { id: string }): PrioridadeOperacao => ({
  nome: p.id,
  posicao: 1,
  urgencia: { tipo: 'nunca' },
  furaGradeNaAlocacao: false,
  padrao: false,
  grafias: [],
  cor: null,
  ...p,
});

describe('instanteDaRodada', () => {
  it('é a aprovação (a prévia do robô automático é aprovada logo em seguida)', () => {
    const r = rodada({ aprovadaEm: '2026-11-23T19:33:44.000Z' });
    expect(instanteDaRodada(r).toISOString()).toBe('2026-11-23T19:33:44.000Z');
  });

  it('sem aprovação, é a criação', () => {
    expect(instanteDaRodada(rodada()).toISOString()).toBe('2026-11-23T19:30:15.000Z');
  });
});

describe('idExameDaDesignacao', () => {
  it('usa o id da MobileMed e, sem ele, a chave da linha', () => {
    expect(idExameDaDesignacao(designacao())).toBe('100');
    expect(idExameDaDesignacao(designacao({ idExameMobilemed: null }))).toBe('chave:chave-1');
  });
});

describe('leituraDaRodada', () => {
  it('monta a fila sem médico com o que a designação guardou, sem os recolhidos', () => {
    const leitura = leituraDaRodada([
      designacao({ laudos: 2 }),
      designacao({ idExameMobilemed: 101, recolhidoDeId: 'm-x' }),
    ]);
    expect(leitura.emMaos).toEqual([]);
    expect(leitura.semMedico).toHaveLength(1);
    expect(leitura.semMedico[0]).toEqual({
      idExame: '100',
      prioridade: 'Rotina',
      estudo: 'RX TORAX',
      unidade: 'CLINICA X',
      modalidade: 'RX',
      especialidade: 'RX',
      laudos: 2,
      realizadoEm: new Date('2026-11-23T12:00:00.000Z'),
      // O legado não guarda a entrada na fila: vale a realização (só desempata a antiguidade).
      entradaEm: new Date('2026-11-23T12:00:00.000Z'),
      prazo: new Date('2026-11-24T12:00:00.000Z'),
      status: 'NOVO',
      paciente: { codigo: null, nome: 'PACIENTE TESTE' },
    });
  });
});

describe('frentesPorRotulo', () => {
  it('casa o nome da especialidade do legado com a frente para onde as alocações dela migraram', () => {
    const mapa = frentesPorRotulo(
      [
        { id: 'a1', especialidade: 'MAMO' },
        { id: 'a2', especialidade: 'Musculo Esqueletico' },
        { id: 'a3', especialidade: 'SEM DESTINO' },
      ],
      new Map([
        [idDoLegado('alocacoes_medico', 'a1'), 'f-mg'],
        [idDoLegado('alocacoes_medico', 'a2'), 'f-msk'],
      ]),
    );
    expect(mapa.get('MAMO')).toBe('f-mg');
    expect(mapa.get('MUSCULO ESQUELETICO')).toBe('f-msk');
    expect(mapa.has('SEM DESTINO')).toBe(false);
  });
});

describe('recortesDaRodada', () => {
  const prioridades = [
    prioridade({ id: 'p-urg', grafias: ['Urgência', 'Emergência'] }),
    prioridade({ id: 'p-rot', grafias: ['Rotina'], padrao: true }),
  ];
  const frentes = new Map([
    ['RX', 'f-rx'],
    ['NEURO', 'f-neuro'],
  ]);

  it('traduz turnos, médicos, frentes (o segmento vale a frente inteira) e prioridades', () => {
    const { recortes, naoMapeados } = recortesDaRodada(
      rodada({
        turnoIds: ['t1'],
        frentes: ['RX', 'NEURO', 'NEURO · COLUNAS', 'MAMO'],
        prioridades: ['Urgência'],
        medicosExcluidos: ['m1'],
        medicosIncluidos: ['m2'],
      }),
      { frentePorRotulo: frentes, prioridadesOperacao: prioridades },
    );
    expect(recortes.turnoIds).toEqual([idDoLegado('turnos', 't1')]);
    expect(recortes.frenteIds).toEqual(['f-rx', 'f-neuro']);
    expect(recortes.prioridadeOperacaoIds).toEqual(['p-urg']);
    expect(recortes.medicosExcluidos).toEqual([idDoLegado('medicos', 'm1')]);
    expect(recortes.medicosIncluidos).toEqual([idDoLegado('medicos', 'm2')]);
    expect(recortes.subespecialidadeIds).toEqual([]);
    expect(naoMapeados).toEqual(['frente MAMO']);
  });

  it('a prioridade sem de-para fica de fora e é avisada (não vira a padrão)', () => {
    const { recortes, naoMapeados } = recortesDaRodada(rodada({ prioridades: ['Xpto'] }), {
      frentePorRotulo: frentes,
      prioridadesOperacao: prioridades,
    });
    expect(recortes.prioridadeOperacaoIds).toEqual([]);
    expect(naoMapeados).toEqual(['prioridade Xpto']);
  });
});

describe('entregasDoLegado', () => {
  it('são as execuções da janela anterior à rodada, pelo id do exame e com o médico do redo-one', () => {
    const agora = new Date('2026-11-23T19:00:00.000Z');
    const entregas = entregasDoLegado(
      [
        designacao({
          status: 'executada',
          medicoId: 'm1',
          executadaEm: '2026-11-23T10:00:00.000Z',
        }),
        // depois da rodada: não conta
        designacao({
          status: 'executada',
          medicoId: 'm2',
          executadaEm: '2026-11-23T20:00:00.000Z',
        }),
        // antes da janela de 7 dias
        designacao({
          status: 'executada',
          medicoId: 'm3',
          executadaEm: '2026-11-10T10:00:00.000Z',
        }),
        designacao({ status: 'pulada', medicoId: 'm4', executadaEm: null }),
      ],
      agora,
      7,
    );
    expect([...entregas.keys()]).toEqual(['100']);
    expect(entregas.get('100')).toEqual([
      {
        medicoId: idDoLegado('medicos', 'm1'),
        em: new Date('2026-11-23T10:00:00.000Z'),
        origem: 'execucao',
      },
    ]);
  });
});

describe('cotaEntregueDoLegado', () => {
  it('soma os laudos executados por alocação gratificada desde o início do plantão', () => {
    const alocacao = idDoLegado('alocacoes_medico', 'a1');
    const cota = cotaEntregueDoLegado(
      [
        designacao({
          status: 'executada',
          laudos: 2,
          alocacaoGratificadaId: 'a1',
          executadaEm: '2026-11-23T14:00:00.000Z',
        }),
        designacao({
          status: 'executada',
          laudos: 1,
          alocacaoGratificadaId: 'a1',
          executadaEm: '2026-11-23T08:00:00.000Z',
        }),
      ],
      [{ alocacaoId: alocacao, desde: new Date('2026-11-23T10:00:00.000Z') }],
      new Date('2026-11-23T19:00:00.000Z'),
    );
    expect(cota).toEqual({ [alocacao]: 2 });
  });
});

describe('cargaDosRecolhidos', () => {
  it('soma os laudos dos recolhidos que o legado propôs a cada médico (o redo-one não os simula)', () => {
    const carga = cargaDosRecolhidos([
      designacao({ recolhidoDeId: 'mx', medicoId: 'm1', laudos: 2 }),
      designacao({ recolhidoDeId: 'mx', medicoId: 'm1', laudos: 1 }),
      designacao({ recolhidoDeId: 'mx', medicoId: null }),
      designacao({ medicoId: 'm2' }),
    ]);
    expect([...carga]).toEqual([[idDoLegado('medicos', 'm1'), 3]]);
  });
});

describe('compararExames', () => {
  const m1 = idDoLegado('medicos', 'm1');
  const m2 = idDoLegado('medicos', 'm2');
  const redo = (idExame: string, medicoId: string | null, motivo: string | null = null) => ({
    idExame,
    medicoId,
    status: medicoId ? ('prevista' as const) : ('recusada' as const),
    motivo,
    elegiveis: [m1],
    barrados: { [m2]: 'escala' as const },
  });

  it('classifica cada exame pelo médico que cada lado propôs', () => {
    const linhas = compararExames(
      [
        designacao({ idExameMobilemed: 1, medicoId: 'm1', status: 'executada', motivo: null }),
        designacao({ idExameMobilemed: 2, medicoId: 'm2', status: 'executada', motivo: null }),
        designacao({
          idExameMobilemed: 3,
          medicoId: 'm2',
          status: 'pulada',
          motivo: 'ja_atribuido',
        }),
        designacao({ idExameMobilemed: 4 }),
        designacao({ idExameMobilemed: 5 }),
        designacao({ idExameMobilemed: 6, recolhidoDeId: 'mx', medicoId: 'm1' }),
      ],
      [
        redo('1', m1),
        redo('2', m1),
        redo('3', null, 'sem_medico_elegivel'),
        redo('4', m1),
        redo('5', null, 'sem_medico_elegivel'),
      ],
    );
    expect(linhas.map((l) => [l.idExame, l.categoria])).toEqual([
      ['1', 'mesmo_medico'],
      ['2', 'medico_diferente'],
      ['3', 'so_legado'],
      ['4', 'so_redo'],
      ['5', 'nenhum'],
      ['6', 'recolhido_fora'],
    ]);
    const l2 = linhas[1] as ComparacaoExame;
    expect(l2.medicoLegado).toBe(m2);
    expect(l2.medicoRedo).toBe(m1);
    expect(l2.medicoLegadoElegivelNoRedo).toBe(false);
    expect(l2.barreiraMedicoLegadoNoRedo).toBe('escala');
  });
});

describe('resumirComparacao', () => {
  it('conta a concordância sobre os exames comparáveis e a quantidade por médico', () => {
    const linha = (
      categoria: ComparacaoExame['categoria'],
      legado: string | null,
      redo: string | null,
    ) => ({ categoria, medicoLegado: legado, medicoRedo: redo }) as ComparacaoExame;
    const r = resumirComparacao([
      linha('mesmo_medico', 'a', 'a'),
      linha('nenhum', null, null),
      linha('medico_diferente', 'a', 'b'),
      linha('so_redo', null, 'b'),
      linha('recolhido_fora', 'a', null),
    ]);
    expect(r.comparaveis).toBe(4);
    expect(r.concordantes).toBe(2);
    expect(r.porCategoria).toEqual({
      mesmo_medico: 1,
      nenhum: 1,
      medico_diferente: 1,
      so_redo: 1,
      recolhido_fora: 1,
    });
    expect(r.porMedico.get('a')).toEqual({ legado: 2, redo: 1 });
    expect(r.porMedico.get('b')).toEqual({ legado: 0, redo: 2 });
  });
});
