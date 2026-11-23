import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFaseDoCarregamento } from './use-fase-do-carregamento';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const montar = (carregando: boolean) =>
  renderHook(({ c }) => useFaseDoCarregamento(c), { initialProps: { c: carregando } });

describe('useFaseDoCarregamento', () => {
  it('com os dados já na mão, mostra o conteúdo direto', () => {
    expect(montar(false).result.current).toBe('conteudo');
  });

  it('nos primeiros 200ms sem dados, só reserva o espaço (sem skeleton)', () => {
    const { result } = montar(true);
    expect(result.current).toBe('reservado');
    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe('reservado');
  });

  it('resposta rápida troca direto para o conteúdo, sem piscar o skeleton', () => {
    const { result, rerender } = montar(true);
    act(() => vi.advanceTimersByTime(150));
    rerender({ c: false });
    expect(result.current).toBe('conteudo');
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('conteudo');
  });

  it('depois de 200ms sem dados, mostra o skeleton', () => {
    const { result } = montar(true);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('esqueleto');
  });

  it('o skeleton que apareceu fica no mínimo 400ms, mesmo que os dados cheguem antes', () => {
    const { result, rerender } = montar(true);
    act(() => vi.advanceTimersByTime(250));
    rerender({ c: false });
    expect(result.current).toBe('esqueleto');
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('esqueleto');
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('conteudo');
  });
});
