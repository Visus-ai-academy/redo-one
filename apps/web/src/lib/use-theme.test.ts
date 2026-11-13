import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY } from './theme';
import { useTheme } from './use-theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  vi.unstubAllGlobals();
});

describe('useTheme', () => {
  it('lê o tema salvo e permite trocá-lo', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');

    act(() => result.current.setTheme('dark'));

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});
