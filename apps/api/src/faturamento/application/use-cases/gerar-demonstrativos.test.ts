import { beforeEach, describe, expect, it } from 'vitest';

import type { AvisoLevantado } from '../../../comum/avisos/registro-avisos';
import type { EntradaDemonstrativo } from '../../domain/demonstrativo';
import { PARAMETROS_INICIAIS } from '../../domain/parametros-demonstrativo';
import {
  CompetenciasEmMemoria,
  DemonstrativosEmMemoria,
  RecalculosEmMemoria,
} from '../../testing/fakes';
import type { AvisosDoDemonstrativo } from '../ports/avisos-do-demonstrativo';
import type { EntradasDemonstrativo, NomesDemonstrativo } from '../ports/entradas-demonstrativo';
import { GerarDemonstrativos } from './gerar-demonstrativos';

const agora = new Date('2026-11-26T15:00:00Z');

const nomes: NomesDemonstrativo = {
  clientes: new Map([['c1', 'CLINICA_A']]),
  modalidades: new Map([
    ['MR', 'MR'],
    ['CT', 'CT'],
  ]),
  especialidades: new Map([['NEURO', 'NEURO']]),
  categorias: new Map([['SC', 'SC']]),
  prioridades: new Map([['ROTINA', 'ROTINA']]),
};

const laudoBase = {
  clienteId: 'c1',
  unidadeId: null,
  diaLaudo: '2026-11-03',
  modalidadeId: 'MR',
  especialidadeId: 'NEURO',
  categoriaId: 'SC',
  prioridadeId: 'ROTINA',
  volume: 1,
  duplicado: false,
  assinado: true,
  tipificacao: { fatura: true },
  pecas: [],
  medicoId: null,
};

const entrada = (competencia: string): EntradaDemonstrativo => ({
  competencia,
  clientes: new Map([['c1', { ativo: true, contratadoId: null }]]),
  laudos: [
    { ...laudoBase, id: 'l1' },
    { ...laudoBase, id: 'l2', modalidadeId: 'CT', volume: 2 },
    { ...laudoBase, id: 'l3', tipificacao: null },
  ],
  precosPorCliente: new Map([
    [
      'c1',
      [
        {
          id: 'p1',
          modalidadeId: 'MR',
          especialidadeId: 'NEURO',
          categoriaId: 'SC',
          prioridadeId: 'ROTINA',
          faixaInicio: null,
          faixaFim: null,
          condVolume: 'MOD_ESP_CAT',
          valor: 63.5,
          vigenciaDesde: null,
          vigenciaAte: null,
        },
      ],
    ],
  ]),
  precosPorContratado: new Map(),
  parametros: { ...PARAMETROS_INICIAIS },
  alternativas: new Map(),
  reclassificacoes: [],
  equipesDoMedico: new Map(),
});

describe('gerar os demonstrativos', () => {
  let competencias: CompetenciasEmMemoria;
  let demonstrativos: DemonstrativosEmMemoria;
  let recalculos: RecalculosEmMemoria;
  let sincronizados: AvisoLevantado[][];
  let registrados: AvisoLevantado[][];
  const entradas: EntradasDemonstrativo = {
    carregar: async (competencia) => ({ entrada: entrada(competencia), nomes }),
  };
  const avisos: AvisosDoDemonstrativo = {
    sincronizar: async (l) => {
      sincronizados.push([...l]);
    },
    registrar: async (l) => {
      registrados.push([...l]);
    },
  };
  const caso = () =>
    new GerarDemonstrativos(
      competencias,
      entradas,
      demonstrativos,
      recalculos,
      avisos,
      () => agora,
    );

  beforeEach(() => {
    competencias = new CompetenciasEmMemoria();
    competencias.competencias.set('2026-10', { status: 'fechada', importacaoTravada: false });
    competencias.competencias.set('2026-11', { status: 'aberta', importacaoTravada: false });
    demonstrativos = new DemonstrativosEmMemoria(competencias);
    recalculos = new RecalculosEmMemoria();
    sincronizados = [];
    registrados = [];
  });

  it('prévias: só as competências abertas, e os avisos de todas sincronizados de uma vez', async () => {
    await caso().executar({ tipo: 'previas' });

    expect(demonstrativos.gravacoes.map((g) => [g.competencia, g.origem])).toEqual([
      ['2026-11', 'previa'],
    ]);
    expect(demonstrativos.gravacoes[0]?.demonstrativos[0]?.valorCentavos).toBe(6350);
    expect(sincronizados).toHaveLength(1);
    expect(sincronizados[0]?.map((a) => [a.tipo, a.chave, a.ocorrencias])).toEqual([
      ['laudo_sem_preco', '2026-11|c1|c1|CT|NEURO|SC|ROTINA', 2],
      ['laudo_sem_tipificacao', '2026-11|c1', 1],
    ]);
    expect(sincronizados[0]?.[0]).toMatchObject({
      valor: 'CLINICA_A: CT · NEURO · SC · ROTINA sem preço em 11/2026',
      entidades: [{ tipo: 'cliente', id: 'c1' }],
      competencias: { desde: '2026-11', ate: '2026-11' },
    });
  });

  it('fechamento: grava a versão do fechamento da competência fechada', async () => {
    await caso().executar({ tipo: 'fechamento', competencia: '2026-10' });
    expect(demonstrativos.gravacoes.map((g) => [g.competencia, g.origem])).toEqual([
      ['2026-10', 'fechamento'],
    ]);
    expect(registrados).toHaveLength(1);
  });

  it('recálculo: versão nova ligada ao pedido, que fica concluído', async () => {
    const id = await recalculos.solicitar(
      {
        competencia: '2026-10',
        contexto: 'faturamento',
        motivo: 'valor errado',
        solicitadoPorId: 'u1',
        solicitadoEm: agora,
      },
      { contexto: 'faturamento', enfileirar: async () => {} },
    );
    await caso().executar({ tipo: 'recalculo', recalculoId: id });

    expect(demonstrativos.gravacoes.map((g) => [g.competencia, g.origem, g.recalculoId])).toEqual([
      ['2026-10', 'recalculo', id],
    ]);
    expect((await recalculos.obter(id))?.concluidoEm).toEqual(agora);
  });

  it('recálculo de pedido que não existe não grava nada', async () => {
    await caso().executar({ tipo: 'recalculo', recalculoId: 'nao-existe' });
    expect(demonstrativos.gravacoes).toEqual([]);
  });
});
