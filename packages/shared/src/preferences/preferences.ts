/**
 * ترجیح‌های شخصی‌سازی کاربر — یک تعریف، برای سرور و مرورگر.
 *
 * تا پیش از این هر کدام از این‌ها در `localStorage` همان مرورگر می‌نشست: کاربری که
 * با گوشی یا رایانهٔ دیگری وارد می‌شد، سامانه را دوباره پیش‌فرض می‌دید. حالا جایشان
 * **پروفایل کاربر روی سرور** است و مرورگر فقط یک نسخهٔ موقت برای نخستین رنگ‌آمیزی
 * نگه می‌دارد.
 *
 * چرا یک سند واحد و نه چند کلید: این‌ها همه با هم خوانده و با هم نوشته می‌شوند، و
 * یک `PUT` واحد یعنی هیچ‌وقت نیمی از ترجیح‌ها ذخیره نشده نمی‌ماند.
 *
 * محتوایش هیچ داده حساسی نیست — شناسهٔ گزینه‌های پین‌شده، نام بخش، تم و رنگ — ولی
 * ورودی باز هم کامل اعتبارسنجی می‌شود: این بدنه از مرورگر می‌آید و سقف‌های پایین،
 * همان چیزی است که نگذاشت کسی با یک درخواست، مگابایت‌ها در ردیف پروفایلش بنشاند.
 */

import { z } from 'zod';

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

/** سقف شناسه در هر فهرست انتخاب، و سقف تعداد فهرست‌ها. */
export const MAX_SELECT_ENTRIES = 300;
export const MAX_SELECT_KEYS = 100;

const idList = z
  .array(z.string().min(1).max(200))
  .max(MAX_SELECT_ENTRIES)
  .default([]);

export const selectPrefsSchema = z.object({
  /** شناسهٔ گزینه‌های پین‌شده، به ترتیبی که کاربر خواسته. */
  pinned: idList,
  /** ترتیب دلخواه؛ گزینهٔ نیامده در این فهرست، ترتیب طبیعی خود را نگه می‌دارد. */
  order: idList,
  /**
   * عنوان گزینه‌های پین‌شده.
   *
   * برای فهرست‌هایی لازم است که جست‌وجویشان سمت سرور است: گزینهٔ پین‌شده ممکن است
   * در صفحهٔ نتایج جاری نباشد و بدون عنوان، پینِ کاربر بی‌صدا ناپدید می‌شد.
   */
  labels: z.record(z.string().max(200), z.string().min(1).max(300)).default({}),
});

export type SelectPrefs = z.infer<typeof selectPrefsSchema>;

export const EMPTY_SELECT_PREFS: SelectPrefs = { pinned: [], order: [], labels: {} };

export const TABLE_DENSITIES = ['comfortable', 'compact'] as const;
export type TableDensity = (typeof TABLE_DENSITIES)[number];

export const TABLE_DENSITY_LABELS: Record<TableDensity, string> = {
  comfortable: 'راحت',
  compact: 'فشرده',
};

/** اندازه‌های مجاز صفحه؛ سقفش همان سقف سرور است. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const userPreferencesSchema = z.object({
  theme: z.enum(THEME_MODES).default('system'),
  primaryColor: z.enum(PRIMARY_COLORS).default('default'),
  /**
   * آخرین بخشِ باز.
   *
   * اعتبارش سمت مرورگر سنجیده می‌شود (کلید ناشناس یا بخشی که کاربر مجوزش را ندارد
   * نادیده گرفته می‌شود)؛ سرور فقط یک رشتهٔ کوتاه نگه می‌دارد و هیچ معنایی از آن
   * برنمی‌دارد. ذخیرهٔ نام بخش، **دسترسی نمی‌دهد** — مرجع دسترسی همان مجوزهاست.
   */
  lastSection: z.string().min(1).max(60).nullable().default(null),
  /** فشردگی جدول‌ها. */
  density: z.enum(TABLE_DENSITIES).default('comfortable'),

  /**
   * تعداد ردیف در هر صفحه.
   *
   * سقفش با سقف سرور یکی است؛ عدد بزرگ‌تر از آن، همان‌جا رد می‌شود و رابط نباید
   * چیزی را نشان دهد که سرور نمی‌پذیرد.
   */
  pageSize: z.coerce.number().int().min(10).max(100).default(25),

  /**
   * ستون‌های **پنهان‌شده** در هر جدول، با کلیدِ همان جدول.
   *
   * پنهان‌شده‌ها ذخیره می‌شوند نه نمایش‌داده‌شده‌ها: ستونی که فردا به جدول اضافه
   * شود باید **دیده شود**، نه اینکه چون در فهرست ذخیره‌شده نبوده پنهان بماند.
   */
  hiddenColumns: z
    .record(z.string().min(1).max(120), z.array(z.string().min(1).max(120)).max(100))
    .default({}),

  /** ترجیح هر فهرست انتخاب، با کلیدِ همان فهرست. */
  select: z
    .record(z.string().min(1).max(120), selectPrefsSchema)
    .default({})
    .refine((value) => Object.keys(value).length <= MAX_SELECT_KEYS, {
      message: `حداکثر ${MAX_SELECT_KEYS} فهرست می‌تواند ترجیح داشته باشد`,
    }),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  primaryColor: 'default',
  lastSection: null,
  density: 'comfortable',
  pageSize: 25,
  hiddenColumns: {},
  select: {},
};

/**
 * خواندنِ بخشنده: هر چیزی که معنا دارد نگه داشته می‌شود، بقیه پیش‌فرض می‌گیرد.
 *
 * ردیفی که از نسخهٔ قدیمی‌تر سامانه مانده یا نسخهٔ موقت مرورگر که دستکاری شده،
 * نباید کاربر را با صفحهٔ خطا روبه‌رو کند؛ ترجیح نمایشی ارزش شکستنِ ورود را ندارد.
 */
export function parsePreferences(input: unknown): UserPreferences {
  const parsed = userPreferencesSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return {
    theme: pick(record.theme, THEME_MODES, 'system'),
    primaryColor: pick(record.primaryColor, PRIMARY_COLORS, 'default'),
    lastSection:
      typeof record.lastSection === 'string' && record.lastSection !== ''
        ? record.lastSection.slice(0, 60)
        : null,
    density: pick(record.density, TABLE_DENSITIES, 'comfortable'),
    pageSize: salvagePageSize(record.pageSize),
    hiddenColumns: salvageHiddenColumns(record.hiddenColumns),
    select: salvageSelect(record.select),
  };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function salvagePageSize(value: unknown): number {
  // همان دامنه‌ای که schema می‌پذیرد — نه فهرست `PAGE_SIZES`، چون آن فقط گزینه‌های
  // رابط است و عدد دیگری که از قبل ذخیره شده نباید بی‌دلیل دور ریخته شود.
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 10 && parsed <= 100 ? parsed : 25;
}

function salvageHiddenColumns(input: unknown): Record<string, string[]> {
  if (typeof input !== 'object' || input === null) return {};

  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === '' || key.length > 120 || !Array.isArray(value)) continue;
    result[key] = value.filter(
      (item): item is string => typeof item === 'string' && item !== '' && item.length <= 120,
    );
    if (Object.keys(result).length >= MAX_SELECT_KEYS) break;
  }
  return result;
}

function salvageSelect(input: unknown): Record<string, SelectPrefs> {
  if (typeof input !== 'object' || input === null) return {};

  const result: Record<string, SelectPrefs> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === '' || key.length > 120) continue;
    const parsed = selectPrefsSchema.safeParse(value);
    if (!parsed.success) continue;
    result[key] = parsed.data;
    if (Object.keys(result).length >= MAX_SELECT_KEYS) break;
  }
  return result;
}

/**
 * پاک‌سازی ترجیح یک فهرست پیش از ذخیره.
 *
 * `null` یعنی «این کلید را دور بریز»: ترجیحِ خالی ردیفی در پروفایل لازم ندارد و
 * نگه داشتنش فقط سهمیه را پر می‌کرد.
 *
 * عنوان‌ها فقط برای گزینه‌هایی می‌مانند که هنوز پین‌اند؛ وگرنه با هر پین و برداشتن،
 * ردی دائمی از نام رکوردها در پروفایل جمع می‌شد.
 */
export function normalizeSelectPrefs(prefs: SelectPrefs): SelectPrefs | null {
  if (prefs.pinned.length === 0 && prefs.order.length === 0) return null;

  const pinned = [...new Set(prefs.pinned)].slice(0, MAX_SELECT_ENTRIES);
  const labels: Record<string, string> = {};
  for (const value of pinned) {
    const label = prefs.labels[value];
    if (label !== undefined && label !== '') labels[value] = label.slice(0, 300);
  }

  return {
    pinned,
    order: [...new Set(prefs.order)].slice(0, MAX_SELECT_ENTRIES),
    labels,
  };
}
