/**
 * نرمال‌سازی پلاک خودرو.
 *
 * دلیل وجودش: «۱۲ ب ۳۴۵ ایران ۶۷» و «12ب345-67» یک خودرو هستند. اگر یکتایی روی متن
 * واردشده باشد، همان خودرو چند بار در اطلاعات پایه ساخته می‌شود و گزارش سوخت یک
 * خودرو بین چند رکورد تکه‌تکه می‌شود. پس ستون `plate_normalized` مبنای یکتایی است و
 * `plate_number` فقط برای نمایش.
 *
 * این تابع **قالب** پلاک را تحمیل نمی‌کند (پلاک‌های تشریفاتی، دیپلماتیک و موتورسیکلت
 * قالب‌های متفاوتی دارند)؛ فقط تفاوت‌های نگارشی را حذف می‌کند.
 */

import { normalizeDigits } from '../money/money.js';

export class PlateError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PlateError';
  }
}

export const MAX_PLATE_LENGTH = 50;

/** حروف عربی که روی صفحه‌کلیدهای مختلف جای معادل فارسی تایپ می‌شوند. */
const ARABIC_EQUIVALENTS: Record<string, string> = {
  'ي': 'ی', // ي ⇒ ی
  'ك': 'ک', // ك ⇒ ک
  'ة': 'ه', // ة ⇒ ه
  'ؤ': 'و', // ؤ ⇒ و
};

/**
 * صورت یکتاساز پلاک: ارقام لاتین، بدون فاصله و جداکننده، حروف فارسی یکدست.
 * واژه «ایران» که در همه پلاک‌ها هست و تمایزی ایجاد نمی‌کند هم حذف می‌شود.
 */
export function normalizePlate(input: string): string {
  const digitsNormalized = normalizeDigits(input);

  let letters = '';
  for (const char of digitsNormalized) {
    letters += ARABIC_EQUIVALENTS[char] ?? char;
  }

  const compact = letters
    .replace(/ایران/g, '')
    // فاصله، نیم‌فاصله، خط تیره و اسلش هیچ معنایی در هویت پلاک ندارند.
    .replace(/[\s‌‏‎\-/.]/g, '');

  if (compact.length === 0) {
    throw new PlateError('پلاک خالی است', 'PLATE_EMPTY');
  }
  if (compact.length > MAX_PLATE_LENGTH) {
    throw new PlateError(
      `پلاک نمی‌تواند بیشتر از ${MAX_PLATE_LENGTH} نویسه باشد`,
      'PLATE_TOO_LONG',
    );
  }
  if (!/\d/.test(compact)) {
    throw new PlateError('پلاک باید حداقل یک رقم داشته باشد', 'PLATE_NO_DIGIT');
  }

  return compact;
}

/** آیا دو پلاک به یک خودرو اشاره می‌کنند؟ */
export function samePlate(a: string, b: string): boolean {
  try {
    return normalizePlate(a) === normalizePlate(b);
  } catch {
    return false;
  }
}
