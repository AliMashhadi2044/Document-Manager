import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PREFERENCES,
  EMPTY_SELECT_PREFS,
  normalizeSelectPrefs,
  parsePreferences,
  type SelectPrefs,
  type UserPreferences,
} from '@dm/shared';

import { apiFetch } from '../api/client';

/**
 * شخصی‌سازی کاربر — روی سرور، با یک نسخهٔ موقت در مرورگر.
 *
 * مرجع، **پروفایل کاربر روی سرور** است: کسی که با گوشی یا رایانهٔ دیگری وارد
 * می‌شود همان تم، همان رنگ، همان پین‌ها و همان بخشِ آخر را می‌بیند.
 *
 * ولی یک نسخهٔ موقت در `localStorage` هم می‌ماند و این عمدی است: تم باید **پیش از
 * نخستین رنگ‌آمیزی** معلوم باشد، وگرنه کاربرِ تم تاریک هر بار یک پرش سفید می‌دید.
 * پس مقدار اولیه از همان نسخه خوانده می‌شود و به‌محض رسیدن پاسخ سرور، جایش را به
 * آن می‌دهد. چیزی که در آن می‌نشیند همان است که در پروفایل است — نه نشانهٔ نشست و
 * نه داده‌ای که افشایش معنا داشته باشد (docs/10-security-plan.md).
 *
 * روی دستگاه مشترک، تا رسیدن پاسخِ ورودِ بعدی، تمِ کاربر قبلی دیده می‌شود؛ یک
 * ترجیح نمایشی است و چند صد میلی‌ثانیه بعد اصلاح می‌شود.
 */

const CACHE_KEY = 'dm.prefs';

/** تایپ یا فشردن پیاپی کلید جابه‌جایی، نباید به‌ازای هر نویسه یک درخواست بفرستد. */
const PUSH_DELAY_MS = 400;

function readCache(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw === null) return DEFAULT_PREFERENCES;
    return parsePreferences(JSON.parse(raw));
  } catch {
    // حالت ناشناس، ذخیره‌ساز مسدود، یا محتوای خراب؛ هیچ‌کدام نباید برنامه را بخواباند.
    return DEFAULT_PREFERENCES;
  }
}

function writeCache(prefs: UserPreferences): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // پر بودن سهمیه فقط یعنی نخستین رنگ‌آمیزیِ بار بعد پیش‌فرض است، نه خطا.
  }
}

/**
 * پاک کردن نسخهٔ موقت، هنگام خروج.
 *
 * روی دستگاه مشترک، بدون این، کاربر بعدی تا رسیدن پاسخ سرور تم و رنگ نفر قبل را
 * می‌دید — و اگر سرور در دسترس نبود، همان‌طور می‌ماند.
 */
export function clearPreferencesCache(): void {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ذخیره‌ساز مسدود؛ چیزی هم برای پاک کردن نبوده است.
  }
}

interface PreferencesContextValue {
  readonly prefs: UserPreferences;
  /** تغییر ترجیح؛ با تابع، تا روی مقدار جاری بنشیند و نه روی عکسِ کهنه‌ای از آن. */
  update: (updater: (prev: UserPreferences) => UserPreferences) => void;
  /** خواندن دوبارهٔ پروفایل از سرور — پس از ورود. */
  reload: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }): JSX.Element {
  const [prefs, setPrefs] = useState<UserPreferences>(readCache);

  /** ترجیحِ در صفِ ارسال؛ تا فرستاده نشود، پاسخ سرور نباید رویش بنشیند. */
  const pending = useRef<UserPreferences | null>(null);
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const body = pending.current;
    if (!body) return;
    pending.current = null;

    // `keepalive` برای همین لحظه است: بستن برگه نباید آخرین تغییر را دور بریزد.
    void apiFetch('/preferences', { method: 'PUT', json: body, keepalive: true }).catch(() => {
      // ذخیره نشدن ترجیح نباید به کاربر خطا نشان دهد؛ نسخهٔ موقت همان را دارد.
    });
  }, []);

  const update = useCallback(
    (updater: (prev: UserPreferences) => UserPreferences) => {
      setPrefs((prev) => {
        const next = updater(prev);
        writeCache(next);
        pending.current = next;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, PUSH_DELAY_MS);
        return next;
      });
    },
    [flush],
  );

  const reload = useCallback(() => {
    void apiFetch<unknown>('/preferences')
      .then((server) => {
        // تغییری که همین حالا در صف ارسال است، تازه‌تر از پاسخ سرور است.
        if (pending.current) return;
        const next = parsePreferences(server);
        setPrefs(next);
        writeCache(next);
      })
      .catch(() => {
        // کاربری که وارد نشده ۴۰۱ می‌گیرد؛ همان نسخهٔ موقت کافی است.
      });
  }, []);

  /*
    دو برگهٔ باز، ترجیح‌های هم را بازنویسی نکنند.

    `PUT` کل سند را جایگزین می‌کند، پس برگه‌ای که از تغییر برگهٔ دیگر بی‌خبر است با
    نوشتن بعدی‌اش آن را پاک می‌کرد. رویداد `storage` فقط در **برگه‌های دیگرِ** همان
    مرورگر می‌آید و دقیقاً همین شکاف را می‌بندد.

    دو مرورگر یا دو دستگاه همچنان «آخرین نویسنده برنده» می‌مانند؛ آنجا دو کاربرِ
    هم‌زمانِ واقعی‌اند و ترجیحِ تازه‌تر همان است که باید بماند.
  */
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== CACHE_KEY || event.newValue === null) return;
      // تغییرِ در صفِ ارسالِ همین برگه، تازه‌تر از چیزی است که برگهٔ دیگر نوشته.
      if (pending.current) return;

      try {
        setPrefs(parsePreferences(JSON.parse(event.newValue)));
      } catch {
        // محتوای خراب از برگهٔ دیگر؛ همان ترجیح جاری می‌ماند.
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // بستن برگه یا رفتن به پشت‌زمینه در موبایل: آخرین تغییر باید برود.
  useEffect(() => {
    const onHide = (): void => flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush();
    };
  }, [flush]);

  const value = useMemo<PreferencesContextValue>(
    () => ({ prefs, update, reload }),
    [prefs, update, reload],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences باید درون PreferencesProvider استفاده شود');
  }
  return context;
}

/**
 * هم‌گام‌سازی پروفایل با سرور، به‌ازای هر ورود.
 *
 * جدا از خودِ Provider است چون Provider بالای صفحهٔ ورود می‌نشیند و آنجا هنوز
 * کاربری نیست؛ این قلاب را پوسته پس از معلوم شدن نشست صدا می‌زند.
 */
export function useSyncPreferences(userId: string | null): void {
  const { reload } = usePreferences();
  useEffect(() => {
    if (userId === null) return;
    reload();
  }, [userId, reload]);
}

/**
 * تعداد ردیف در هر صفحه.
 *
 * قلاب‌های فهرست خودشان این را می‌خوانند، نه صفحه‌ها: ترجیح کاربر باید در **همهٔ**
 * فهرست‌ها اثر کند و وادار کردن هر صفحه به پاس دادنش، یعنی فهرستی که یادمان رفته.
 */
export function usePageSize(): number {
  return usePreferences().prefs.pageSize;
}

/** فشردگی جدول‌ها. */
export function useDensity(): 'comfortable' | 'compact' {
  return usePreferences().prefs.density;
}

/**
 * ستون‌های پنهانِ یک جدول، و راه عوض کردنشان.
 *
 * `key` نام همان جدول است؛ جدولی که کلید ندارد، ستون‌هایش قابل پنهان کردن نیست.
 */
export function useHiddenColumns(key: string | null): {
  hidden: readonly string[];
  toggle: (column: string) => void;
  showAll: () => void;
} {
  const { prefs, update } = usePreferences();
  const hidden = key === null ? [] : (prefs.hiddenColumns[key] ?? []);

  const toggle = useCallback(
    (column: string) => {
      if (key === null) return;
      update((prev) => {
        const current = prev.hiddenColumns[key] ?? [];
        const next = current.includes(column)
          ? current.filter((item) => item !== column)
          : [...current, column];

        const hiddenColumns = { ...prev.hiddenColumns };
        // جدولی که همهٔ ستون‌هایش دیده می‌شوند، کلیدی در پروفایل لازم ندارد.
        if (next.length === 0) delete hiddenColumns[key];
        else hiddenColumns[key] = next;

        return { ...prev, hiddenColumns };
      });
    },
    [key, update],
  );

  const showAll = useCallback(() => {
    if (key === null) return;
    update((prev) => {
      const hiddenColumns = { ...prev.hiddenColumns };
      delete hiddenColumns[key];
      return { ...prev, hiddenColumns };
    });
  }, [key, update]);

  return { hidden, toggle, showAll };
}

/** ترجیح یک فهرست انتخاب، و راه عوض کردنش. */
export function useSelectPrefs(key: string | null): {
  prefs: SelectPrefs;
  save: (next: SelectPrefs) => void;
} {
  const { prefs: all, update } = usePreferences();
  const stored = key === null ? undefined : all.select[key];

  const save = useCallback(
    (next: SelectPrefs) => {
      if (key === null) return;
      update((prev) => {
        const select = { ...prev.select };
        const normalized = normalizeSelectPrefs(next);
        // ترجیح خالی، کلیدی در پروفایل لازم ندارد.
        if (normalized) select[key] = normalized;
        else delete select[key];
        return { ...prev, select };
      });
    },
    [key, update],
  );

  return { prefs: stored ?? EMPTY_SELECT_PREFS, save };
}
