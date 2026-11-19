import { describe, expect, it } from 'vitest';

import { buscarFatiado } from './buscar-fatiado';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const de = new Date('2026-10-01T03:00:00.000Z');

/** Um item por hora no período; a "MobileMed" corta a lista no teto, como a de verdade. */
function fonte(teto: number) {
  const chamadas: [number, number][] = [];
  const buscar = async (a: Date, b: Date) => {
    chamadas.push([(a.getTime() - de.getTime()) / HORA, (b.getTime() - de.getTime()) / HORA]);
    const itens: number[] = [];
    for (
      let t = Math.ceil((a.getTime() - de.getTime()) / HORA);
      t * HORA < b.getTime() - de.getTime();
      t++
    ) {
      itens.push(t);
    }
    return itens.slice(0, teto);
  };
  return { buscar, chamadas };
}

describe('buscarFatiado', () => {
  it('divide o período em janelas do tamanho pedido (a última fica menor)', async () => {
    const { buscar, chamadas } = fonte(1_000);
    const itens = await buscarFatiado(
      de,
      new Date(de.getTime() + 10 * DIA),
      4 * DIA,
      1_000,
      buscar,
    );

    expect(chamadas).toEqual([
      [0, 96],
      [96, 192],
      [192, 240],
    ]);
    expect(itens).toEqual(Array.from({ length: 240 }, (_, i) => i));
  });

  it('refaz em metades a janela que voltou no teto, sem aceitar a lista cortada', async () => {
    const { buscar, chamadas } = fonte(48);
    const itens = await buscarFatiado(de, new Date(de.getTime() + 4 * DIA), 4 * DIA, 48, buscar);

    expect(itens).toEqual(Array.from({ length: 96 }, (_, i) => i));
    expect(chamadas[0]).toEqual([0, 96]);
    // 96 h → 2 × 48 h (no teto de novo) → 4 × 24 h.
    expect(chamadas.slice(1)).toEqual([
      [0, 48],
      [0, 24],
      [24, 48],
      [48, 96],
      [48, 72],
      [72, 96],
    ]);
  });

  it('falha se mesmo uma janela de 1 minuto volta no teto', async () => {
    const buscar = async () => [1, 2];
    await expect(
      buscarFatiado(de, new Date(de.getTime() + DIA), DIA, 2, buscar),
    ).rejects.toMatchObject({ tipo: 'resposta_inesperada' });
  });
});
