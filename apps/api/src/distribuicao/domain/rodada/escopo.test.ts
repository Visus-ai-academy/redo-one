import { describe, expect, it } from 'vitest';

import { RECORTES_VAZIOS } from './entrada';
import { RecorteForaDoEscopoError, recorteDaGestora, rodadaNoEscopo } from './escopo';

const escopo = (turnoIds: string[], frenteIds: string[]) => ({
  turnoIds: new Set(turnoIds),
  frenteIds: new Set(frenteIds),
});

describe('recorte da gestora de escala na rodada', () => {
  it('sem recorte (null), qualquer rodada vale e nada muda', () => {
    const r = { ...RECORTES_VAZIOS, medicosIncluidos: ['m'] };
    expect(recorteDaGestora(null, r)).toEqual(r);
    expect(rodadaNoEscopo(null, RECORTES_VAZIOS)).toBe(true);
  });

  it('pedido sem recorte vira o escopo dela, quando ele é só de turnos ou só de frentes', () => {
    expect(recorteDaGestora(escopo(['t1'], []), RECORTES_VAZIOS).turnoIds).toEqual(['t1']);
    expect(recorteDaGestora(escopo([], ['f1', 'f2']), RECORTES_VAZIOS).frenteIds).toEqual([
      'f1',
      'f2',
    ]);
  });

  it('escopo de turnos e frentes: o pedido precisa escolher turnos ou frentes dele', () => {
    expect(() => recorteDaGestora(escopo(['t1'], ['f1']), RECORTES_VAZIOS)).toThrow(
      /Escolha os turnos ou as frentes/,
    );
    expect(
      recorteDaGestora(escopo(['t1'], ['f1']), { ...RECORTES_VAZIOS, frenteIds: ['f1'] }).frenteIds,
    ).toEqual(['f1']);
  });

  it('recusa turno ou frente fora do escopo e médico incluído (que escaparia do recorte)', () => {
    expect(() =>
      recorteDaGestora(escopo(['t1'], []), { ...RECORTES_VAZIOS, turnoIds: ['t1', 't2'] }),
    ).toThrow(RecorteForaDoEscopoError);
    expect(() =>
      recorteDaGestora(escopo(['t1'], []), {
        ...RECORTES_VAZIOS,
        turnoIds: ['t1'],
        medicosIncluidos: ['m'],
      }),
    ).toThrow(/incluir médico/);
  });

  it('a rodada está no escopo se todos os turnos (ou todas as frentes) dela são do escopo', () => {
    const e = escopo(['t1'], ['f1']);
    expect(rodadaNoEscopo(e, { ...RECORTES_VAZIOS, turnoIds: ['t1'], frenteIds: ['f9'] })).toBe(
      true,
    );
    expect(rodadaNoEscopo(e, { ...RECORTES_VAZIOS, frenteIds: ['f1'] })).toBe(true);
    expect(rodadaNoEscopo(e, RECORTES_VAZIOS)).toBe(false);
    expect(
      rodadaNoEscopo(e, { ...RECORTES_VAZIOS, turnoIds: ['t1'], medicosIncluidos: ['m'] }),
    ).toBe(false);
  });
});
