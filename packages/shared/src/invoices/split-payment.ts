/**
 * پرداخت ترکیبی: بخشی به کارپرداز، بخشی به ذی‌نفع.
 *
 * یک فاکتور همیشه یک مقصد پرداخت ندارد. بخشی از آن نقداً دست کارپرداز رفته و بخش
 * دیگر باید به حساب ذی‌نفع واریز شود. قاعدهٔ این تقسیم یک خط است و همان یک خط
 * اهمیت دارد:
 *
 *   **جمع دو سهم باید دقیقاً مبلغ کل فاکتور باشد.**
 *
 * نه کمتر — بخشی از پول ناپیدا می‌ماند — و نه بیشتر: سند بیش از مبلغش پرداخت نشان
 * می‌دهد. این فایل تنها جایی است که این قاعده نوشته شده، چون سه جا به آن نیاز
 * دارند: فرم فاکتور (نمایش زندهٔ اختلاف)، سرویس فاکتور (رد ثبت نادرست) و بررسی
 * ثبت نهایی سند. سه نسخهٔ جداگانه، دیر یا زود سه قاعدهٔ متفاوت می‌شدند.
 *
 * مبالغ `bigint` ریالی‌اند (ADR-0003)؛ هیچ‌جا از `number` عبور نمی‌کنند.
 */

export type SplitPaymentProblem =
  /** یکی از دو سهم وارد نشده است. */
  | { readonly code: 'MISSING' }
  /** سهم صفر یا منفی: این پرداخت ترکیبی نیست، تک‌مقصدی است. */
  | { readonly code: 'NON_POSITIVE'; readonly side: 'beneficiary' | 'pettyCash' }
  /** جمع سهم‌ها با مبلغ فاکتور نمی‌خواند. */
  | {
      readonly code: 'MISMATCH';
      readonly sum: bigint;
      readonly total: bigint;
      /** مبلغ تقسیم‌نشده؛ منفی یعنی جمع سهم‌ها از مبلغ فاکتور بیشتر است. */
      readonly difference: bigint;
    };

/** جمع سهم‌های واردشده؛ سهمِ خالی صفر حساب می‌شود. */
export function splitSum(beneficiary: bigint | null, pettyCash: bigint | null): bigint {
  return (beneficiary ?? 0n) + (pettyCash ?? 0n);
}

/**
 * مبلغ تقسیم‌نشده: مثبت یعنی هنوز چیزی از فاکتور تقسیم نشده، منفی یعنی بیش از
 * مبلغ فاکتور تقسیم شده است.
 *
 * برخلاف `checkSplitPayment`، این تابع با سهمِ خالی هم جواب می‌دهد — فرم باید
 * وسط تایپ کردن هم بتواند اختلاف را نشان دهد.
 */
export function splitDifference(
  beneficiary: bigint | null,
  pettyCash: bigint | null,
  totalAmount: bigint,
): bigint {
  return totalAmount - splitSum(beneficiary, pettyCash);
}

/** قاعدهٔ کامل، همان‌طور که سرور اعمالش می‌کند؛ `null` یعنی تقسیم درست است. */
export function checkSplitPayment(
  beneficiary: bigint | null,
  pettyCash: bigint | null,
  totalAmount: bigint,
): SplitPaymentProblem | null {
  if (beneficiary === null || pettyCash === null) return { code: 'MISSING' };

  if (beneficiary <= 0n) return { code: 'NON_POSITIVE', side: 'beneficiary' };
  if (pettyCash <= 0n) return { code: 'NON_POSITIVE', side: 'pettyCash' };

  const difference = splitDifference(beneficiary, pettyCash, totalAmount);
  if (difference !== 0n) {
    return {
      code: 'MISMATCH',
      sum: splitSum(beneficiary, pettyCash),
      total: totalAmount,
      difference,
    };
  }

  return null;
}
