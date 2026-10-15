/**
 * تاریخ شمسی.
 *
 * قاعده سخت: سرور **هرگز** به تبدیل کلاینت اعتماد نمی‌کند. هر جا تاریخ از اجزای شمسی
 * ساخته می‌شود (مثل فاکتور سوخت)، سرور خودش بازسازی و اعتبارسنجی می‌کند.
 *
 * تاریخ تقویمی همیشه به‌صورت رشته `YYYY-MM-DD` منتقل و در دیتابیس `DATE` ذخیره می‌شود؛
 * هرگز به `Date` با ساعت تبدیل نمی‌شود تا timezone یک روز جابه‌جایش نکند.
 */

import {
  isValidJalaaliDate,
  jalaaliMonthLength,
  isLeapJalaaliYear,
  toGregorian,
  toJalaali,
} from 'jalaali-js';

import { normalizeDigits } from '../money/money';

export interface JalaliDate {
  readonly year: number;
  readonly month: number; // ۱ تا ۱۲
  readonly day: number; // ۱ تا ۳۱
}

/** بازه سال شمسی مجاز سامانه. */
export const MIN_JALALI_YEAR = 1300;
export const MAX_JALALI_YEAR = 1500;

export class JalaliError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'JalaliError';
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapJalaliYear(year: number): boolean {
  return isLeapJalaaliYear(year);
}

/** تعداد روزهای یک ماه شمسی، با در نظر گرفتن کبیسه برای اسفند. */
export function daysInJalaliMonth(year: number, month: number): number {
  assertYearInRange(year);
  assertMonth(month);
  return jalaaliMonthLength(year, month);
}

export function isValidJalaliDate(date: JalaliDate): boolean {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    return false;
  }
  if (date.year < MIN_JALALI_YEAR || date.year > MAX_JALALI_YEAR) return false;
  return isValidJalaaliDate(date.year, date.month, date.day);
}

export function assertValidJalaliDate(date: JalaliDate): void {
  assertYearInRange(date.year);
  assertMonth(date.month);
  if (!Number.isInteger(date.day) || date.day < 1) {
    throw new JalaliError('روز نامعتبر است', 'JALALI_DAY_INVALID');
  }
  const length = jalaaliMonthLength(date.year, date.month);
  if (date.day > length) {
    throw new JalaliError(
      `این ماه ${length} روز دارد و روز ${date.day} معتبر نیست`,
      'JALALI_DAY_OUT_OF_MONTH',
    );
  }
}

function assertYearInRange(year: number): void {
  if (!Number.isInteger(year) || year < MIN_JALALI_YEAR || year > MAX_JALALI_YEAR) {
    throw new JalaliError(
      `سال شمسی باید بین ${MIN_JALALI_YEAR} و ${MAX_JALALI_YEAR} باشد`,
      'JALALI_YEAR_OUT_OF_RANGE',
    );
  }
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new JalaliError('ماه شمسی باید بین ۱ تا ۱۲ باشد', 'JALALI_MONTH_INVALID');
  }
}

/** تاریخ شمسی ⇒ رشته میلادی `YYYY-MM-DD`. */
export function jalaliToIsoDate(date: JalaliDate): string {
  assertValidJalaliDate(date);
  const { gy, gm, gd } = toGregorian(date.year, date.month, date.day);
  return `${pad4(gy)}-${pad2(gm)}-${pad2(gd)}`;
}

/** رشته میلادی `YYYY-MM-DD` ⇒ تاریخ شمسی. */
export function isoDateToJalali(iso: string): JalaliDate {
  const match = ISO_DATE.exec(iso);
  if (!match) {
    throw new JalaliError(`قالب تاریخ باید YYYY-MM-DD باشد: ${iso}`, 'ISO_DATE_INVALID');
  }
  const gy = Number(match[1]);
  const gm = Number(match[2]);
  const gd = Number(match[3]);
  if (gm < 1 || gm > 12 || gd < 1 || gd > 31) {
    throw new JalaliError(`تاریخ میلادی نامعتبر است: ${iso}`, 'ISO_DATE_INVALID');
  }
  const { jy, jm, jd } = toJalaali(gy, gm, gd);
  return { year: jy, month: jm, day: jd };
}

/**
 * ساخت تاریخ کامل از اجزای فاکتور سوخت: سال از سند، ماه از فاکتور، روز از ردیف.
 * اگر روز در آن ماه وجود نداشته باشد (مثلاً ۳۱ در ماه ۳۰ روزه، یا ۳۰ اسفند در سال
 * غیرکبیسه) خطای صریح می‌دهد.
 */
export function buildFuelEntryDate(year: number, month: number, day: number): string {
  return jalaliToIsoDate({ year, month, day });
}

/** قالب نمایشی `۱۴۰۵/۰۷/۱۲` با ارقام فارسی. */
export function formatJalali(date: JalaliDate, options: { persianDigits?: boolean } = {}): string {
  const text = `${pad4(date.year)}/${pad2(date.month)}/${pad2(date.day)}`;
  return options.persianDigits === false ? text : toPersianDigits(text);
}

/** خواندن `۱۴۰۵/۰۷/۱۲` یا `1405-07-12` به تاریخ شمسی. */
export function parseJalali(input: string): JalaliDate {
  const normalized = normalizeDigits(input).trim().replace(/[-.]/g, '/');
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) {
    throw new JalaliError(`قالب تاریخ شمسی نامعتبر است: ${input}`, 'JALALI_FORMAT_INVALID');
  }
  const date: JalaliDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  assertValidJalaliDate(date);
  return date;
}

export function toPersianDigits(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.charCodeAt(0);
    out += code >= 48 && code <= 57 ? String.fromCharCode(code - 48 + 0x06f0) : char;
  }
  return out;
}

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

export function jalaliMonthName(month: number): string {
  assertMonth(month);
  return JALALI_MONTH_NAMES[month - 1] as string;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function pad4(value: number): string {
  return value.toString().padStart(4, '0');
}
