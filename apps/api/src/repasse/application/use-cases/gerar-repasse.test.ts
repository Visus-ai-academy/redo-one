import { describe, expect, it } from 'vitest';

import type { EntradaRepasse } from '../../domain/demonstrativo';
import type { GeracoesRepasse, NovaGeracao, SituacaoCompetencia } from '../ports/geracoes-repasse';
import type { RecalculoRepasse } from '../ports/recalculo-repasse';
import { GerarRepasse, RecalculoDeOutroContextoError } from './gerar-repasse';

const AGORA = new Date('2026-11-26T15:00:00Z');
const entrada: EntradaRepasse = {
  laudos: [
    {
      laudoId: 'l1',
      peca: 0,
      medicoId: 'ana',
      clienteId: 'cli',
      unidadeId: null,
      modalidadeId: 'mr',
      especialidadeId: 'neuro',
      categoriaId: 'sc',
      prioridadeId: 'rotina',
      volume: 1,
      dia: '2026-10-01',
      duplicado: false,
    },
  ],
  pagaDuplicados: true,
  contratadoId: null,
  equipesDoMedico: new Map(),
  reclassificacoes: [],
  configuracoes: new Map(),
  precos: new Map(),
  alternativas: [],
  regras: [],
  especialidadesDoMedico: new Map(),
  adicionais: [],
  retencoes: [],
  pessoas: new Map(),
};

function montar(
  situacao: SituacaoCompetencia,
  pedido = { competencia: '2026-10', contexto: 'repasse' },
) {
  const gravadas: NovaGeracao[] = [];
  const concluidos: string[] = [];
  const geracoes: GeracoesRepasse = {
    situacao: async () => situacao,
    abertas: async () => [],
    fechadas: async () => [],
    gravar: async (g) => {
      gravadas.push(g);
      return 'g1';
    },
  };
  const recalculos: RecalculoRepasse = {
    solicitar: async () => 'x',
    obter: async () => pedido,
    concluir: async (id) => {
      concluidos.push(id);
    },
  };
  const caso = new GerarRepasse(
    { carregar: async () => entrada },
    geracoes,
    recalculos,
    () => AGORA,
  );
  return { caso, gravadas, concluidos };
}

describe('GerarRepasse', () => {
  it('competência aberta: grava a prévia', async () => {
    const reabertaEm = new Date('2026-11-01');
    const { caso, gravadas } = montar({ status: 'aberta', reabertaEm });
    expect(await caso.executar({ competencia: '2026-11' })).toBe('gerado');
    expect(gravadas[0]).toMatchObject({
      competencia: '2026-11',
      tipo: 'previa',
      recalculoId: null,
      reabertaEm,
      geradoEm: AGORA,
    });
    expect(gravadas[0]?.demonstrativos).toHaveLength(1);
  });

  it('competência fechada sem pedido de recálculo: não mexe (o job automático a ignora)', async () => {
    const { caso, gravadas } = montar({ status: 'fechada', reabertaEm: null });
    expect(await caso.executar({ competencia: '2026-10' })).toBe('ignorado');
    expect(gravadas).toEqual([]);
  });

  it('fechada com pedido de recálculo: grava o recálculo e conclui o pedido', async () => {
    const { caso, gravadas, concluidos } = montar({ status: 'fechada', reabertaEm: null });
    expect(await caso.executar({ competencia: '2026-10', recalculoId: 'rc1' })).toBe('gerado');
    expect(gravadas[0]).toMatchObject({ tipo: 'recalculo', recalculoId: 'rc1' });
    expect(concluidos).toEqual(['rc1']);
  });

  it('recusa pedido de outro contexto ou competência', async () => {
    const { caso } = montar(
      { status: 'fechada', reabertaEm: null },
      { competencia: '2026-10', contexto: 'faturamento' },
    );
    await expect(caso.executar({ competencia: '2026-10', recalculoId: 'rc1' })).rejects.toThrow(
      RecalculoDeOutroContextoError,
    );
  });
});
