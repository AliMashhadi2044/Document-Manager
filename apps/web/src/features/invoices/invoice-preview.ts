import {
  calculateFuelInvoice,
  calculateInvoice,
  calculateSingleAmountInvoice,
  qtyFromString,
  type LineInput,
  type Money,
  type RoundingPolicy,
} from '@dm/shared';

import type { InvoiceDetailsPayload } from './invoices.api';

/**
 * پیش‌نمایش مبالغ در فرم.
 *
 * نکته‌ای که این ماژول محافظت می‌کند: پیش‌نمایش **با همان توابع `@dm/shared`**
 * محاسبه می‌شود که سرور استفاده می‌کند، و با **همان سیاست گرد کردنی** که روی سند
 * قفل شده است — نه سیاست پیش‌فرض سازمان و نه فرمولی که در کامپوننت بازنویسی شود
 * (ریسک R1، ADR-0012). پس هر فرم، سیاست سند را از بالا می‌گیرد و به تابع می‌دهد.
 */

export type RoundingPolicyRef = RoundingPolicy;

/**
 * ورودی ناقص (فیلد خالی، مبلغ نامعتبر، تخفیف بیشتر از مبلغ) یعنی «هنوز پیش‌نمایشی
 * نیست»، نه خطا؛ کاربر در میانه تایپ نباید پیام خطا ببیند. خطای واقعی را سرور
 * هنگام ثبت برمی‌گرداند.
 */
export function safePreview<T>(compute: () => T): T | undefined {
  try {
    return compute();
  } catch {
    return undefined;
  }
}

/**
 * مبلغ کل فاکتور از همان ورودی‌ای که به سرور می‌رود.
 *
 * ورودی این تابع عمداً `InvoiceDetailsPayload` است و نه draftهای فرم: خروجی
 * `buildDetails` دقیقاً همان چیزی است که سرور می‌بیند، پس این عدد هم همان عددی
 * است که سرور حساب می‌کند. حساب کردن دوباره از روی drafts یعنی دو مسیرِ
 * جداگانه که فردا واگرا می‌شوند.
 *
 * `null` یعنی «هنوز قابل محاسبه نیست» (فرم ناقص)، نه خطا.
 */
export function detailsTotal(
  details: InvoiceDetailsPayload,
  policy: RoundingPolicyRef,
): bigint | null {
  return (
    safePreview(() => {
      if (details.kind === 'FUEL') {
        return calculateFuelInvoice(details.entries.map((entry) => BigInt(entry.amount) as Money))
          .total;
      }

      if (details.kind === 'UTILITY') {
        return calculateSingleAmountInvoice(
          {
            baseAmount: BigInt(details.baseAmount) as Money,
            discount: BigInt(details.discountAmount) as Money,
            taxMode: details.taxMode,
            taxRateBp: details.taxMode === 'PERCENT' ? details.taxRateBp : null,
            taxAmount:
              details.taxMode === 'AMOUNT' ? (BigInt(details.taxAmount ?? '0') as Money) : null,
          },
          policy,
        ).total;
      }

      const lines: LineInput[] = details.items.map((item) => ({
        quantity: qtyFromString(item.quantity),
        unitPrice: BigInt(item.unitPrice) as Money,
        discount: BigInt(item.discountAmount) as Money,
        taxMode: item.taxMode,
        taxRateBp: item.taxMode === 'PERCENT' ? item.taxRateBp : null,
        taxAmount: item.taxMode === 'AMOUNT' ? (BigInt(item.taxAmount ?? '0') as Money) : null,
      }));

      return calculateInvoice(lines, policy, {
        mode: details.taxMode,
        rateBp: details.taxMode === 'PERCENT' ? details.taxRateBp : null,
        amount: details.taxMode === 'AMOUNT' ? (BigInt(details.taxAmount ?? '0') as Money) : null,
      }).totals.total;
    }) ?? null
  );
}
