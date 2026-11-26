import { describe, expect, it } from 'vitest';

import { compararRepasse, type DemonstrativoParidade } from './paridade-repasse';

const demo = (
  medicoId: string,
  arranjos: [string, number, number][],
  adicionaisCentavos = 0,
): DemonstrativoParidade => {
  const examesCentavos = arranjos.reduce((s, [, , t]) => s + t, 0);
  return {
    medicoId,
    medico: medicoId.toUpperCase(),
    examesCentavos,
    adicionaisCentavos,
    totalCentavos: examesCentavos + adicionaisCentavos,
    arranjos: new Map(arranjos.map(([a, volume, totalCentavos]) => [a, { volume, totalCentavos }])),
  };
};

describe('compararRepasse', () => {
  it('conta os médicos iguais e soma os totais dos dois lados', () => {
    const r = compararRepasse(
      [demo('a', [['MR|NEURO|SC|ROTINA', 2, 10000]])],
      [demo('a', [['MR|NEURO|SC|ROTINA', 2, 10000]])],
    );
    expect(r).toMatchObject({ medicosIguais: 1, medicosDivergentes: 0, divergencias: [] });
    expect(r.legado.totalCentavos).toBe(10000);
  });

  it('dá a causa de cada diferença', () => {
    const r = compararRepasse(
      [
        demo('a', [
          ['MR|NEURO|SC|ROTINA', 2, 10000],
          ['CT|NEURO|SC|ROTINA', 1, 3000],
          ['RX|MI|SC|ROTINA', 3, 900],
          ['MR|MSK|COLUNAS|ROTINA', 1, 2700],
        ]),
        demo('so-legado', [['MR|NEURO|SC|ROTINA', 1, 5000]]),
      ],
      [
        demo(
          'a',
          [
            ['MR|NEURO|SC|ROTINA', 2, 12000],
            ['CT|NEURO|SC|ROTINA', 2, 6000],
            ['RX|MI|SC|ROTINA', 3, 900],
            ['MR|NEURO|SC|URGENCIA', 1, 3000],
          ],
          500,
        ),
      ],
    );
    expect(r.medicosDivergentes).toBe(2);
    expect(r.divergencias.map((d) => [d.causa, d.arranjo, d.diferencaCentavos])).toEqual([
      ['medico_so_legado', null, -5000],
      ['volume', 'CT|NEURO|SC|ROTINA', 3000],
      ['arranjo_so_redo', 'MR|NEURO|SC|URGENCIA', 3000],
      ['arranjo_so_legado', 'MR|MSK|COLUNAS|ROTINA', -2700],
      ['preco', 'MR|NEURO|SC|ROTINA', 2000],
      ['adicionais', null, 500],
    ]);
    expect(r.porCausa.find((c) => c.causa === 'preco')).toEqual({
      causa: 'preco',
      casos: 1,
      diferencaCentavos: 2000,
    });
  });
});
