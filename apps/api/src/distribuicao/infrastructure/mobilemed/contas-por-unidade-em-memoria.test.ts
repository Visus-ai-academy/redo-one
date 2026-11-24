import { describe, expect, it } from 'vitest';

import { ContasPorUnidadeEmMemoria } from './contas-por-unidade-em-memoria';

const MIN = 60_000;

const criar = () => {
  let agora = new Date('2026-11-24T12:00:00Z');
  const lidas: number[] = [];
  const falhar = new Set<number>();
  const listas: Record<number, number[]> = { 10: [101, 102], 20: [101] };
  const fonte = {
    async medicosDaUnidade(unidade: number) {
      lidas.push(unidade);
      if (falhar.has(unidade)) throw new Error('MobileMed indisponível');
      return (listas[unidade] ?? []).map((id) => ({ id, nome: `Dr. ${id}` }));
    },
  };
  const cache = new ContasPorUnidadeEmMemoria(fonte, () => agora);
  return {
    cache,
    lidas,
    falhar,
    listas,
    passar: (min: number) => {
      agora = new Date(agora.getTime() + min * MIN);
    },
  };
};

describe('ContasPorUnidadeEmMemoria', () => {
  it('lê cada unidade uma vez e guarda entre chamadas dentro da validade', async () => {
    const { cache, lidas, passar } = criar();
    const a = await cache.liberadas([10, 20, 10], 240);
    expect(a.porUnidade).toEqual(
      new Map([
        [10, new Set([101, 102])],
        [20, new Set([101])],
      ]),
    );
    expect(a).toMatchObject({ falharam: [], lidasAgora: 2 });
    passar(239);
    const b = await cache.liberadas([10, 20], 240);
    expect(b.lidasAgora).toBe(0);
    expect(lidas).toEqual([10, 20]);
  });

  it('a lista vencida é lida de novo; validade 0 relê sempre', async () => {
    const { cache, lidas, listas, passar } = criar();
    await cache.liberadas([10], 240);
    listas[10] = [102];
    passar(241);
    expect((await cache.liberadas([10], 240)).porUnidade.get(10)).toEqual(new Set([102]));
    await cache.liberadas([10], 0);
    expect(lidas).toEqual([10, 10, 10]);
  });

  it('a unidade que falha fica de fora (sem filtro) e não é guardada', async () => {
    const { cache, falhar, lidas } = criar();
    falhar.add(20);
    const r = await cache.liberadas([10, 20], 240);
    expect([...r.porUnidade.keys()]).toEqual([10]);
    expect(r.falharam).toEqual([20]);
    falhar.clear();
    const de = await cache.liberadas([20], 240);
    expect(de.porUnidade.get(20)).toEqual(new Set([101]));
    expect(lidas).toEqual([10, 20, 20]);
  });
});
