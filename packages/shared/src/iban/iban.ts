/**
 * اعتبارسنجی شماره شبا (IBAN ایران).
 *
 * توجه مهم: تشخیص بانک از روی پیشوند، **تأیید مالکیت یا فعال بودن حساب نیست** و
 * نباید در UI این‌گونه معرفی شود.
 */

import { normalizeDigits } from '../money/money';

/** طول شبای ایران: IR + ۲۴ رقم. */
export const IRAN_IBAN_LENGTH = 26;

export interface IbanValidationResult {
  readonly valid: boolean;
  /** صورت نرمال‌شده: `IR` + ۲۴ رقم ASCII. فقط وقتی معتبر باشد. */
  readonly normalized: string | null;
  /** کد سه‌رقمی بانک، استخراج‌شده از شبا. */
  readonly bankCode: string | null;
  readonly errorCode: IbanErrorCode | null;
  readonly errorMessage: string | null;
}

export type IbanErrorCode =
  | 'IBAN_EMPTY'
  | 'IBAN_BAD_COUNTRY'
  | 'IBAN_BAD_LENGTH'
  | 'IBAN_BAD_CHARACTERS'
  | 'IBAN_BAD_CHECKSUM';

/**
 * نرمال‌سازی ورودی کاربر: حذف فاصله، نیم‌فاصله و جداکننده‌ها، تبدیل ارقام فارسی و
 * عربی به ASCII، و بزرگ کردن حروف.
 *
 * پیشوند `IR` فقط وقتی افزوده می‌شود که ورودی **تماماً رقم** باشد — یعنی کاربر صرفاً
 * ۲۴ رقم را تایپ کرده است. اگر ورودی با کد کشور دیگری شروع شود (مثلاً `DE`)، دست‌نخورده
 * می‌ماند تا خطای درست «کشور نادرست» گزارش شود، نه خطای گمراه‌کننده «طول نادرست».
 */
export function normalizeIban(input: string): string {
  const cleaned = normalizeDigits(input)
    .replace(/[\s‌‏‎_-]/g, '')
    .toUpperCase();

  if (cleaned.length === 0) return cleaned;
  if (/^\d+$/.test(cleaned)) return `IR${cleaned}`;
  return cleaned;
}

export function validateIban(input: string): IbanValidationResult {
  if (input.trim().length === 0) {
    return fail('IBAN_EMPTY', 'شماره شبا وارد نشده است');
  }

  const normalized = normalizeIban(input);

  if (!normalized.startsWith('IR')) {
    return fail('IBAN_BAD_COUNTRY', 'شماره شبا باید با IR شروع شود');
  }
  if (normalized.length !== IRAN_IBAN_LENGTH) {
    return fail(
      'IBAN_BAD_LENGTH',
      `شماره شبا باید ${IRAN_IBAN_LENGTH} نویسه باشد (IR و ۲۴ رقم)`,
    );
  }
  if (!/^IR\d{24}$/.test(normalized)) {
    return fail('IBAN_BAD_CHARACTERS', 'شماره شبا فقط می‌تواند شامل رقم باشد');
  }
  if (mod97(normalized) !== 1n) {
    return fail('IBAN_BAD_CHECKSUM', 'شماره شبا معتبر نیست (رقم کنترلی نادرست است)');
  }

  return {
    valid: true,
    normalized,
    bankCode: normalized.slice(4, 7),
    errorCode: null,
    errorMessage: null,
  };
}

export function isValidIban(input: string): boolean {
  return validateIban(input).valid;
}

/**
 * الگوریتم MOD-97-10 طبق ISO 13616.
 * چهار نویسه اول به انتها منتقل، حروف به عدد تبدیل، و باقیمانده بر ۹۷ باید ۱ باشد.
 */
function mod97(iban: string): bigint {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0n;

  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const value =
      code >= 48 && code <= 57
        ? BigInt(code - 48) // رقم
        : BigInt(code - 55); // حرف: A=10 … Z=35
    remainder = (remainder * (value >= 10n ? 100n : 10n) + value) % 97n;
  }

  return remainder;
}

/** قالب نمایشی گروه‌های چهارتایی: `IR06 0540 1028 0002 1273 1300 01`. */
export function formatIban(normalized: string): string {
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}

function fail(code: IbanErrorCode, message: string): IbanValidationResult {
  return {
    valid: false,
    normalized: null,
    bankCode: null,
    errorCode: code,
    errorMessage: message,
  };
}
