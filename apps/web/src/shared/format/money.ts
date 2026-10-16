/**
 * نمایش مبالغ.
 *
 * قاعده سخت (ADR-0003، ریسک R2): مقدار از API یک **رشته عددی** است و برای نمایش
 * هرگز از مسیر `Number` عبور نمی‌کند. گروه‌بندی هزارگان روی خود رشته انجام می‌شود،
 * پس مبلغ بزرگ‌تر از ۲^۵۳ هم دقیقاً درست نمایش داده می‌شود.
 */

import { formatJalali, isoDateToJalali } from '@dm/shared';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** گروه‌بندی سه‌رقمی روی رشته، بدون تبدیل به عدد. */
export function groupDigits(value: string, separator = '٬'): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;

  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += separator;
    out += digits[index];
  }

  return negative ? `-${out}` : out;
}

export function toPersianDigits(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code >= 48 && code <= 57 ? PERSIAN_DIGITS[code - 48] : char;
  }
  return out;
}

/** مبلغ ریالی با ارقام فارسی و جداکننده هزارگان. */
export function formatMoney(value: string, options: { withUnit?: boolean } = {}): string {
  const formatted = toPersianDigits(groupDigits(value));
  return options.withUnit === false ? formatted : `${formatted} ریال`;
}

/** مقدار/تعداد: صفرهای اضافی اعشار حذف می‌شوند. */
export function formatQuantity(value: string): string {
  const trimmed = value.includes('.') ? value.replace(/\.?0+$/, '') : value;
  return toPersianDigits(groupDigits(trimmed));
}

/**
 * پیام سرور برای نمایش.
 *
 * پیام‌های دامنه فارسی‌اند ولی عددهایشان (تعداد، طول ماه، روز) لاتین تولید می‌شوند.
 * تبدیل ارقام **اینجا**، در لایه نمایش، انجام می‌شود نه در هر پیام سرور: یک نقطه
 * به‌جای ده‌ها رشته، و پیام سرور برای log و تست خوانا و پایدار می‌ماند.
 */
export function formatServerMessage(message: string): string {
  return toPersianDigits(message);
}

/** نرخ basis point به درصد خوانا: ۱۰۰۰ ⇒ «۱۰٪» */
export function formatRateBp(rateBp: number | null): string {
  if (rateBp === null) return '—';
  const percent = rateBp / 100;
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0$/, '');
  return `${toPersianDigits(text)}٪`;
}

/**
 * تاریخ میلادی ISO از API ⇒ نمایش شمسی.
 *
 * تبدیل از `@dm/shared` می‌آید، نه پیاده‌سازی جداگانه در رابط کاربری. دو پیاده‌سازی
 * یعنی دو نتیجه، و همان ریسک R12 است که این پکیج برای حذفش ساخته شد.
 */
export function formatIsoAsJalali(iso: string): string {
  try {
    return formatJalali(isoDateToJalali(iso.slice(0, 10)));
  } catch {
    return iso;
  }
}
