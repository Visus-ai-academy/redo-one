import { describe, expect, it } from 'vitest';

import type { Demonstrativo } from '../faturamento/domain/demonstrativo';
import { compararDemonstrativos, type GrupoLegado } from './paridade-demonstrativo';

const item = (membroId: string, arranjo: string, quantidade: number, valorCentavos: number) => ({
  membroId,
  modalidadeId: arranjo,
  especialidadeId: 'e',
  categoriaId: 'c',
  prioridadeId: 'p',
  dia: '2026-10-01',
  unitarioCentavos: quantidade ? valorCentavos / quantidade : null,
  linhaPrecoId: null,
  origem: 'principal' as const,
  como: 'exato' as const,
  quantidade,
  valorCentavos,
  laudos: quantidade,
});

const demonstrativo = (clienteId: string, itens: ReturnType<typeof item>[]): Demonstrativo => ({
  clienteId,
  contratadoId: null,
  laudos: 1,
  quantidade: itens.reduce((s, i) => s + i.quantidade, 0),
  valorCentavos: itens.reduce((s, i) => s + i.valorCentavos, 0),
  quantidadeSemPreco: 0,
  nadaAFaturar: itens.length === 0,
  itens,
});

const nomes = {
  clientes: new Map([
    ['a', 'A'],
    ['b', 'B'],
    ['c', 'C'],
  ]),
  arranjo: (i: { modalidadeId: string }) => i.modalidadeId,
};

const grupo = (
  nomeFantasia: string,
  membros: string[],
  itens: GrupoLegado['itens'],
): GrupoLegado => ({
  nomeFantasia,
  membros,
  valorCentavos: itens.reduce((s, i) => s + i.valorCentavos, 0),
  itens,
});

describe('paridade do demonstrativo com o dashboards-one', () => {
  it('junta os clientes do redo-one no grupo do dashboards-one e diz a causa de cada divergência', () => {
    const r = compararDemonstrativos(
      [
        demonstrativo('a', [item('a', 'MR', 2, 1000)]),
        demonstrativo('b', [item('b', 'MR', 1, 600)]),
        demonstrativo('c', [item('c', 'CT', 3, 900)]),
      ],
      [
        grupo('GRUPO_AB', ['a', 'b'], [{ arranjo: 'MR', quantidade: 3, valorCentavos: 1600 }]),
        grupo('C', ['c'], [{ arranjo: 'CT', quantidade: 3, valorCentavos: 1200 }]),
        grupo('D', ['d'], [{ arranjo: 'RX', quantidade: 1, valorCentavos: 100 }]),
      ],
      nomes,
    );
    const causa = Object.fromEntries(r.grupos.map((g) => [g.grupo, [g.causa, g.clientesRedo]]));
    expect(causa).toEqual({
      GRUPO_AB: ['igual', ['A', 'B']],
      C: ['preco', ['C']],
      D: ['so_no_legado', []],
    });
    expect(r.legadoCentavos).toBe(2900);
    expect(r.redoCentavos).toBe(2500);
  });

  it('quantidade diferente num arranjo é causa "quantidade"; grupo só no redo-one aparece', () => {
    const r = compararDemonstrativos(
      [
        demonstrativo('a', [item('a', 'MR', 3, 1500)]),
        demonstrativo('b', [item('b', 'RX', 1, 100)]),
      ],
      [grupo('A', ['a'], [{ arranjo: 'MR', quantidade: 2, valorCentavos: 1000 }])],
      nomes,
    );
    expect(r.grupos.map((g) => [g.grupo, g.causa])).toEqual([
      ['A', 'quantidade'],
      ['redo:B', 'so_no_redo'],
    ]);
    expect(r.grupos[0]?.arranjos).toEqual([
      {
        arranjo: 'MR',
        legado: { quantidade: 2, valorCentavos: 1000 },
        redo: { quantidade: 3, valorCentavos: 1500 },
      },
    ]);
  });

  it('cliente só com nada a faturar no redo-one e sem grupo lá não é divergência', () => {
    const r = compararDemonstrativos([demonstrativo('a', [])], [], nomes);
    expect(r.grupos.map((g) => g.causa)).toEqual(['igual']);
  });
});
