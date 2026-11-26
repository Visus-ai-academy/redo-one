import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoDemonstrativo } from './legado';
import { mapearDemonstrativos } from './mapear-demonstrativos';

const demonstrativo = (over: Partial<LegadoDemonstrativo> = {}): LegadoDemonstrativo => ({
  id: 'd1',
  competencia: '2026-10',
  chaveGrupo: 'cedidiag',
  nomeFantasia: 'CEDIDIAG',
  clienteIds: ['c1', 'c2'],
  contratadoId: 't1',
  totalExames: 1809,
  valorExames: 111295.004,
  valorFranquia: 0,
  valorPortalLaudos: 0,
  valorIntegracao: 0,
  valorBruto: 111295,
  valorImpostos: 6955.94,
  valorLiquido: 104339.06,
  franquiaRegra: 'nao_aplica',
  geradoEm: '2026-11-10T23:00:00.000Z',
  detalhes: [
    {
      modalidade: 'MR',
      especialidade: 'NEURO',
      categoria: 'SC',
      prioridade: 'ROTINA',
      quantidade: 10,
      valorUnitario: 69,
      valorTotal: 690,
      precoPadrao: true,
    },
  ],
  ...over,
});

describe('retrato do demonstrativo fechado do dashboards-one', () => {
  it('traz só as competências fechadas, com membros pelo id do redo-one e valores em centavos', () => {
    const r = mapearDemonstrativos(
      [demonstrativo(), demonstrativo({ id: 'd2', competencia: '2026-11' })],
      {
        fechadas: new Set(['2026-10']),
        clientes: new Set([idDoLegado('clientes', 'c1')]),
        contratados: new Set([idDoLegado('contratados', 't1')]),
      },
    );

    expect(r.tabelas.demonstrativos).toEqual([
      {
        id: idDoLegado('demonstrativos_faturamento', 'd1'),
        competencia: '2026-10',
        chaveGrupo: 'cedidiag',
        nomeFantasia: 'CEDIDIAG',
        contratadoId: idDoLegado('contratados', 't1'),
        totalExames: 1809,
        valorExamesCentavos: 11129500,
        valorFranquiaCentavos: 0,
        valorPortalCentavos: 0,
        valorIntegracaoCentavos: 0,
        valorBrutoCentavos: 11129500,
        valorImpostosCentavos: 695594,
        valorLiquidoCentavos: 10433906,
        franquiaRegra: 'nao_aplica',
        geradoEm: new Date('2026-11-10T23:00:00.000Z'),
      },
    ]);
    expect(r.tabelas.membros).toEqual([
      {
        demonstrativoId: idDoLegado('demonstrativos_faturamento', 'd1'),
        clienteId: idDoLegado('clientes', 'c1'),
      },
    ]);
    expect(r.tabelas.itens).toEqual([
      {
        demonstrativoId: idDoLegado('demonstrativos_faturamento', 'd1'),
        ordem: 1,
        modalidade: 'MR',
        especialidade: 'NEURO',
        categoria: 'SC',
        prioridade: 'ROTINA',
        quantidade: 10,
        valorUnitarioCentavos: 6900,
        valorTotalCentavos: 69000,
        precoPadrao: true,
      },
    ]);
    expect(r.avisos).toEqual([
      {
        tabela: 'demonstrativos_faturamento',
        item: '2026-10 CEDIDIAG',
        motivo: 'Membro sem cliente no redo-one: c2.',
      },
    ]);
  });
});
