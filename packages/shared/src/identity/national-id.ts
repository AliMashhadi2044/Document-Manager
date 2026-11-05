/**
 * کد ملی و شناسهٔ ملی.
 *
 * چرا اعتبارسنجی لازم است: این عدد در گزارش مالیات به سازمان امور مالیاتی
 * می‌رود. یک رقمِ جابه‌جا تایپ‌شده، همان‌جا رد نمی‌شود — ماه‌ها بعد به‌شکل یک
 * اظهارنامهٔ برگشتی برمی‌گردد، وقتی کسی دیگر یادش نیست کدام فاکتور بود.
 *
 * دو عدد متفاوت، هر کدام با قاعدهٔ خودش:
 *  - **کد ملی** شخص حقیقی: ده رقم، با رقم کنترلِ وزن‌دار (۱۰ تا ۲).
 *  - **شناسهٔ ملی** شخص حقوقی: یازده رقم، با وزن‌های ثابت و «عددِ پایه».
 *
 * شمارهٔ اقتصادی قاعدهٔ کنترلی عمومی و منتشرشده‌ای ندارد؛ پس فقط شکلش سنجیده
 * می‌شود، نه درستی‌اش. چیزی را «معتبر» اعلام نمی‌کنیم که نمی‌توانیم بسنجیم.
 */

const DIGITS = /^\d+$/u;

/** کد ملی ده‌رقمی شخص حقیقی. */
export function isValidNationalId(raw: string): boolean {
  const digits = raw.replace(/[\s-]/gu, '');
  if (digits.length !== 10 || !DIGITS.test(digits)) return false;

  // کدهایی مثل «۱۱۱۱۱۱۱۱۱۱» در قاعده می‌گنجند ولی معتبر نیستند.
  if (/^(\d)\1{9}$/u.test(digits)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index);
  }

  const remainder = sum % 11;
  const control = Number(digits[9]);

  return remainder < 2 ? control === remainder : control === 11 - remainder;
}

/** وزن‌های ثابت شناسهٔ ملی حقوقی. */
const LEGAL_WEIGHTS = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];

/** شناسهٔ ملی یازده‌رقمی شخص حقوقی. */
export function isValidLegalId(raw: string): boolean {
  const digits = raw.replace(/[\s-]/gu, '');
  if (digits.length !== 11 || !DIGITS.test(digits)) return false;
  if (/^(\d)\1{10}$/u.test(digits)) return false;

  // رقم دهم (از چپ) به‌علاوهٔ ۲، به هر رقم افزوده می‌شود.
  const base = Number(digits[9]) + 2;

  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += (Number(digits[index]) + base) * (LEGAL_WEIGHTS[index] as number);
  }

  const remainder = sum % 11;
  const control = Number(digits[10]);

  return control === (remainder === 10 ? 0 : remainder);
}

/**
 * سنجش شناسه‌ای که کاربر به‌جای شمارهٔ اقتصادی وارد می‌کند.
 *
 * `null` یعنی معتبر؛ رشته یعنی همان پیامی که باید به کاربر نشان داده شود.
 */
export function nationalIdIssue(raw: string): string | null {
  const digits = raw.replace(/[\s-]/gu, '');
  if (digits === '') return null;
  if (!DIGITS.test(digits)) return 'کد ملی فقط رقم است';

  if (digits.length === 10) {
    return isValidNationalId(digits) ? null : 'کد ملی معتبر نیست';
  }
  if (digits.length === 11) {
    return isValidLegalId(digits) ? null : 'شناسهٔ ملی معتبر نیست';
  }

  return 'کد ملی ده رقم و شناسهٔ ملی یازده رقم است';
}
