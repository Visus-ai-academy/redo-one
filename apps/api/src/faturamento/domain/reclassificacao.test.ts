import { describe, expect, it } from 'vitest';

import {
  type ReclassificacaoFaturamento,
  reclassificacoesEm,
  reclassificar,
} from './reclassificacao';

const regra = (over: Partial<ReclassificacaoFaturamento>): ReclassificacaoFaturamento => ({
  id: 'r',
  ordem: 1,
  descricao: 'x',
  modalidadeIds: null,
  especialidadeIds: null,
  categoriaIds: ['COLUNAS'],
  equipeIds: null,
  especialidadeDestinoId: 'MSK',
  categoriaDestinoId: 'COLUNAS',
  vigenciaDesde: null,
  vigenciaAte: null,
  ...over,
});

const neuro = regra({
  id: 'neuro',
  ordem: 1,
  equipeIds: ['neuros'],
  especialidadeDestinoId: 'NEURO',
  categoriaDestinoId: 'SC',
});
const demais = regra({ id: 'demais', ordem: 2 });
const arranjo = { modalidadeId: 'MR', especialidadeId: 'MSK', categoriaId: 'COLUNAS' };

describe('reclassificação do arranjo no faturamento', () => {
  it('coluna de médico da equipe vira NEURO|SC; a dos demais segue a regra seguinte', () => {
    const equipes = new Map([['m1', new Set(['neuros'])]]);
    expect(reclassificar(arranjo, 'm1', [neuro, demais], equipes)).toEqual({
      modalidadeId: 'MR',
      especialidadeId: 'NEURO',
      categoriaId: 'SC',
    });
    expect(reclassificar(arranjo, 'm2', [neuro, demais], equipes)).toEqual(arranjo);
    expect(reclassificar(arranjo, null, [neuro], equipes)).toEqual(arranjo);
  });

  it('o que não casa fica como está', () => {
    const sc = { ...arranjo, categoriaId: 'SC' };
    expect(reclassificar(sc, 'm1', [neuro], new Map([['m1', new Set(['neuros'])]]))).toEqual(sc);
  });

  it('vale a vigência da competência, na ordem', () => {
    const regras = [
      regra({ id: 'b', ordem: 2 }),
      regra({ id: 'a', ordem: 1, vigenciaDesde: '2026-12' }),
      regra({ id: 'c', ordem: 0, vigenciaAte: '2026-10' }),
    ];
    expect(reclassificacoesEm(regras, '2026-11').map((r) => r.id)).toEqual(['b']);
    expect(reclassificacoesEm(regras, '2026-12').map((r) => r.id)).toEqual(['a', 'b']);
    expect(reclassificacoesEm(regras, '2026-10').map((r) => r.id)).toEqual(['c', 'b']);
  });
});
