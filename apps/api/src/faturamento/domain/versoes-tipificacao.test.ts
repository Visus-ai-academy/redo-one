import { describe, expect, it } from 'vitest';

import type { ContextoVigencia } from './versoes-preco';
import {
  aplicarMudancas,
  NadaMudouError,
  planejarMudanca,
  planejarRemocao,
  UnicaVersaoError,
  VersaoTipificacaoNaoEncontradaError,
  type VersaoVigente,
  VigenciaTipificacaoInvalidaError,
  vigenteEm,
} from './versoes-tipificacao';

/** Mês atual 11/2026; 09 e 10/2026 fechadas; 11/2026 aberta. */
const CTX: ContextoVigencia = { mesAtual: '2026-11', bloqueadas: ['2026-09', '2026-10'] };
const igual = (a: string | null, b: string) => a === b;
const v = (
  id: string,
  desde: string,
  ate: string | null,
  valor: string,
): VersaoVigente<string> => ({ id, vigenciaDesde: desde, vigenciaAte: ate, valor });

describe('vigenteEm', () => {
  it('acha a versão cujo período contém a competência', () => {
    const versoes = [v('a', '2024-01', '2026-11', 'A'), v('b', '2026-12', null, 'B')];
    expect(vigenteEm(versoes, '2024-01')?.id).toBe('a');
    expect(vigenteEm(versoes, '2026-11')?.id).toBe('a');
    expect(vigenteEm(versoes, '2027-05')?.id).toBe('b');
    expect(vigenteEm(versoes, '2023-12')).toBeUndefined();
  });
});

describe('planejarMudanca', () => {
  it('sem versão: cria a partir da competência pedida, sem fim', () => {
    expect(planejarMudanca([], 'A', '2026-12', CTX, igual)).toEqual([
      { tipo: 'criar', vigenciaDesde: '2026-12', vigenciaAte: null, valor: 'A' },
    ]);
  });

  it('encerra a versão vigente na competência anterior e cria a nova até onde ela ia', () => {
    const versoes = [v('a', '2024-01', null, 'A')];
    expect(planejarMudanca(versoes, 'B', '2026-11', CTX, igual)).toEqual([
      { tipo: 'encerrar', id: 'a', vigenciaAteAntes: null, vigenciaAte: '2026-10' },
      { tipo: 'criar', vigenciaDesde: '2026-11', vigenciaAte: null, valor: 'B' },
    ]);
  });

  it('com uma programada depois, a nova vai até a véspera dela', () => {
    const versoes = [v('a', '2024-01', '2027-02', 'A'), v('b', '2027-03', null, 'B')];
    expect(planejarMudanca(versoes, 'C', '2026-12', CTX, igual)).toEqual([
      { tipo: 'encerrar', id: 'a', vigenciaAteAntes: '2027-02', vigenciaAte: '2026-11' },
      { tipo: 'criar', vigenciaDesde: '2026-12', vigenciaAte: '2027-02', valor: 'C' },
    ]);
  });

  it('antes da primeira versão: a nova vai até a véspera dela', () => {
    const versoes = [v('b', '2027-03', null, 'B')];
    expect(planejarMudanca(versoes, 'C', '2026-12', CTX, igual)).toEqual([
      { tipo: 'criar', vigenciaDesde: '2026-12', vigenciaAte: '2027-02', valor: 'C' },
    ]);
  });

  it('a programada que nunca valeu e começa na mesma competência é trocada', () => {
    const versoes = [v('a', '2024-01', '2026-11', 'A'), v('b', '2026-12', null, 'B')];
    expect(planejarMudanca(versoes, 'C', '2026-12', CTX, igual)).toEqual([
      { tipo: 'remover', id: 'b' },
      { tipo: 'criar', vigenciaDesde: '2026-12', vigenciaAte: null, valor: 'C' },
    ]);
  });

  it('a versão que já vale desde a competência pedida não se reescreve', () => {
    const versoes = [v('a', '2024-01', '2026-10', 'A'), v('b', '2026-11', null, 'B')];
    expect(() => planejarMudanca(versoes, 'C', '2026-11', CTX, igual)).toThrow(
      /vale desde 11\/2026 e não se reescreve: a mudança vale a partir de 12\/2026 ou depois/,
    );
  });

  it('nada mudou em relação à versão vigente na competência', () => {
    expect(() =>
      planejarMudanca([v('a', '2024-01', null, 'A')], 'A', '2026-12', CTX, igual),
    ).toThrow(NadaMudouError);
    // Sem versão: o "igual" decide o que é a ausência (ex.: configuração vazia).
    expect(() => planejarMudanca([], '', '2026-12', CTX, (a, b) => (a ?? '') === b)).toThrow(
      NadaMudouError,
    );
  });

  it('só competência aberta ou futura, depois da última fechada ou travada', () => {
    for (const c of ['2026-10', '2026-09', '2024-01', '2026-13', '2026'])
      expect(() => planejarMudanca([], 'A', c, CTX, igual)).toThrow(
        VigenciaTipificacaoInvalidaError,
      );
    expect(() =>
      planejarMudanca([], 'A', '2026-11', { ...CTX, bloqueadas: ['2026-12'] }, igual),
    ).toThrow(/de 01\/2027 em diante/);
    // Sem nenhuma fechada, o mínimo é o mês atual.
    expect(() => planejarMudanca([], 'A', '2026-10', { ...CTX, bloqueadas: [] }, igual)).toThrow(
      /a partir de 11\/2026/,
    );
  });
});

describe('planejarRemocao', () => {
  it('apaga a programada que nunca valeu e reabre a anterior até onde ela ia', () => {
    const versoes = [
      v('a', '2024-01', '2026-11', 'A'),
      v('b', '2026-12', '2027-02', 'B'),
      v('c', '2027-03', null, 'C'),
    ];
    expect(planejarRemocao(versoes, 'b', CTX)).toEqual([
      { tipo: 'remover', id: 'b' },
      { tipo: 'reabrir', id: 'a', vigenciaAteAntes: '2026-11', vigenciaAte: '2027-02' },
    ]);
  });

  it('sem anterior, só apaga', () => {
    expect(planejarRemocao([v('b', '2026-12', null, 'B')], 'b', CTX)).toEqual([
      { tipo: 'remover', id: 'b' },
    ]);
  });

  it('a versão que já valeu não se apaga', () => {
    const versoes = [v('a', '2024-01', '2026-10', 'A'), v('b', '2026-11', null, 'B')];
    expect(() => planejarRemocao(versoes, 'b', CTX)).toThrow(/já valeu e não se apaga/);
    expect(() => planejarRemocao(versoes, 'x', CTX)).toThrow(VersaoTipificacaoNaoEncontradaError);
  });

  it('a programada numa competência travada não se apaga', () => {
    expect(() =>
      planejarRemocao([v('b', '2026-12', null, 'B')], 'b', { ...CTX, bloqueadas: ['2026-12'] }),
    ).toThrow(VigenciaTipificacaoInvalidaError);
  });
});

describe('aplicarMudancas', () => {
  it('devolve as versões como ficariam (para a prévia)', () => {
    const versoes = [v('a', '2024-01', null, 'A')];
    const mudancas = planejarMudanca(versoes, 'B', '2026-12', CTX, igual);
    expect(aplicarMudancas(versoes, mudancas, () => 'novo')).toEqual([
      v('a', '2024-01', '2026-11', 'A'),
      v('novo', '2026-12', null, 'B'),
    ]);
    const outras = [v('a', '2024-01', '2026-11', 'A'), v('b', '2026-12', null, 'B')];
    expect(aplicarMudancas(outras, planejarRemocao(outras, 'b', CTX), () => 'x')).toEqual([
      v('a', '2024-01', null, 'A'),
    ]);
  });
});

describe('versão inicial sem início ("desde sempre")', () => {
  const inicial = (ate: string | null = null): VersaoVigente<string> => ({
    id: 'i',
    vigenciaDesde: null,
    vigenciaAte: ate,
    valor: 'A',
  });

  it('vale para qualquer competência até o fim dela', () => {
    expect(vigenteEm([inicial()], '1999-01')?.id).toBe('i');
    expect(vigenteEm([inicial('2026-11')], '2026-12')).toBeUndefined();
  });

  it('mudar encerra a inicial na competência anterior; ela nunca é apagada', () => {
    expect(planejarMudanca([inicial()], 'B', '2026-12', CTX, igual)).toEqual([
      { tipo: 'encerrar', id: 'i', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
      { tipo: 'criar', vigenciaDesde: '2026-12', vigenciaAte: null, valor: 'B' },
    ]);
    expect(() => planejarRemocao([inicial()], 'i', CTX)).toThrow(VigenciaTipificacaoInvalidaError);
  });

  it('apagar a programada reabre a inicial', () => {
    const versoes = [inicial('2026-11'), v('b', '2026-12', null, 'B')];
    expect(planejarRemocao(versoes, 'b', CTX)).toEqual([
      { tipo: 'remover', id: 'b' },
      { tipo: 'reabrir', id: 'i', vigenciaAteAntes: '2026-11', vigenciaAte: null },
    ]);
    expect(
      aplicarMudancas(
        versoes,
        [{ tipo: 'criar', vigenciaDesde: '2027-01', vigenciaAte: null, valor: 'C' }],
        () => 'c',
      ).map((x) => x.id),
    ).toEqual(['i', 'b', 'c']);
  });
});

describe('a única versão', () => {
  it('não se apaga quando não há herança (o "fatura")', () => {
    expect(() =>
      planejarRemocao([v('b', '2026-12', null, 'B')], 'b', CTX, { exigirOutra: true }),
    ).toThrow(UnicaVersaoError);
  });
});
