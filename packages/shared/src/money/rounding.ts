/**
 * تنها تابع گرد کردن پروژه.
 *
 * سیاست گرد کردن داده «سند» است، نه تنظیم سراسری زنده (ADR-0012):
 * سند در لحظه ایجاد سیاست را snapshot می‌کند و با ثبت نهایی قفل می‌شود، تا تغییر
 * تنظیمات سازمان هرگز مبالغ اسناد گذشته را بازمحاسبه نکند (ریسک R14).
 */

export const ROUNDING_MODES = ['HALF_UP', 'FLOOR', 'HALF_EVEN'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const ROUNDING_SCOPES = ['LINE', 'INVOICE'] as const;
export type RoundingScope = (typeof ROUNDING_SCOPES)[number];

export interface RoundingPolicy {
  /** محل گرد کردن: سطح ردیف یا سطح فاکتور. */
  readonly scope: RoundingScope;
  /** جهت گرد کردن. */
  readonly mode: RoundingMode;
}

/** پیش‌فرض سازمان؛ صرفاً مقدار اولیه، نه قاعده ثابت. */
/** برچسب فارسی سیاست گرد کردن — یک‌جا، تا متن نمایشی در UI پراکنده نشود. */
export const ROUNDING_MODE_LABELS: Record<RoundingMode, string> = {
  HALF_UP: 'نیم به بالا',
  FLOOR: 'به پایین',
  HALF_EVEN: 'نیم به زوج',
};

export const ROUNDING_SCOPE_LABELS: Record<RoundingScope, string> = {
  LINE: 'سطح ردیف',
  INVOICE: 'سطح فاکتور',
};

export const DEFAULT_ROUNDING_POLICY: RoundingPolicy = {
  scope: 'LINE',
  mode: 'HALF_UP',
};

/**
 * تقسیم صحیح با گرد کردن مشخص.
 * مخرج باید مثبت باشد؛ صورت می‌تواند منفی باشد.
 */
export function roundDiv(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n) {
    throw new RangeError('مخرج باید بزرگ‌تر از صفر باشد');
  }

  switch (mode) {
    case 'HALF_UP':
      return roundHalfUp(numerator, denominator);
    case 'FLOOR':
      return roundFloor(numerator, denominator);
    case 'HALF_EVEN':
      return roundHalfEven(numerator, denominator);
  }
}

/** نیم به بالا، دور از صفر: ۰٫۵ ⇒ ۱ و ‎-۰٫۵ ⇒ ‎-۱ */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = (2n * abs + denominator) / (2n * denominator);
  return negative ? -quotient : quotient;
}

/** به سمت منفی بی‌نهایت. */
function roundFloor(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator; // bigint به سمت صفر برش می‌زند
  if (numerator % denominator !== 0n && numerator < 0n) {
    return quotient - 1n;
  }
  return quotient;
}

/** نیم به زوج (banker's rounding). */
function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const doubled = 2n * remainder;

  let result = quotient;
  if (doubled > denominator) {
    result = quotient + 1n;
  } else if (doubled === denominator && quotient % 2n === 1n) {
    result = quotient + 1n;
  }
  return negative ? -result : result;
}

/**
 * تخصیص یک مبلغ کل بین چند سهم، به‌گونه‌ای که جمع سهم‌ها **دقیقاً** با مبلغ کل برابر شود.
 *
 * در حالت `scope: 'INVOICE'` مالیات یک‌بار روی جمع خالص فاکتور حساب می‌شود و باید بین
 * ردیف‌ها پخش شود؛ بدون این تابع، جمع ستون مالیات با مالیات فاکتور نمی‌خواند.
 * باقیمانده به ردیف‌هایی داده می‌شود که بزرگ‌ترین وزن را دارند (ترتیب قطعی و پایدار).
 */
export function allocateProportionally(
  total: bigint,
  weights: readonly bigint[],
  mode: RoundingMode,
): bigint[] {
  const count = weights.length;
  if (count === 0) return [];

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0n);
  if (weightSum === 0n) {
    // بدون وزن معنادار: همه صفر، و کل مبلغ به ردیف اول.
    const result = new Array<bigint>(count).fill(0n);
    result[0] = total;
    return result;
  }

  const shares = weights.map((weight) => roundDiv(total * weight, weightSum, mode));
  const allocated = shares.reduce((sum, share) => sum + share, 0n);
  let remainder = total - allocated;

  if (remainder === 0n) return shares;

  // ترتیب قطعی: وزن بزرگ‌تر اول، و در تساوی، اندیس کوچک‌تر اول.
  const order = shares
    .map((_, index) => index)
    .sort((a, b) => {
      const wa = weights[a] as bigint;
      const wb = weights[b] as bigint;
      if (wa === wb) return a - b;
      return wb > wa ? 1 : -1;
    });

  const step = remainder > 0n ? 1n : -1n;
  let cursor = 0;
  while (remainder !== 0n) {
    const index = order[cursor % count] as number;
    shares[index] = (shares[index] as bigint) + step;
    remainder -= step;
    cursor += 1;
  }

  return shares;
}
