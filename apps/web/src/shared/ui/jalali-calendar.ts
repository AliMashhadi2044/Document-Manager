import {
  MAX_JALALI_YEAR,
  MIN_JALALI_YEAR,
  daysInJalaliMonth,
  isoDateToJalali,
  jalaliToIsoDate,
  type JalaliDate,
} from '@dm/shared';

/**
 * توابع خالصِ تقویم شمسی برای انتخابگر تاریخ.
 *
 * چرا جدا از کامپوننت: ساخت شبکهٔ ماه، جابه‌جایی ماه و منطق بازه، همان جاهایی‌اند که
 * خطای خاموش می‌دهند (ماه ۳۰ یا ۳۱ روزه، اسفند کبیسه، ستون اول هفته). اینجا بدون
 * DOM آزمون می‌شوند.
 *
 * تبدیل شمسی ↔ میلادی از `@dm/shared` می‌آید — **همان تابعی که سرور استفاده
 * می‌کند**؛ تقویم دوم و متفاوتی در کلاینت ساخته نمی‌شود (ریسک R12).
 */

/** هفتهٔ ایرانی از شنبه شروع می‌شود. */
export const WEEKDAY_LABELS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

export interface DayCell {
  /** تاریخ میلادی `YYYY-MM-DD` — همان قراردادِ مرزِ API. */
  readonly iso: string;
  readonly jalali: JalaliDate;
  /** روزهای ماه قبل و بعد که برای پر کردن شبکه می‌آیند. */
  readonly outside: boolean;
}

/**
 * ستون روز در هفتهٔ شمسی: شنبه ۰ … جمعه ۶.
 *
 * `getUTCDay` یکشنبه را ۰ می‌گیرد؛ `+1 % 7` همان را به تقویم شنبه‌شروع می‌برد.
 * عمداً UTC است: با وقت محلی، تاریخِ همان روز در مناطق زمانی منفی یک روز عقب
 * می‌افتد و کل شبکه یک خانه می‌لغزد.
 */
export function weekdayIndex(iso: string): number {
  const date = new Date(`${iso}T00:00:00Z`);
  return (date.getUTCDay() + 1) % 7;
}

/** جابه‌جایی ماه با سرریز سال، بدون عبور از مرزهای مجاز تقویم. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = (year * 12 + (month - 1)) + delta;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;

  if (nextYear < MIN_JALALI_YEAR) return { year: MIN_JALALI_YEAR, month: 1 };
  if (nextYear > MAX_JALALI_YEAR) return { year: MAX_JALALI_YEAR, month: 12 };
  return { year: nextYear, month: nextMonth };
}

/**
 * شبکهٔ یک ماه: همیشه هفته‌های کامل، با روزهای ماه‌های همسایه.
 *
 * طول ثابت (۴۲ خانه) عمدی **نیست**؛ تعداد هفته‌ها از خودِ ماه درمی‌آید تا شبکه در
 * ماه‌های کوتاه یک ردیف خالیِ اضافه نداشته باشد.
 */
export function buildMonthGrid(year: number, month: number): DayCell[] {
  const firstIso = jalaliToIsoDate({ year, month, day: 1 });
  const leading = weekdayIndex(firstIso);
  const length = daysInJalaliMonth(year, month);

  const cells: DayCell[] = [];

  const previous = shiftMonth(year, month, -1);
  const previousLength = daysInJalaliMonth(previous.year, previous.month);
  for (let index = leading; index > 0; index -= 1) {
    const day = previousLength - index + 1;
    cells.push(cell(previous.year, previous.month, day, true));
  }

  for (let day = 1; day <= length; day += 1) {
    cells.push(cell(year, month, day, false));
  }

  const next = shiftMonth(year, month, 1);
  let day = 1;
  while (cells.length % 7 !== 0) {
    cells.push(cell(next.year, next.month, day, true));
    day += 1;
  }

  return cells;
}

function cell(year: number, month: number, day: number, outside: boolean): DayCell {
  const jalali: JalaliDate = { year, month, day };
  return { iso: jalaliToIsoDate(jalali), jalali, outside };
}

/** امروز، به تاریخ میلادی `YYYY-MM-DD` و با وقت محلی کاربر. */
export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** ماهی که انتخابگر باید روی آن باز شود. */
export function monthOf(iso: string | null): { year: number; month: number } {
  const jalali = isoDateToJalali(iso ?? todayIso());
  return { year: jalali.year, month: jalali.month };
}

/** مقایسهٔ تاریخ‌های `YYYY-MM-DD` — رشته‌ای، چون قالب خودش مرتب‌شدنی است. */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function isWithin(iso: string, from: string | null, to: string | null): boolean {
  if (from === null || to === null) return false;
  return iso >= from && iso <= to;
}

/**
 * افزودن روز به یک تاریخ میلادی.
 *
 * روی UTC انجام می‌شود تا تغییر ساعت تابستانی، «۷ روز قبل» را ۶ روز و ۲۳ ساعت نکند.
 */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface QuickRange {
  readonly key: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

/**
 * بازه‌های آماده — همان‌هایی که در گزارش‌گیری مدام لازم می‌شوند.
 *
 * `today` پارامتر است و نه `todayIso()` درونی، تا آزمون بتواند یک روز ثابت بدهد.
 */
export function quickRanges(today = todayIso()): QuickRange[] {
  const jalali = isoDateToJalali(today);
  const monthStart = jalaliToIsoDate({ year: jalali.year, month: jalali.month, day: 1 });
  const previous = shiftMonth(jalali.year, jalali.month, -1);
  const previousStart = jalaliToIsoDate({ year: previous.year, month: previous.month, day: 1 });
  const previousEnd = jalaliToIsoDate({
    year: previous.year,
    month: previous.month,
    day: daysInJalaliMonth(previous.year, previous.month),
  });

  return [
    { key: 'last7', label: '۷ روز اخیر', from: addDays(today, -6), to: today },
    { key: 'last30', label: '۳۰ روز اخیر', from: addDays(today, -29), to: today },
    { key: 'thisMonth', label: 'این ماه', from: monthStart, to: today },
    { key: 'lastMonth', label: 'ماه گذشته', from: previousStart, to: previousEnd },
    {
      key: 'thisYear',
      label: 'از ابتدای سال',
      from: jalaliToIsoDate({ year: jalali.year, month: 1, day: 1 }),
      to: today,
    },
  ];
}

/** `۰۹:۳۰` ← `09:30`؛ مقدار نامعتبر `null` می‌شود. */
export function parseTime(raw: string): string | null {
  let digits = '';
  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) digits += char;
    else if (code >= 0x06f0 && code <= 0x06f9) digits += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) digits += String(code - 0x0660);
  }

  if (digits.length < 3) return null;

  const padded = digits.slice(0, 4).padStart(4, '0');
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2, 4));
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** جدا کردن تاریخ و ساعت یک مقدار `YYYY-MM-DD` یا `YYYY-MM-DDTHH:mm`. */
export function splitDateTime(value: string | null): { date: string | null; time: string | null } {
  if (!value) return { date: null, time: null };
  const [date, time] = value.split('T');
  return { date: date ?? null, time: time ? time.slice(0, 5) : null };
}

/** چسباندن تاریخ و ساعت؛ بدون ساعت، همان تاریخ برمی‌گردد. */
export function joinDateTime(date: string | null, time: string | null): string | null {
  if (date === null) return null;
  return time === null ? date : `${date}T${time}`;
}
