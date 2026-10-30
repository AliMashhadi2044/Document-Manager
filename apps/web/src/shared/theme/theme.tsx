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
import { PRIMARY_COLORS, THEME_MODES, type PrimaryColor, type ThemeMode } from '@dm/shared';

import { usePreferences } from '../preferences/preferences';

/*
 * فهرست تم‌ها و رنگ‌ها در `@dm/shared` است، نه اینجا.
 *
 * سرور همان فهرست را اعتبارسنجی می‌کند؛ دو نسخهٔ جداگانه یعنی رنگی که رابط نشان
 * می‌دهد و سرور ردش می‌کند. از اینجا دوباره صادر می‌شود تا هر جای رابط که تم را
 * می‌شناسد، از همین یک جا بخواند.
 */
export { PRIMARY_COLORS, THEME_MODES };
export type { PrimaryColor, ThemeMode };

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

/**
 * تم و رنگ، از پروفایل کاربر.
 *
 * هیچ حالت محلی‌ای کنار ترجیح نگه داشته نمی‌شود: مقدار جاری **همان** چیزی است که
 * ذخیره شده، وگرنه دو منبع حقیقت پیدا می‌شد و با رسیدن پاسخ سرور، آن‌که روی صفحه
 * است و آن‌که در پروفایل است فرق می‌کردند.
 */
export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const { prefs, update } = usePreferences();
  const mode = prefs.theme;
  const primary = prefs.primaryColor;
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
    const apply = (): void => update((prev) => ({ ...prev, theme: next }));

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startViewTransition = document.startViewTransition?.bind(document);

    if (!origin || reduced || startViewTransition === undefined) {
      apply();
      return;
    }

    const transition = startViewTransition(() => {
      flushSync(apply);
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
  }, [update]);

  const setPrimary = useCallback(
    (next: PrimaryColor) => update((prev) => ({ ...prev, primaryColor: next })),
    [update],
  );

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
