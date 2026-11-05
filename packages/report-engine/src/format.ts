/**
 * قالب‌بندی مقدار برای نمایش در خروجی گزارش.
 *
 * یک جا، برای همه خروجی‌ها: HTML چاپی، پیش‌نمایش و Excel همگی از همین توابع استفاده
 * می‌کنند تا عدد یک‌جا فارسی و جای دیگر لاتین نشود. (Excel برای سلول عددی مقدار خام را
 * می‌نویسد و قالب را به خود Excel می‌سپارد؛ آنجا هم تصمیم در همین فایل است.)
 */

import { formatJalali, isoDateToJalali, toPersianDigits } from '@dm/shared';

import type { FormatSpec, Value } from './types.js';

const PERSIAN_THOUSAND_SEPARATOR = '٬';

export function formatValue(value: Value, format: FormatSpec): string {
  if (value === null || value === '') {
    return format.emptyText;
  }

  switch (format.kind) {
    case 'currency':
    case 'integer':
      return formatInteger(value, format);

    case 'decimal':
      return formatDecimal(value, format);

    case 'jalaliDate':
      return formatDate(value, format);

    case 'economicCode':
      return formatEconomicCode(String(value), format);

    case 'text':
      return format.persianDigits ? toPersianDigits(String(value)) : String(value);
  }
}

function formatInteger(value: Value, format: FormatSpec): string {
  const text = typeof value === 'bigint' ? value.toString() : String(value);
  const grouped = format.thousandSeparator ? groupDigits(text) : text;
  return format.persianDigits ? toPersianDigits(grouped) : grouped;
}

/**
 * عدد اعشاری از مقدار صحیح مقیاس‌شده.
 *
 * مقدار داخلی همیشه صحیح است (مثلاً تعداد با مقیاس ۱۰۰۰)؛ جای ممیز اینجا گذاشته
 * می‌شود، نه با تقسیم شناور که دقت را از بین می‌برد.
 */
function formatDecimal(value: Value, format: FormatSpec): string {
  const negative = typeof value === 'bigint' && value < 0n;
  const digits = (typeof value === 'bigint' ? (negative ? -value : value) : BigInt(String(value)))
    .toString()
    .padStart(format.decimals + 1, '0');

  const cut = digits.length - format.decimals;
  const whole = digits.slice(0, cut);
  const fraction = digits.slice(cut).replace(/0+$/, '');

  const grouped = format.thousandSeparator ? groupDigits(whole) : whole;
  const joined = fraction === '' ? grouped : `${grouped}.${fraction}`;
  const signed = negative ? `-${joined}` : joined;
  return format.persianDigits ? toPersianDigits(signed) : signed;
}

function formatDate(value: Value, format: FormatSpec): string {
  const iso = String(value).slice(0, 10);
  try {
    return formatJalali(isoDateToJalali(iso), { persianDigits: format.persianDigits });
  } catch {
    // تاریخ نامعتبر پنهان نمی‌شود؛ همان مقدار خام می‌ماند تا خطا دیده شود.
    return format.persianDigits ? toPersianDigits(iso) : iso;
  }
}

/**
 * شماره اقتصادی: گروه‌های چهارتایی با خط تیره (docs/15 §۴).
 *
 * **ولی فقط وقتی که عدد واقعاً شمارهٔ اقتصادی باشد.** همین ستون گاهی کد ملی
 * (ده رقم) یا شناسهٔ ملی (یازده رقم) را نشان می‌دهد — فروشندهٔ حقوقی‌ای که
 * شمارهٔ اقتصادی ندارد. جدا کردنِ آن‌ها چهارتا‌چهارتا، عددی می‌سازد که در هیچ
 * سامانه‌ای به آن شکل نوشته نمی‌شود.
 *
 * مرز، خودِ شکل عدد است و نه یک پرچم کنار داده: شمارهٔ اقتصادی دوازده‌رقمی است و
 * بر چهار بخش‌پذیر؛ کد و شناسهٔ ملی نیستند.
 */
function formatEconomicCode(raw: string, format: FormatSpec): string {
  const digits = raw.replace(/\D/gu, '');
  if (digits === '') return format.emptyText;

  if (digits.length % 4 !== 0) {
    return format.persianDigits ? toPersianDigits(digits) : digits;
  }

  const groups: string[] = [];
  for (let index = 0; index < digits.length; index += 4) {
    groups.push(digits.slice(index, index + 4));
  }
  const joined = groups.join('-');
  return format.persianDigits ? toPersianDigits(joined) : joined;
}

export function groupDigits(value: string): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;

  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    const fromEnd = digits.length - index;
    out += digits[index];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += PERSIAN_THOUSAND_SEPARATOR;
  }
  return negative ? `-${out}` : out;
}

/** قالب‌های پرکاربرد، تا هر قالب از نو تعریفشان نکند. */
export const CURRENCY_FORMAT: FormatSpec = {
  kind: 'currency',
  persianDigits: true,
  thousandSeparator: true,
  decimals: 0,
  // صفر در گزارش مالیات **صریح** نوشته می‌شود، نه سلول خالی (docs/15 §۳).
  emptyText: '۰',
};

export const TEXT_FORMAT: FormatSpec = {
  kind: 'text',
  persianDigits: false,
  thousandSeparator: false,
  decimals: 0,
  emptyText: '',
};

export const JALALI_FORMAT: FormatSpec = {
  kind: 'jalaliDate',
  persianDigits: true,
  thousandSeparator: false,
  decimals: 0,
  emptyText: '',
};
