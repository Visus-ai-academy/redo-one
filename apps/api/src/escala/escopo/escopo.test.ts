import { describe, expect, it } from 'vitest';

import { type EscopoEscala, estaNoEscopo, frentesPermitidas } from './escopo';

const escopo = (turnoIds: string[], frenteIds: string[]): EscopoEscala => ({
  turnoIds: new Set(turnoIds),
  frenteIds: new Set(frenteIds),
});

describe('recorte da gestora de escala', () => {
  describe('estaNoEscopo', () => {
    it('sem recorte, tudo está no escopo', () => {
      expect(estaNoEscopo(null, { turnoId: 't1', frenteId: 'f1' })).toBe(true);
    });

    it('entra pelo turno OU pela frente', () => {
      const recorte = escopo(['manha'], ['neuro']);
      expect(estaNoEscopo(recorte, { turnoId: 'manha', frenteId: 'tc' })).toBe(true);
      expect(estaNoEscopo(recorte, { turnoId: 'tarde', frenteId: 'neuro' })).toBe(true);
      expect(estaNoEscopo(recorte, { turnoId: 'tarde', frenteId: 'tc' })).toBe(false);
    });

    it('recorte vazio não deixa nada', () => {
      expect(estaNoEscopo(escopo([], []), { turnoId: 't1', frenteId: 'f1' })).toBe(false);
    });
  });

  describe('frentesPermitidas', () => {
    it('sem recorte, todas as frentes', () => {
      expect(frentesPermitidas(null, ['f1', 'f2'])).toEqual(['f1', 'f2']);
    });

    it('com recorte, só as frentes do recorte que existem, na ordem dada', () => {
      expect(frentesPermitidas(escopo(['manha'], ['f3', 'f1', 'x']), ['f1', 'f2', 'f3'])).toEqual([
        'f1',
        'f3',
      ]);
    });

    it('recorte só por turno não libera frente nenhuma', () => {
      expect(frentesPermitidas(escopo(['manha'], []), ['f1', 'f2'])).toEqual([]);
    });
  });
});
