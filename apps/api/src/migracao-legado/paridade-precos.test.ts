import { describe, expect, it } from 'vitest';

import type { LinhaPreco } from '../faturamento/domain/preco';
import {
  compararPrecos,
  type LaudoParidadePreco,
  precificarLaudos,
  type TabelasParidade,
} from './paridade-precos';

const laudo = (p: Partial<LaudoParidadePreco> = {}): LaudoParidadePreco => ({
  id: 'l-1',
  identidade: 'id-1',
  competencia: '2026-10',
  clienteId: 'cli',
  unidadeId: null,
  contratadoId: 'ct',
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
  volume: 1,
  fatura: true,
  nomes: { cliente: 'CLI', membro: 'CLI', arranjo: 'MR|NEURO|SC|ROTINA' },
  ...p,
});
const preco = (p: Partial<LinhaPreco> = {}): LinhaPreco => ({
  id: 'p',
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
  faixaInicio: null,
  faixaFim: null,
  condVolume: 'MOD_ESP_CAT',
  valor: 63,
  vigenciaDesde: null,
  vigenciaAte: null,
  ...p,
});
const tabelas = (t: Partial<TabelasParidade> = {}): TabelasParidade => ({
  porCliente: new Map(),
  porContratado: new Map(),
  alternativas: new Map(),
  ...t,
});

describe('precificarLaudos', () => {
  it('a faixa usa o volume do membro (unidade ou cliente), somando também os que não faturam', () => {
    const faixas = [
      preco({ id: 'ate2', faixaInicio: 1, faixaFim: 2, valor: 70 }),
      preco({ id: 'mais', faixaInicio: 3, valor: 60 }),
    ];
    const laudos = [
      laudo({ id: 'a', unidadeId: 'uni' }),
      laudo({ id: 'b', unidadeId: 'uni', fatura: false }),
      laudo({ id: 'c', unidadeId: 'uni' }),
      laudo({ id: 'd' }),
    ];
    const r = precificarLaudos(laudos, tabelas({ porCliente: new Map([['cli', faixas]]) }));
    expect(r.get('a')).toMatchObject({ valor: 60, origem: 'principal' });
    expect(r.get('d')).toMatchObject({ valor: 70 });
  });

  it('procura na unidade, no principal e na padrão do contratado', () => {
    const r = precificarLaudos(
      [laudo({ unidadeId: 'uni' }), laudo({ id: 'l-2', categoriaId: 'angio' })],
      tabelas({
        porCliente: new Map([['uni', [preco({ valor: 80 })]]]),
        porContratado: new Map([['ct', [preco({ categoriaId: 'angio', valor: 99 })]]]),
      }),
    );
    expect(r.get('l-1')).toMatchObject({ valor: 80, origem: 'unidade' });
    expect(r.get('l-2')).toMatchObject({ valor: 99, origem: 'padrao' });
  });

  it('com condVolume por arranjo (como o dashboards-one), a faixa usa o da primeira linha', () => {
    const faixas = [
      preco({ id: 'a', faixaInicio: 1, faixaFim: 2, valor: 70, condVolume: 'MOD_ESP_CAT' }),
      preco({ id: 'b', faixaInicio: 3, valor: 60, condVolume: 'TOTAL' }),
    ];
    const laudos = [
      laudo({ id: 'x' }),
      laudo({ id: 'y', categoriaId: 'angio' }),
      laudo({ id: 'z', categoriaId: 'angio' }),
    ];
    const t = tabelas({ porCliente: new Map([['cli', faixas]]) });
    // Por linha: a de TOTAL (3 laudos) casa → 60. Por arranjo (MOD_ESP_CAT, 1 laudo) → 70.
    expect(precificarLaudos(laudos, t).get('x')).toMatchObject({ valor: 60 });
    expect(precificarLaudos(laudos, t, true).get('x')).toMatchObject({ valor: 70 });
  });

  it('laudo sem arranjo completo fica sem preço', () => {
    const r = precificarLaudos([laudo({ categoriaId: null })], tabelas());
    expect(r.get('l-1')).toEqual({ encontrado: false });
  });
});

describe('compararPrecos', () => {
  const legado = new Map([['id-1', { grupo: 'cli', unitario: 63 }]]);

  it('conta iguais, divergentes e sem par e agrupa as divergências com o motivo', () => {
    const laudos = [
      laudo(),
      laudo({ id: 'l-2', identidade: 'id-1' }),
      laudo({ id: 'l-3', identidade: 'sem-par' }),
      laudo({ id: 'l-4', identidade: 'id-1', fatura: false }),
    ];
    const precos = new Map([
      [
        'l-1',
        {
          encontrado: true as const,
          valor: 63,
          linhaId: 'p',
          origem: 'principal' as const,
          como: 'exato' as const,
        },
      ],
      [
        'l-2',
        {
          encontrado: true as const,
          valor: 65,
          linhaId: 'p',
          origem: 'padrao' as const,
          como: 'exato' as const,
        },
      ],
    ]);
    const r = compararPrecos(laudos, precos, legado);
    expect(r).toMatchObject({ total: 3, iguais: 1, divergentes: 1, semPar: 1 });
    expect(r.grupos).toEqual([
      {
        cliente: 'CLI',
        arranjo: 'MR|NEURO|SC|ROTINA',
        legado: 63,
        redo: 65,
        motivo: 'redo-one: tabela padrão (exato)',
        laudos: 1,
      },
    ]);
  });

  it('sem o arranjo no demonstrativo do dashboards-one e sem preço no redo-one são motivos próprios', () => {
    const r = compararPrecos(
      [laudo(), laudo({ id: 'l-2', identidade: 'id-2' })],
      new Map([['l-1', { encontrado: false as const }]]),
      new Map([
        ['id-1', { grupo: 'cli', unitario: 63 }],
        ['id-2', { grupo: 'cli', unitario: null }],
      ]),
    );
    expect(r.grupos.map((g) => [g.legado, g.redo, g.motivo])).toEqual([
      [63, null, 'redo-one: sem preço'],
      [null, null, 'arranjo do redo-one não está no demonstrativo do dashboards-one'],
    ]);
  });
});
