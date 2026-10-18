import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const PRIMARY_COLORS = [
  'default',
  'violet',
  'fuchsia',
  'rose',
  'amber',
  'emerald',
  'teal',
  'cyan',
  'blue',
] as const;
export type PrimaryColor = (typeof PRIMARY_COLORS)[number];

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: 'روشن',
  dark: 'تاریک',
  system: 'مطابق سیستم',
};

export const PRIMARY_COLOR_LABELS: Record<PrimaryColor, string> = {
  default: 'نیلی',
  violet: 'بنفش',
  fuchsia: 'ارغوانی',
  rose: 'سرخابی',
  amber: 'کهربایی',
  emerald: 'زمردی',
  teal: 'فیروزه‌ای',
  cyan: 'لاجوردی',
  blue: 'آبی',
};

/**
 * نمونه رنگ برای دکمه انتخاب رنگ.
 *
 * این مقدارها **تکرار** توکن‌های CSS نیستند بلکه فقط پیش‌نمایش‌اند: رنگ واقعی رابط
 * همیشه از `--primary` می‌آید و با تم روشن/تاریک عوض می‌شود، ولی نمونه باید در هر
 * دو تم یکسان و قابل تشخیص بماند.
 */
export const PRIMARY_COLOR_SWATCHES: Record<PrimaryColor, string> = {
  default: 'hsl(243 68% 56%)',
  violet: 'hsl(277 68% 56%)',
  fuchsia: 'hsl(300 70% 50%)',
  rose: 'hsl(345 70% 52%)',
  amber: 'hsl(35 85% 45%)',
  emerald: 'hsl(152 72% 34%)',
  teal: 'hsl(179 75% 32%)',
  cyan: 'hsl(192 78% 38%)',
  blue: 'hsl(212 72% 48%)',
};

/** نقطه شروع گذار دایره‌ای تم — معمولاً مرکز دکمه‌ای که کاربر زد. */
export interface ThemeOrigin {
  readonly x: number;
  readonly y: number;
}

interface ThemeContextValue {
  mode: ThemeMode;
  primary: PrimaryColor;
  /** `origin` اختیاری است؛ با آن، تغییر تم مثل موجی از همان نقطه باز می‌شود. */
  setMode: (mode: ThemeMode, origin?: ThemeOrigin) => void;
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

  /*
   * اعمال تم **پیش از رنگ‌آمیزی** انجام می‌شود، نه بعدش.
   *
   * دلیلش گذار دایره‌ای پایین است: آنجا با `flushSync` رندر را هم‌زمان می‌کنیم تا
   * مرورگر بتواند از وضعیت تازه عکس بگیرد. یک `useEffect` معمولی **پس از** رنگ‌آمیزی
   * اجرا می‌شود و در آن لحظه هنوز تم عوض نشده است.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset['theme'] = resolved;
    if (primary === 'default') {
      delete root.dataset['primary'];
    } else {
      root.dataset['primary'] = primary;
    }
  }, [resolved, primary]);

  /**
   * تغییر تم با موج دایره‌ای از نقطه کلیک.
   *
   * با View Transitions API کار می‌کند: مرورگر از صفحه قبل و بعد عکس می‌گیرد و ما
   * فقط عکس **تازه** را با یک دایره در حال بزرگ شدن آشکار می‌کنیم. شعاع پایانی تا
   * دورترین گوشه صفحه حساب می‌شود، وگرنه در گوشه‌ها نواری از تم قبلی جا می‌ماند.
   *
   * سه حالت به مسیر ساده برمی‌گردند — بدون هیچ خطا و بدون پرش:
   *  - مرورگری که این API را ندارد،
   *  - کاربری که «کاهش حرکت» را در سیستمش روشن کرده،
   *  - فراخوانی بدون نقطه شروع (مثلاً تغییر تم از جایی غیر از دکمه).
   */
  const setMode = useCallback((next: ThemeMode, origin?: ThemeOrigin) => {
    window.localStorage.setItem(MODE_KEY, next);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startViewTransition = document.startViewTransition?.bind(document);

    if (!origin || reduced || startViewTransition === undefined) {
      setModeState(next);
      return;
    }

    const transition = startViewTransition(() => {
      flushSync(() => setModeState(next));
    });

    void transition.ready.then(() => {
      const radius = Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y),
      );

      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: 620,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    });
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
