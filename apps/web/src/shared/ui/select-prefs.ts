/**
 * توابع چیدن فهرست‌های انتخاب: پین کردن و ترتیب دلخواه.
 *
 * چرا جدا از کامپوننت: این‌ها توابع خالص‌اند و بدون مرورگر هم تست می‌شوند. منطق
 * «کدام گزینه کجا بایستد» جایی است که اشتباه در آن بی‌صدا به کاربر می‌رسد، پس
 * باید تست داشته باشد نه بازرسی چشمی.
 *
 * **محل ذخیره اینجا نیست.** ترجیح‌ها در پروفایل کاربر روی سرور می‌مانند تا روی هر
 * دستگاهی که وارد می‌شود همان چیدمان را ببیند؛ شکل داده و پاک‌سازی‌اش در
 * `@dm/shared` است و خواندن و نوشتنش از `useSelectPrefs`.
 */

export { EMPTY_SELECT_PREFS as EMPTY_PREFS } from '@dm/shared';
export type { SelectPrefs } from '@dm/shared';

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
