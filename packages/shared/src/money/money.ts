/**
 * واحد تمام مبالغ سامانه «ریال صحیح» است.
 *
 * قواعد غیرقابل مذاکره (docs/08-financial-rules.md و ADR-0003):
 *  - هیچ‌جا از `number` برای مبلغ استفاده نمی‌شود؛ بالای ۲^۵۳ دقت خاموشانه از بین می‌رود.
 *  - مبلغ در مرز JSON به‌صورت «رشته عددی» منتقل می‌شود.
 *  - تنها تابع گرد کردن پروژه `roundDiv` است.
 */

declare const MoneyBrand: unique symbol;
declare const QtyBrand: unique symbol;

/** مبلغ ریالی صحیح. */
export type Money = bigint & { readonly [MoneyBrand]: true };

/** مقدار/تعداد با مقیاس هزارم (۲٫۵ ⇒ 2500n). سه رقم اعشار. */
export type Qty = bigint & { readonly [QtyBrand]: true };

/** مقیاس مقدار: سه رقم اعشار. */
export const QTY_SCALE = 1000n;

/** مبنای درصد: basis point صحیح. ۱۰٪ ⇒ 1000. */
export const RATE_SCALE = 10_000n;

/** بیشینه نرخ مجاز: ۱۰۰٪. */
export const MAX_RATE_BP = 10_000;

export const ZERO_MONEY = 0n as Money;
export const ZERO_QTY = 0n as Qty;

const INTEGER_STRING = /^-?\d+$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** ساخت مبلغ از bigint. */
export function money(value: bigint): Money {
  return value as Money;
}

/**
 * خواندن مبلغ از رشته عددی (قرارداد API).
 * ارقام فارسی و عربی و جداکننده‌های نمایشی پذیرفته و نرمال می‌شوند.
 */
export function moneyFromString(value: string): Money {
  const normalized = normalizeDigits(value).replace(/[,٬،\s_]/g, '');
  if (!INTEGER_STRING.test(normalized)) {
    throw new MoneyError(`مبلغ نامعتبر است: ${value}`);
  }
  return BigInt(normalized) as Money;
}

/** سریالایز مبلغ برای JSON. همیشه رشته، هرگز number. */
export function moneyToString(value: Money): string {
  return value.toString();
}

/**
 * خواندن مقدار/تعداد از رشته اعشاری («۲٫۵» یا "2.5") به مقیاس هزارم.
 * بیش از سه رقم اعشار خطا می‌دهد تا گرد کردن خاموش رخ ندهد.
 */
export function qtyFromString(value: string): Qty {
  const normalized = normalizeDigits(value).replace(/[,٬،\s_]/g, '');
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(normalized);
  if (!match) {
    throw new MoneyError(`مقدار نامعتبر است: ${value}`);
  }
  const [, sign, whole, fraction = ''] = match;
  const padded = fraction.padEnd(3, '0');
  const result = BigInt(whole as string) * QTY_SCALE + BigInt(padded);
  return (sign === '-' ? -result : result) as Qty;
}

/** سریالایز مقدار به رشته اعشاری با سه رقم. */
export function qtyToString(value: Qty): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / QTY_SCALE;
  const fraction = (abs % QTY_SCALE).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function addMoney(a: Money, b: Money): Money {
  return (a + b) as Money;
}

export function subMoney(a: Money, b: Money): Money {
  return (a - b) as Money;
}

export function sumMoney(values: readonly Money[]): Money {
  let total = 0n;
  for (const value of values) total += value;
  return total as Money;
}

export function isNegative(value: Money): boolean {
  return value < 0n;
}

/** تبدیل ارقام فارسی و عربی به ASCII. */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x06f0 && code <= 0x06f9) {
      out += String.fromCharCode(code - 0x06f0 + 48); // ارقام فارسی
    } else if (code >= 0x0660 && code <= 0x0669) {
      out += String.fromCharCode(code - 0x0660 + 48); // ارقام عربی
    } else if (char === '٫') {
      out += '.'; // ممیز عربی
    } else {
      out += char;
    }
  }
  return out;
}
