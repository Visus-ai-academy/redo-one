import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, getStoredTheme, resolveTheme, THEME_STORAGE_KEY } from './theme';

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('usa o tema escolhido quando não é "system"', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('segue a preferência do sistema operacional em "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('getStoredTheme', () => {
  it('retorna "system" quando não há nada salvo ou o valor é inválido', () => {
    expect(getStoredTheme()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'roxo');
    expect(getStoredTheme()).toBe('system');
  });

  it('retorna o tema salvo', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('aplica a classe .dark no <html> e salva a escolha', () => {
    mockSystemDark(false);
    applyTheme('dark');

    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('remove a classe .dark ao voltar para o claro', () => {
    mockSystemDark(true);
    applyTheme('dark');
    applyTheme('light');

    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('em "system", aplica o tema do sistema operacional', () => {
    mockSystemDark(true);
    applyTheme('system');

    expect(document.documentElement).toHaveClass('dark');
  });
});
