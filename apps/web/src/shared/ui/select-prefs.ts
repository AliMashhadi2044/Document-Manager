/**
 * ترجیح‌های کاربر برای فهرست‌های انتخاب: پین کردن و ترتیب دلخواه.
 *
 * چرا جدا از کامپوننت: این‌ها توابع خالص‌اند و بدون مرورگر هم تست می‌شوند. منطق
 * «کدام گزینه کجا بایستد» جایی است که اشتباه در آن بی‌صدا به کاربر می‌رسد، پس
 * باید تست داشته باشد نه بازرسی چشمی.
 *
 * محل ذخیره `localStorage` است و این یک تصمیم آگاهانه است: محتوای ذخیره‌شده فقط
 * شناسه‌های گزینه‌هایی است که کاربر پین یا جابه‌جا کرده — نه داده مالی، نه نشانه
 * نشست، نه چیزی که افشایش معنادار باشد. هر خواندن و نوشتن هم در `try` است، چون
 * در حالت ناشناس یا با مسدود بودن ذخیره‌سازی، دسترسی به آن **پرتاب خطا می‌کند**.
 */

export interface SelectPrefs {
  /** شناسه گزینه‌های پین‌شده، به ترتیبی که کاربر خواسته. */
  readonly pinned: readonly string[];
  /** ترتیب دلخواه؛ گزینه‌های نیامده در این فهرست، ترتیب طبیعی خود را نگه می‌دارند. */
  readonly order: readonly string[];
  /**
   * عنوان گزینه‌های پین‌شده.
   *
   * برای فهرست‌هایی لازم است که جست‌وجویشان سمت سرور است: گزینهٔ پین‌شده
   * ممکن است در صفحهٔ نتایج جاری نباشد و بین شناسه و عنوانش چیزی در دست نماند.
   */
  readonly labels: Readonly<Record<string, string>>;
}

export const EMPTY_PREFS: SelectPrefs = { pinned: [], order: [], labels: {} };

const PREFIX = 'dm.select.';

/** سقف تعداد شناسه در هر کلید، تا یک فهرست بلند، ذخیره‌ساز را پر نکند. */
const MAX_ENTRIES = 300;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // حالت ناشناس یا مسدود بودن ذخیره‌سازی؛ خودِ دسترسی خطا می‌دهد.
    return null;
  }
}

function sanitize(input: unknown): readonly string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item === 'string' && item !== '' && item.length <= 200) seen.add(item);
    if (seen.size >= MAX_ENTRIES) break;
  }
  return [...seen];
}

export function loadPrefs(key: string | null): SelectPrefs {
  if (!key) return EMPTY_PREFS;
  const store = storage();
  if (!store) return EMPTY_PREFS;

  try {
    const raw = store.getItem(PREFIX + key);
    if (raw === null) return EMPTY_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PREFS;
    const record = parsed as Record<string, unknown>;
    return {
      pinned: sanitize(record.pinned),
      order: sanitize(record.order),
      labels: sanitizeLabels(record.labels),
    };
  } catch {
    // محتوای خراب یا دست‌کاری‌شده نباید فهرست را از کار بیندازد.
    return EMPTY_PREFS;
  }
}

function sanitizeLabels(input: unknown): Readonly<Record<string, string>> {
  if (typeof input !== 'object' || input === null) return {};

  const result: Record<string, string> = {};
  let count = 0;
  for (const [key, label] of Object.entries(input as Record<string, unknown>)) {
    if (typeof label !== 'string' || label === '') continue;
    if (key.length > 200) continue;
    result[key] = label.slice(0, 300);
    if (++count >= MAX_ENTRIES) break;
  }
  return result;
}

export function savePrefs(key: string | null, prefs: SelectPrefs): void {
  if (!key) return;
  const store = storage();
  if (!store) return;

  try {
    if (prefs.pinned.length === 0 && prefs.order.length === 0) {
      store.removeItem(PREFIX + key);
      return;
    }

    // عنوان فقط برای گزینه‌هایی نگه داشته می‌شود که هنوز پین‌اند؛ وگرنه با هر
    // پین و برداشتن، یک رد دائمی از نام رکوردها در مرورگر جمع می‌شود.
    const pinned = prefs.pinned.slice(0, MAX_ENTRIES);
    const labels: Record<string, string> = {};
    for (const value of pinned) {
      const label = prefs.labels[value];
      if (label !== undefined) labels[value] = label;
    }

    store.setItem(
      PREFIX + key,
      JSON.stringify({ pinned, order: prefs.order.slice(0, MAX_ENTRIES), labels }),
    );
  } catch {
    // پر شدن سهمیه ذخیره‌ساز نباید جلوی انتخاب کاربر را بگیرد.
  }
}

export interface Arrangeable {
  readonly value: string;
}

/**
 * چیدن گزینه‌ها بر اساس ترتیب دلخواه.
 *
 * گزینه‌ای که در `order` نیست حذف نمی‌شود؛ پس از گزینه‌های مرتب‌شده و با ترتیب
 * طبیعی خودش می‌آید. همین باعث می‌شود افزودن یک گزینه جدید در سرور، ترتیب
 * ذخیره‌شده کاربر را بی‌اعتبار نکند.
 */
export function applyOrder<T extends Arrangeable>(
  options: readonly T[],
  order: readonly string[],
): T[] {
  if (order.length === 0) return [...options];

  const rank = new Map<string, number>();
  order.forEach((value, index) => rank.set(value, index));

  // ترتیب طبیعی به‌عنوان شکننده تساوی نگه داشته می‌شود تا چیدمان پایدار بماند.
  return [...options]
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      const rankA = rank.get(a.option.value);
      const rankB = rank.get(b.option.value);
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
      if (rankA !== undefined) return -1;
      if (rankB !== undefined) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.option);
}

/**
 * جدا کردن گزینه‌های پین‌شده، با حفظ ترتیبِ پین کردن.
 *
 * `fallback` برای گزینهٔ پین‌شده‌ای است که در `options` نیست — در فهرست‌های
 * سمت‌سرور، صفحهٔ نتایجِ جاری چنین گزینه‌ای را ندارد و بدون این، پینِ کاربر بی‌صدا
 * ناپدید می‌شد.
 */
export function splitPinned<T extends Arrangeable>(
  options: readonly T[],
  pinned: readonly string[],
  fallback?: (value: string) => T | null,
): { pinned: T[]; rest: T[] } {
  if (pinned.length === 0) return { pinned: [], rest: [...options] };

  const byValue = new Map(options.map((option) => [option.value, option]));
  const head: T[] = [];
  for (const value of pinned) {
    const option = byValue.get(value) ?? fallback?.(value) ?? null;
    if (option) head.push(option);
  }

  const pinnedSet = new Set(head.map((option) => option.value));
  return { pinned: head, rest: options.filter((option) => !pinnedSet.has(option.value)) };
}

/**
 * جابه‌جایی یک گزینه با همسایه‌اش **در همان گروه**.
 *
 * `group` فهرست دیده‌شده توسط کاربر است (پین‌شده‌ها یا بقیه). جابه‌جایی باید در
 * همان گروه معنا پیدا کند، وگرنه فشردن «بالا» روی اولین گزینهٔ گروهِ دوم، آن را
 * به میان پین‌شده‌ها می‌پراند — کاری که کاربر نخواسته.
 *
 * خروجی، ترتیب کاملِ جدید است: `order` همیشه پس از اولین جابه‌جایی، صریح می‌شود
 * تا ترتیب به چیدمان پیش‌فرض سرور وابسته نماند.
 */
export function moveInGroup(
  arranged: readonly string[],
  group: readonly string[],
  value: string,
  direction: -1 | 1,
): string[] {
  const position = group.indexOf(value);
  if (position < 0) return [...arranged];

  const neighbour = group[position + direction];
  if (neighbour === undefined) return [...arranged];

  const next = [...arranged];
  const from = next.indexOf(value);
  const to = next.indexOf(neighbour);
  if (from < 0 || to < 0) return next;

  next[from] = neighbour;
  next[to] = value;
  return next;
}

export function togglePinned(pinned: readonly string[], value: string): string[] {
  return pinned.includes(value) ? pinned.filter((item) => item !== value) : [...pinned, value];
}


/**
 * یکدست‌سازی متن فارسی برای مقایسه.
 *
 * بدون این، جست‌وجوی «كتاب» با كافِ عربی، «کتاب» با کافِ فارسی را پیدا نمی‌کند و
 * «۱۴۰۵» با «1405» یکی نیست — دو اشتباهی که کاربر آن‌ها را «جست‌وجو کار نمی‌کند»
 * می‌بیند، نه «املا فرق دارد».
 */
export function normalizeFa(text: string): string {
  let result = '';

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;

    if (code >= 0x06f0 && code <= 0x06f9) {
      result += String(code - 0x06f0);
      continue;
    }
    if (code >= 0x0660 && code <= 0x0669) {
      result += String(code - 0x0660);
      continue;
    }
    // ي و ى → ی ، ك → ک ، ه‌ی پایانی با همزه → ه
    if (code === 0x064a || code === 0x0649) {
      result += 'ی';
      continue;
    }
    if (code === 0x0643) {
      result += 'ک';
      continue;
    }
    if (code === 0x0629) {
      result += 'ه';
      continue;
    }
    // اعراب، تطویل، نیم‌فاصله و نشانه‌های جهت در مقایسه نقشی ندارند.
    if (
      (code >= 0x064b && code <= 0x0652) ||
      code === 0x0640 ||
      code === 0x200c ||
      code === 0x200d ||
      code === 0x200e ||
      code === 0x200f
    ) {
      continue;
    }
    result += character;
  }

  return result.toLowerCase().trim();
}

/** آیا گزینه با متن جست‌وجو می‌خواند؟ عنوان و توضیح، هر دو. */
export function optionMatches(
  option: { readonly label: string; readonly description?: string | undefined },
  query: string,
): boolean {
  const needle = normalizeFa(query);
  if (needle === '') return true;

  if (normalizeFa(option.label).includes(needle)) return true;
  return option.description !== undefined && normalizeFa(option.description).includes(needle);
}
