import { useCallback, useEffect, useState } from 'react';

import { applyTheme, getStoredTheme, type Theme } from './theme';

/** Tema atual e setter. Em "system", acompanha mudanças do sistema operacional em tempo real. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
