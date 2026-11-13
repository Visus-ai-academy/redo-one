export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function systemPrefersDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme, systemPrefersDark());
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage indisponível (modo privado, bloqueado): o tema vale só para esta sessão.
  }
}

/** Aplica o tema salvo antes da primeira pintura, evitando o "flash" do tema claro no SSR. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&matchMedia('${DARK_QUERY}').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
