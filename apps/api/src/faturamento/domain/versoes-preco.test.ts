import { describe, expect, it } from 'vitest';

import {
  anterior,
  arranjosDuplicados,
  type ContextoVigencia,
  type DadosPreco,
  PrecoInvalidoError,
  planejarAlteracao,
  planejarEncerramento,
  planejarInclusao,
  proxima,
  VersaoConflitanteError,
  type VersaoPreco,
  VigenciaPrecoInvalidaError,
} from './versoes-preco';

const DADOS: DadosPreco = {
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
  faixaInicio: null,
  faixaFim: null,
  condVolume: 'MOD_ESP_CAT',
  valor: 63,
};
const versao = (p: Partial<VersaoPreco> = {}): VersaoPreco => ({
  id: 'v1',
  ...DADOS,
  vigenciaDesde: null,
  vigenciaAte: null,
  ...p,
});
/** Mês atual 11/2026; 10/2026 fechada; 11/2026 aberta. */
const CTX: ContextoVigencia = { mesAtual: '2026-11', bloqueadas: ['2026-09', '2026-10'] };

describe('competências vizinhas', () => {
  it('anterior e próxima atravessam o ano', () => {
    expect(anterior('2027-01')).toBe('2026-12');
    expect(proxima('2026-12')).toBe('2027-01');
  });
});

describe('planejarInclusao', () => {
  it('cria a versão a partir da competência pedida, sem fim', () => {
    expect(planejarInclusao(DADOS, '2026-12', [], CTX)).toEqual([
      { tipo: 'criar', dados: DADOS, vigenciaDesde: '2026-12', vigenciaAte: null },
    ]);
  });

  it('recusa a competência fechada ou travada, ou anterior a uma delas', () => {
    for (const c of ['2026-10', '2026-09', '2026-01'])
      expect(() => planejarInclusao(DADOS, c, [], CTX)).toThrow(VigenciaPrecoInvalidaError);
    expect(() =>
      planejarInclusao(DADOS, '2026-11', [], { ...CTX, bloqueadas: ['2026-12'] }),
    ).toThrow(VigenciaPrecoInvalidaError);
    expect(() => planejarInclusao(DADOS, '2026-13', [], CTX)).toThrow(VigenciaPrecoInvalidaError);
    // Sem competência fechada ou travada, o mínimo é o mês atual (nada de reprecificar o passado).
    expect(() => planejarInclusao(DADOS, '2019-01', [], { ...CTX, bloqueadas: [] })).toThrow(
      VigenciaPrecoInvalidaError,
    );
    expect(planejarInclusao(DADOS, '2026-11', [], { ...CTX, bloqueadas: [] })).toHaveLength(1);
  });

  it('recusa valor e faixa acima do que o banco guarda', () => {
    expect(() => planejarInclusao({ ...DADOS, valor: 10_000_000_000 }, '2026-12', [], CTX)).toThrow(
      PrecoInvalidoError,
    );
    expect(() =>
      planejarInclusao({ ...DADOS, faixaInicio: 2_147_483_648 }, '2026-12', [], CTX),
    ).toThrow(PrecoInvalidoError);
  });

  it('recusa valor zero ou negativo e faixa invertida', () => {
    expect(() => planejarInclusao({ ...DADOS, valor: 0 }, '2026-12', [], CTX)).toThrow(
      PrecoInvalidoError,
    );
    expect(() =>
      planejarInclusao({ ...DADOS, faixaInicio: 10, faixaFim: 5 }, '2026-12', [], CTX),
    ).toThrow(PrecoInvalidoError);
    expect(() => planejarInclusao({ ...DADOS, faixaInicio: -1 }, '2026-12', [], CTX)).toThrow(
      PrecoInvalidoError,
    );
  });

  it('recusa o mesmo arranjo e faixa que já vale (ou vai valer) a partir dali', () => {
    expect(() => planejarInclusao(DADOS, '2026-12', [versao()], CTX)).toThrow(
      VersaoConflitanteError,
    );
    expect(() =>
      planejarInclusao(DADOS, '2026-12', [versao({ vigenciaDesde: '2027-03' })], CTX),
    ).toThrow(VersaoConflitanteError);
    // Encerrada antes: pode incluir de novo. Outra faixa: pode.
    expect(
      planejarInclusao(DADOS, '2026-12', [versao({ vigenciaAte: '2026-11' })], CTX),
    ).toHaveLength(1);
    expect(
      planejarInclusao({ ...DADOS, faixaInicio: 300 }, '2026-12', [versao()], CTX),
    ).toHaveLength(1);
  });
});

describe('planejarAlteracao', () => {
  it('nunca muda a versão: encerra na competência anterior e cria a nova', () => {
    const v = versao({ vigenciaDesde: '2026-01' });
    expect(planejarAlteracao('v1', { ...DADOS, valor: 70 }, '2026-12', [v], CTX)).toEqual([
      { tipo: 'encerrar', id: 'v1', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
      {
        tipo: 'criar',
        dados: { ...DADOS, valor: 70 },
        vigenciaDesde: '2026-12',
        vigenciaAte: null,
      },
    ]);
  });

  it('a nova versão herda o fim da que foi alterada', () => {
    const v = versao({ vigenciaAte: '2027-02' });
    expect(planejarAlteracao('v1', { ...DADOS, valor: 70 }, '2026-12', [v], CTX)[1]).toMatchObject({
      vigenciaDesde: '2026-12',
      vigenciaAte: '2027-02',
    });
  });

  it('a versão programada que nunca valeu e começa na mesma competência é trocada', () => {
    const v = versao({ vigenciaDesde: '2027-01' });
    expect(planejarAlteracao('v1', { ...DADOS, valor: 70 }, '2027-01', [v], CTX)).toEqual([
      { tipo: 'remover', id: 'v1', vigenciaAteAntes: null },
      {
        tipo: 'criar',
        dados: { ...DADOS, valor: 70 },
        vigenciaDesde: '2027-01',
        vigenciaAte: null,
      },
    ]);
  });

  it('a versão que já valeu não é trocada nem apagada: a alteração vale a partir da seguinte', () => {
    const v = versao({ vigenciaDesde: '2026-11' });
    expect(() => planejarAlteracao('v1', { ...DADOS, valor: 70 }, '2026-11', [v], CTX)).toThrow(
      VigenciaPrecoInvalidaError,
    );
  });

  it('não altera a partir de competência fechada nem antes do início da versão', () => {
    const v = versao({ vigenciaDesde: '2027-02' });
    expect(() => planejarAlteracao('v1', DADOS, '2026-10', [versao()], CTX)).toThrow(
      VigenciaPrecoInvalidaError,
    );
    expect(() => planejarAlteracao('v1', { ...DADOS, valor: 1 }, '2027-01', [v], CTX)).toThrow(
      VigenciaPrecoInvalidaError,
    );
  });

  it('não altera versão encerrada antes da competência pedida', () => {
    const v = versao({ vigenciaAte: '2026-11' });
    expect(() => planejarAlteracao('v1', { ...DADOS, valor: 1 }, '2026-12', [v], CTX)).toThrow(
      VigenciaPrecoInvalidaError,
    );
  });

  it('recusa alteração sem mudança e conflito com outra versão da mesma faixa', () => {
    expect(() => planejarAlteracao('v1', DADOS, '2026-12', [versao()], CTX)).toThrow(
      PrecoInvalidoError,
    );
    const outra = versao({ id: 'v2', faixaInicio: 300 });
    expect(() =>
      planejarAlteracao('v1', { ...DADOS, faixaInicio: 300 }, '2026-12', [versao(), outra], CTX),
    ).toThrow(VersaoConflitanteError);
  });
});

describe('planejarEncerramento', () => {
  it('excluir é encerrar: a versão passa a valer até a competência anterior', () => {
    expect(planejarEncerramento('v1', '2026-12', [versao()], CTX)).toEqual([
      { tipo: 'encerrar', id: 'v1', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
    ]);
  });

  it('só a versão programada que nunca valeu é apagada de vez', () => {
    expect(
      planejarEncerramento('v1', '2027-01', [versao({ vigenciaDesde: '2027-01' })], CTX),
    ).toEqual([{ tipo: 'remover', id: 'v1', vigenciaAteAntes: null }]);
    expect(
      planejarEncerramento('v1', '2026-12', [versao({ vigenciaDesde: '2027-03' })], CTX),
    ).toEqual([{ tipo: 'remover', id: 'v1', vigenciaAteAntes: null }]);
    // Programada, mas encerrada depois do início: só encerra.
    expect(
      planejarEncerramento('v1', '2027-02', [versao({ vigenciaDesde: '2027-01' })], CTX),
    ).toEqual([{ tipo: 'encerrar', id: 'v1', vigenciaAteAntes: null, vigenciaAte: '2027-01' }]);
  });

  it('apagar a programada devolve à versão anterior a vigência que ela tinha', () => {
    const atual = versao({ id: 'a', vigenciaAte: '2026-12' });
    const programada = versao({ id: 'p', valor: 70, vigenciaDesde: '2027-01' });
    expect(planejarEncerramento('p', '2027-01', [atual, programada], CTX)).toEqual([
      { tipo: 'remover', id: 'p', vigenciaAteAntes: null },
      { tipo: 'reabrir', id: 'a', vigenciaAteAntes: '2026-12', vigenciaAte: null },
    ]);
    // A programada seguida de outra: a anterior volta até onde a programada ia.
    const meio = versao({ id: 'm', valor: 70, vigenciaDesde: '2027-01', vigenciaAte: '2027-03' });
    expect(planejarEncerramento('m', '2027-01', [atual, meio], CTX)[1]).toEqual({
      tipo: 'reabrir',
      id: 'a',
      vigenciaAteAntes: '2026-12',
      vigenciaAte: '2027-03',
    });
  });

  it('a versão em vigor desde a competência atual não é apagada', () => {
    expect(() =>
      planejarEncerramento('v1', '2026-11', [versao({ vigenciaDesde: '2026-11' })], CTX),
    ).toThrow(VigenciaPrecoInvalidaError);
  });

  it('competência fechada ou travada nunca tem o preço mudado', () => {
    expect(() => planejarEncerramento('v1', '2026-10', [versao()], CTX)).toThrow(
      VigenciaPrecoInvalidaError,
    );
  });

  it('versão desconhecida ou já encerrada antes', () => {
    expect(() => planejarEncerramento('x', '2026-12', [versao()], CTX)).toThrow();
    expect(() =>
      planejarEncerramento('v1', '2026-12', [versao({ vigenciaAte: '2026-11' })], CTX),
    ).toThrow(VigenciaPrecoInvalidaError);
  });
});

describe('arranjosDuplicados', () => {
  it('marca as versões do mesmo arranjo com faixas e vigências que se cruzam', () => {
    const vs = [
      versao({ id: 'a' }),
      versao({ id: 'b', faixaInicio: 300 }),
      versao({ id: 'c', faixaInicio: 1, faixaFim: 299, prioridadeId: 'urgencia' }),
      versao({ id: 'd', faixaInicio: 300, prioridadeId: 'urgencia' }),
      versao({ id: 'e', vigenciaAte: '2026-10', categoriaId: 'angio' }),
      versao({ id: 'f', vigenciaDesde: '2026-11', categoriaId: 'angio' }),
    ];
    expect([...arranjosDuplicados(vs)].sort()).toEqual(['a', 'b']);
  });
});
