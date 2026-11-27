import { describe, expect, it } from 'vitest';

import {
  planejarAlteracaoVersao,
  planejarCancelamento,
  planejarEncerramentoVersao,
  planejarVersaoUnica,
  type Versionada,
} from './versoes';
import { VigenciaRepasseInvalidaError } from './vigencia';

const CTX = { mesAtual: '2026-11', bloqueadas: ['2026-10'] };
const v = (id: string, desde: string | null, ate: string | null = null): Versionada => ({
  id,
  vigenciaDesde: desde,
  vigenciaAte: ate,
});
const sempre = () => true;

describe('versões com vigência', () => {
  it('versão única: a atual fecha na véspera; sem atual, nada a mexer', () => {
    expect(planejarVersaoUnica('2026-12', [v('a', null)], CTX)).toEqual([
      { tipo: 'encerrar', id: 'a', vigenciaAteAntes: null, vigenciaAte: '2026-11' },
    ]);
    expect(planejarVersaoUnica('2026-12', [], CTX)).toEqual([]);
  });

  it('versão única: a programada na mesma competência é trocada; depois dela, recusa', () => {
    const versoes = [v('a', null, '2026-12'), v('p', '2027-01')];
    expect(planejarVersaoUnica('2027-01', versoes, CTX)).toEqual([
      { tipo: 'remover', id: 'p', vigenciaAteAntes: null },
    ]);
    expect(() => planejarVersaoUnica('2026-12', versoes, CTX)).toThrow(
      VigenciaRepasseInvalidaError,
    );
  });

  it('alterar devolve até onde a nova vai', () => {
    expect(planejarAlteracaoVersao('a', '2026-12', [v('a', null, '2027-03')], CTX)).toEqual({
      mudancas: [
        { tipo: 'encerrar', id: 'a', vigenciaAteAntes: '2027-03', vigenciaAte: '2026-11' },
      ],
      vigenciaAte: '2027-03',
    });
  });

  it('encerrar a programada a cancela e reabre a anterior da mesma chave', () => {
    const versoes = [v('a', null, '2026-12'), v('p', '2027-01')];
    expect(planejarEncerramentoVersao('p', '2027-01', versoes, CTX, sempre)).toEqual([
      { tipo: 'remover', id: 'p', vigenciaAteAntes: null },
      { tipo: 'reabrir', id: 'a', vigenciaAteAntes: '2026-12', vigenciaAte: null },
    ]);
  });

  it('cancelar só a programada', () => {
    const versoes = [v('a', null, '2026-12'), v('p', '2027-01')];
    expect(planejarCancelamento('p', versoes, CTX, () => false)).toEqual([
      { tipo: 'remover', id: 'p', vigenciaAteAntes: null },
    ]);
    expect(() => planejarCancelamento('a', versoes, CTX, sempre)).toThrow(
      VigenciaRepasseInvalidaError,
    );
  });
});
