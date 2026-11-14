import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePaginaLocal } from './use-pagina-local';

const itens = Array.from({ length: 26 }, (_, i) => i + 1);

describe('usePaginaLocal', () => {
  it('mostra a primeira página e o total', () => {
    const { result } = renderHook(() => usePaginaLocal(itens, 10));

    expect(result.current.itensDaPagina).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.current.pagina).toBe(1);
    expect(result.current.total).toBe(26);
  });

  it('vai para outra página', () => {
    const { result } = renderHook(() => usePaginaLocal(itens, 10));

    act(() => result.current.irPara(3));

    expect(result.current.itensDaPagina).toEqual([21, 22, 23, 24, 25, 26]);
  });

  it('se a lista encolher (ex.: encerrou sessões), volta para a última página que existe', () => {
    const { result, rerender } = renderHook(({ lista }) => usePaginaLocal(lista, 10), {
      initialProps: { lista: itens },
    });
    act(() => result.current.irPara(3));

    rerender({ lista: itens.slice(0, 12) });

    expect(result.current.pagina).toBe(2);
    expect(result.current.itensDaPagina).toEqual([11, 12]);
  });

  it('cabendo numa página, diz que não precisa paginar', () => {
    const { result } = renderHook(() => usePaginaLocal(itens.slice(0, 4), 10));

    expect(result.current.precisaPaginar).toBe(false);
  });
});
