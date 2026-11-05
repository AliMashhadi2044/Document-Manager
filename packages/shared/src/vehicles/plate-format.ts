/**
 * ساختار پلاک ایران.
 *
 * `plate.ts` فقط تفاوت‌های نگارشی را حذف می‌کند و عمداً هیچ قالبی را تحمیل نمی‌کند.
 * اینجا یک لایه بالاتر است: پلاک **استاندارد** شخصی/عمومی ایران چهار بخش دارد و رابط
 * کاربری باید همان چهار بخش را — به شکل خودِ پلاک — بگیرد، نه یک جعبهٔ متن آزاد.
 *
 * ترتیب بخش‌ها همان ترتیب روی پلاک است (از چپ به راست):
 *
 *     ┌──────┬────┬───┬─────┬────┐
 *     │ ایران│ ۱۲ │ ب │ ۳۴۵ │ ۱۱ │
 *     └──────┴────┴───┴─────┴────┘
 *        نوار    چپ  حرف  راست  کد شهرستان
 *
 * پلاک‌های غیرمعمول (موتورسیکلت، تشریفات، کشاورزی) این قالب را ندارند؛ به همین دلیل
 * `parsePlate` در برابر ورودی ناسازگار `null` برمی‌گرداند و فرم به حالت متن آزاد
 * برمی‌گردد — قالب، دری است که بسته نمی‌شود.
 */

import { normalizeDigits } from '../money/money.js';
import { normalizePlate } from './plate.js';

export interface PlateParts {
  /** دو رقم سمت چپ. */
  readonly left: string;
  /** حرف میانی — سری پلاک. */
  readonly letter: string;
  /** سه رقم سمت راست. */
  readonly right: string;
  /** کد دو رقمی شهرستان، سمت راست واژهٔ «ایران». */
  readonly iran: string;
}

export interface PlateLetter {
  readonly char: string;
  /** کاربرد سری — فقط آن‌هایی که معنای جاافتاده دارند نام‌گذاری شده‌اند. */
  readonly usage: string;
}

/**
 * حروف سری پلاک.
 *
 * فهرست سری‌های رایج است، نه همهٔ سری‌های ممکن؛ هر سری تازه‌ای که اینجا نباشد از راه
 * «پلاک غیرمعمول» وارد می‌شود. برچسب کاربرد برای کاربر است تا سری درست را از میان
 * بیست‌وچند حرف پیدا کند.
 */
export const PLATE_LETTERS: readonly PlateLetter[] = [
  { char: 'ب', usage: 'شخصی' },
  { char: 'ج', usage: 'شخصی' },
  { char: 'د', usage: 'شخصی' },
  { char: 'س', usage: 'شخصی' },
  { char: 'ص', usage: 'شخصی' },
  { char: 'ط', usage: 'شخصی' },
  { char: 'ق', usage: 'شخصی' },
  { char: 'ل', usage: 'شخصی' },
  { char: 'م', usage: 'شخصی' },
  { char: 'ن', usage: 'شخصی' },
  { char: 'و', usage: 'شخصی' },
  { char: 'ه', usage: 'شخصی' },
  { char: 'ی', usage: 'شخصی' },
  { char: 'ت', usage: 'تاکسی' },
  { char: 'ع', usage: 'حمل‌ونقل عمومی' },
  { char: 'الف', usage: 'دولتی' },
  { char: 'پ', usage: 'پلیس' },
  { char: 'ث', usage: 'سپاه' },
  { char: 'ش', usage: 'ارتش' },
  { char: 'ز', usage: 'وزارت دفاع' },
  { char: 'ژ', usage: 'معلولان و جانبازان' },
  { char: 'گ', usage: 'گذر موقت' },
  { char: 'D', usage: 'دیپلمات' },
  { char: 'S', usage: 'سیاسی' },
];

/**
 * پیدا کردن سری پلاک از روی یک نویسهٔ تایپ‌شده.
 *
 * «الف» سه نویسه است و هیچ‌وقت با یک فشردن کلید برابر نمی‌شود؛ کاربری که «ا»
 * می‌زد، هیچ سری‌ای انتخاب نمی‌شد و فکر می‌کرد صفحه‌کلید کار نمی‌کند.
 *
 * شکل‌های عربیِ همان حرف هم پذیرفته می‌شوند: روی صفحه‌کلیدهای مختلف «ي» و «ك» جای
 * «ی» و «ک» تایپ می‌شوند.
 */
export function plateLetterFor(typed: string): string | null {
  if (typed.length !== 1) return null;

  const key = typed
    .replace(/[يى]/u, 'ی')
    .replace(/ك/u, 'ک')
    .replace(/[أإآ]/u, 'ا');

  const exact = PLATE_LETTERS.find((item) => item.char === key);
  if (exact) return exact.char;

  // «ا» ⇒ «الف»: تنها سری‌ای که نامش بیش از یک نویسه است.
  const byFirst = PLATE_LETTERS.filter((item) => item.char.startsWith(key));
  return byFirst.length === 1 ? (byFirst[0] as PlateLetter).char : null;
}

const PLATE_SHAPE = /^(\d{2})([^\d]{1,8}?)(\d{3})(\d{2})$/u;

/** بخش‌های خالی — نقطهٔ شروع فرم. */
export const EMPTY_PLATE: PlateParts = { left: '', letter: '', right: '', iran: '' };

/**
 * متن نمایشی پلاک از بخش‌هایش.
 *
 * ارقام **لاتین** ذخیره می‌شوند و نمایش فارسی کار رابط است؛ همان قاعده‌ای که برای
 * مبالغ هم برقرار است. واژهٔ «ایران» نوشته می‌شود چون متن ذخیره‌شده جای دیگری هم
 * (برگهٔ سند، گزارش) بدون این ساختار خوانده می‌شود.
 */
export function formatPlate(parts: PlateParts): string {
  return `${parts.left} ${parts.letter} ${parts.right} ایران ${parts.iran}`;
}

/** آیا هر چهار بخش کامل‌اند؟ */
export function isPlateComplete(parts: PlateParts): boolean {
  return (
    /^\d{2}$/.test(parts.left) &&
    parts.letter.length > 0 &&
    /^\d{3}$/.test(parts.right) &&
    /^\d{2}$/.test(parts.iran)
  );
}

/**
 * بخش‌های پلاک از یک متن ذخیره‌شده — یا `null` اگر قالب استاندارد نباشد.
 *
 * ورودی از همان راهی می‌گذرد که یکتایی از آن می‌گذرد (`normalizePlate`)، پس
 * «۱۲ ب ۳۴۵ ایران ۶۷» و «12ب345-67» هر دو یک نتیجه می‌دهند.
 */
export function parsePlate(text: string): PlateParts | null {
  let compact: string;
  try {
    compact = normalizePlate(text);
  } catch {
    return null;
  }

  const match = PLATE_SHAPE.exec(compact);
  if (!match) return null;

  return { left: match[1]!, letter: match[2]!, right: match[3]!, iran: match[4]! };
}

/** فقط ارقام لاتین، کوتاه‌شده تا `length` رقم — ورودی پلاک رقم غیر از این نمی‌پذیرد. */
export function plateDigits(input: string, length: number): string {
  return normalizeDigits(input).replace(/\D/g, '').slice(0, length);
}
