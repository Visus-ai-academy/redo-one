import { describe, expect, it } from 'vitest';

import {
  type DadosPrecoRepasse,
  PrecoRepasseInvalidoError,
  planejarAlteracao,
  planejarEncerramento,
  planejarInclusao,
  precosRepetidos,
  VersaoPrecoConflitanteError,
  type VersaoPrecoRepasse,
} from './versoes-preco';
import { VigenciaRepasseInvalidaError } from './vigencia';

const CTX = { mesAtual: '2026-11', bloqueadas: ['2026-10'] };
const ARRANJO = {
  modalidadeId: 'TC',
  especialidadeId: 'NEURO',
  categoriaId: 'SC',
  prioridadeId: 'R',
};
const DADOS: DadosPrecoRepasse = { ...ARRANJO, clienteId: null, valorCentavos: 3207 };
const v = (o: Partial<VersaoPrecoRepasse> & { id: string }): VersaoPrecoRepasse => ({
  ...DADOS,
  vigenciaDesde: null,
  vigenciaAte: null,
  ...o,
});

describe('versões do preço de repasse', () => {
  it('inclui a partir de competência aberta e recusa a fechada', () => {
    expect(planejarInclusao(DADOS, '2026-11', [], CTX)).toEqual([
      { tipo: 'criar', dados: DADOS, vigenciaDesde: '2026-11', vigenciaAte: null },
    ]);
    expect(() => planejarInclusao(DADOS, '2026-10', [], CTX)).toThrow(VigenciaRepasseInvalidaError);
  });

  it('o mesmo arranjo para outro cliente não conflita; para o mesmo, sim', () => {
    const existente = [v({ id: 'a' })];
    expect(() =>
      planejarInclusao({ ...DADOS, clienteId: 'c1' }, '2026-11', existente, CTX),
    ).not.toThrow();
    expect(() => planejarInclusao(DADOS, '2026-12', existente, CTX)).toThrow(
      VersaoPrecoConflitanteError,
    );
  });

  it('recusa valor zero ou negativo', () => {
    expect(() => planejarInclusao({ ...DADOS, valorCentavos: 0 }, '2026-11', [], CTX)).toThrow(
      PrecoRepasseInvalidoError,
    );
  });

  it('alterar encerra a versão na véspera e cria outra até onde ela ia', () => {
    const r = planejarAlteracao(
      'a',
      { ...DADOS, valorCentavos: 4800 },
      '2026-12',
      [v({ id: 'a' })],
      CTX,
    );
    expect(r).toEqual([
      { tipo: 'encerrar', id: 'a', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
      {
        tipo: 'criar',
        dados: { ...DADOS, valorCentavos: 4800 },
        vigenciaDesde: '2026-12',
        vigenciaAte: null,
      },
    ]);
  });

  it('alterar a programada na própria competência a troca', () => {
    const r = planejarAlteracao(
      'p',
      { ...DADOS, valorCentavos: 5000 },
      '2027-01',
      [v({ id: 'a', vigenciaAte: '2026-12' }), v({ id: 'p', vigenciaDesde: '2027-01' })],
      CTX,
    );
    expect(r[0]).toEqual({ tipo: 'remover', id: 'p', vigenciaAteAntes: null });
  });

  it('recusa alteração sem mudança', () => {
    expect(() => planejarAlteracao('a', DADOS, '2026-12', [v({ id: 'a' })], CTX)).toThrow(
      PrecoRepasseInvalidoError,
    );
  });

  it('encerrar a programada a apaga e reabre a anterior', () => {
    const r = planejarEncerramento(
      'p',
      '2027-01',
      [v({ id: 'a', vigenciaAte: '2026-12' }), v({ id: 'p', vigenciaDesde: '2027-01' })],
      CTX,
    );
    expect(r).toEqual([
      { tipo: 'remover', id: 'p', vigenciaAteAntes: null },
      { tipo: 'reabrir', id: 'a', vigenciaAteAntes: '2026-12', vigenciaAte: null },
    ]);
  });

  it('encerrar a que vale fecha na véspera', () => {
    expect(planejarEncerramento('a', '2026-12', [v({ id: 'a' })], CTX)).toEqual([
      { tipo: 'encerrar', id: 'a', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
    ]);
  });

  it('marca as versões repetidas (mesmo arranjo e cliente, vigências que se cruzam)', () => {
    const r = precosRepetidos([
      v({ id: 'a' }),
      v({ id: 'b', vigenciaDesde: '2026-11' }),
      v({ id: 'c', clienteId: 'c1' }),
    ]);
    expect([...r].sort()).toEqual(['a', 'b']);
  });
});
