import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const PRIMARY_COLORS = ['default', 'teal', 'indigo', 'slate'] as const;
export type PrimaryColor = (typeof PRIMARY_COLORS)[number];

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: 'روشن',
  dark: 'تاریک',
  system: 'مطابق سیستم',
};

export const PRIMARY_COLOR_LABELS: Record<PrimaryColor, string> = {
  default: 'آبی سازمانی',
  teal: 'فیروزه‌ای',
  indigo: 'بنفش',
  slate: 'خاکستری',
};

interface ThemeContextValue {
  mode: ThemeMode;
  primary: PrimaryColor;
  setMode: (mode: ThemeMode) => void;
  setPrimary: (color: PrimaryColor) => void;
  /** تم مؤثر پس از حل «مطابق سیستم». */
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const MODE_KEY = 'dm.theme.mode';
const PRIMARY_KEY = 'dm.theme.primary';

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored(MODE_KEY, THEME_MODES, 'system'));
  const [primary, setPrimaryState] = useState<PrimaryColor>(() =>
    readStored(PRIMARY_KEY, PRIMARY_COLORS, 'default'),
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset['theme'] = resolved;
    if (primary === 'default') {
      delete root.dataset['primary'];
    } else {
      root.dataset['primary'] = primary;
    }
  }, [resolved, primary]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    window.localStorage.setItem(MODE_KEY, next);
  }, []);

  const setPrimary = useCallback((next: PrimaryColor) => {
    setPrimaryState(next);
    window.localStorage.setItem(PRIMARY_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, primary, setMode, setPrimary, resolved }),
    [mode, primary, setMode, setPrimary, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme باید درون ThemeProvider استفاده شود');
  }
  return context;
}
