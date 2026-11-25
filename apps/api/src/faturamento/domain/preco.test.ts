import { describe, expect, it } from 'vitest';

import {
  type Arranjo,
  buscarPreco,
  type CondVolume,
  type LinhaPreco,
  vigenteEm,
  volumeDaFaixa,
} from './preco';

const ARRANJO: Arranjo = {
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
};
let seq = 0;
const linha = (p: Partial<LinhaPreco> = {}): LinhaPreco => ({
  id: `l-${++seq}`,
  ...ARRANJO,
  faixaInicio: null,
  faixaFim: null,
  condVolume: 'MOD_ESP_CAT',
  valor: 60,
  vigenciaDesde: null,
  vigenciaAte: null,
  ...p,
});
const ALTERNATIVAS = new Map([
  ['plantao', 'urgencia'],
  ['urgencia', 'plantao'],
]);
const volume = (v: number) => () => v;

const busca = (
  tabelas: { unidade?: LinhaPreco[]; principal?: LinhaPreco[]; padrao?: LinhaPreco[] },
  opcoes: {
    arranjo?: Partial<Arranjo>;
    volume?: (c: CondVolume) => number;
    competencia?: string;
  } = {},
) =>
  buscarPreco({
    arranjo: { ...ARRANJO, ...opcoes.arranjo },
    competencia: opcoes.competencia ?? '2026-10',
    tabelas: [
      { origem: 'unidade', linhas: tabelas.unidade ?? [] },
      { origem: 'principal', linhas: tabelas.principal ?? [] },
      { origem: 'padrao', linhas: tabelas.padrao ?? [] },
    ],
    alternativas: ALTERNATIVAS,
    volume: opcoes.volume ?? volume(1),
  });

describe('buscarPreco', () => {
  it('acha o arranjo exato na tabela do cliente', () => {
    const l = linha({ valor: 63 });
    expect(busca({ principal: [l, linha({ categoriaId: 'angio', valor: 80 })] })).toEqual({
      encontrado: true,
      valor: 63,
      linhaId: l.id,
      origem: 'principal',
      como: 'exato',
    });
  });

  it('a unidade usa a própria tabela; sem o preço nela, a do principal; depois a padrão', () => {
    const daUnidade = linha({ valor: 70 });
    const doPrincipal = linha({ valor: 65 });
    const padrao = linha({ valor: 90 });
    expect(
      busca({ unidade: [daUnidade], principal: [doPrincipal], padrao: [padrao] }),
    ).toMatchObject({
      valor: 70,
      origem: 'unidade',
    });
    expect(
      busca({ unidade: [linha({ categoriaId: 'x' })], principal: [doPrincipal], padrao: [padrao] }),
    ).toMatchObject({ valor: 65, origem: 'principal' });
    expect(busca({ principal: [linha({ categoriaId: 'x' })], padrao: [padrao] })).toMatchObject({
      valor: 90,
      origem: 'padrao',
    });
  });

  it('sem preço em nenhuma tabela: resultado explícito, nunca R$ 0', () => {
    expect(busca({ principal: [linha({ categoriaId: 'x' })] })).toEqual({ encontrado: false });
  });

  it('escolhe a faixa que contém o volume, somado pelo condVolume da linha', () => {
    const ate100 = linha({ faixaInicio: 1, faixaFim: 100, valor: 65, condVolume: 'TOTAL' });
    const acima = linha({ faixaInicio: 101, faixaFim: null, valor: 60, condVolume: 'TOTAL' });
    const porCond = (v: Partial<Record<CondVolume, number>>) => (c: CondVolume) => v[c] ?? 0;
    expect(busca({ principal: [ate100, acima] }, { volume: porCond({ TOTAL: 50 }) })).toMatchObject(
      { valor: 65 },
    );
    expect(
      busca({ principal: [ate100, acima] }, { volume: porCond({ TOTAL: 101, MOD_ESP_CAT: 3 }) }),
    ).toMatchObject({ valor: 60, linhaId: acima.id, como: 'exato' });
  });

  it('com várias faixas que contêm o volume, vale a de maior início (sem faixa conta como a menor)', () => {
    const semFaixa = linha({ valor: 64 });
    const desde300 = linha({ faixaInicio: 300, valor: 62 });
    expect(busca({ principal: [semFaixa, desde300] }, { volume: volume(500) })).toMatchObject({
      valor: 62,
    });
    expect(busca({ principal: [semFaixa, desde300] }, { volume: volume(10) })).toMatchObject({
      valor: 64,
    });
  });

  it('sem o arranjo na prioridade, tenta a alternativa (PLANTÃO ↔ URGÊNCIA) na mesma tabela', () => {
    const urgencia = linha({ prioridadeId: 'urgencia', valor: 75 });
    expect(
      busca({ principal: [urgencia] }, { arranjo: { prioridadeId: 'plantao' } }),
    ).toMatchObject({ valor: 75, como: 'prioridade_alternativa' });
    // ROTINA não tem alternativa.
    expect(busca({ principal: [urgencia] })).toEqual({ encontrado: false });
  });

  it('a alternativa da própria tabela vem antes da tabela seguinte', () => {
    const urgenciaUnidade = linha({ prioridadeId: 'urgencia', valor: 75 });
    const plantaoPrincipal = linha({ prioridadeId: 'plantao', valor: 99 });
    expect(
      busca(
        { unidade: [urgenciaUnidade], principal: [plantaoPrincipal] },
        { arranjo: { prioridadeId: 'plantao' } },
      ),
    ).toMatchObject({ valor: 75, origem: 'unidade' });
  });

  it('nenhuma faixa contém o volume: último recurso, a menor faixa (prioridade exata primeiro)', () => {
    const f1 = linha({ faixaInicio: 1, faixaFim: 50, valor: 70 });
    const f2 = linha({ faixaInicio: 51, faixaFim: 100, valor: 65 });
    const alt = linha({ prioridadeId: 'urgencia', faixaInicio: 0, faixaFim: 0, valor: 80 });
    expect(busca({ principal: [f2, f1] }, { volume: volume(500) })).toMatchObject({
      valor: 70,
      linhaId: f1.id,
      como: 'menor_faixa',
    });
    expect(
      busca(
        { principal: [f2, f1, alt] },
        { arranjo: { prioridadeId: 'plantao' }, volume: volume(500) },
      ),
    ).toMatchObject({ valor: 80, como: 'menor_faixa' });
  });

  it('a linha 0–0 só vale no último recurso e lá vence por ser a menor faixa', () => {
    const zero = linha({ faixaInicio: 0, faixaFim: 0, valor: 48 });
    const plantaoUrgencia = linha({ prioridadeId: 'urgencia', valor: 90 });
    // Sozinha: vale (último recurso).
    expect(busca({ principal: [zero] }, { volume: volume(5) })).toMatchObject({
      valor: 48,
      como: 'menor_faixa',
    });
    // Com a alternativa casando pela faixa, a alternativa vem antes do último recurso.
    expect(
      busca(
        { principal: [linha({ ...zero, prioridadeId: 'plantao' }), plantaoUrgencia] },
        { arranjo: { prioridadeId: 'plantao' } },
      ),
    ).toMatchObject({ valor: 90, como: 'prioridade_alternativa' });
  });

  it('só valem as versões vigentes na competência', () => {
    const antiga = linha({ valor: 24, vigenciaAte: '2026-10' });
    const nova = linha({ valor: 65, vigenciaDesde: '2026-11' });
    expect(busca({ principal: [antiga, nova] }, { competencia: '2026-10' })).toMatchObject({
      valor: 24,
    });
    expect(busca({ principal: [antiga, nova] }, { competencia: '2026-11' })).toMatchObject({
      valor: 65,
    });
    expect(
      busca({ principal: [linha({ vigenciaDesde: '2027-01' })] }, { competencia: '2026-12' }),
    ).toEqual({ encontrado: false });
  });
});

describe('vigenteEm', () => {
  it('desde e até são inclusivos; vazios não limitam', () => {
    expect(vigenteEm({ vigenciaDesde: null, vigenciaAte: null }, '2026-10')).toBe(true);
    expect(vigenteEm({ vigenciaDesde: '2026-10', vigenciaAte: '2026-10' }, '2026-10')).toBe(true);
    expect(vigenteEm({ vigenciaDesde: '2026-11', vigenciaAte: null }, '2026-10')).toBe(false);
    expect(vigenteEm({ vigenciaDesde: null, vigenciaAte: '2026-09' }, '2026-10')).toBe(false);
  });
});

describe('volumeDaFaixa', () => {
  const laudos = [
    { modalidadeId: 'mr', especialidadeId: 'neuro', categoriaId: 'sc', volume: 1 },
    { modalidadeId: 'mr', especialidadeId: 'neuro', categoriaId: 'angio', volume: 2 },
    { modalidadeId: 'mr', especialidadeId: 'msk', categoriaId: 'sc', volume: 1.4 },
    { modalidadeId: 'ct', especialidadeId: 'neuro', categoriaId: 'sc', volume: 4 },
    { modalidadeId: 'ct', especialidadeId: 'neuro', categoriaId: null, volume: 1 },
  ];
  const v = volumeDaFaixa(laudos);

  it('soma o volume na dimensão do condVolume (cada laudo arredondado, como o dashboards-one)', () => {
    expect(v('MOD_ESP_CAT', ARRANJO)).toBe(1);
    expect(v('MOD_ESP', ARRANJO)).toBe(3);
    expect(v('MOD', ARRANJO)).toBe(4);
    expect(v('TOTAL', ARRANJO)).toBe(9);
  });

  it('nunca menos que 1, para a faixa que começa em 1 casar mesmo sem laudos', () => {
    expect(v('MOD_ESP_CAT', { ...ARRANJO, modalidadeId: 'rx' })).toBe(1);
    expect(volumeDaFaixa([])('TOTAL', ARRANJO)).toBe(1);
  });
});
