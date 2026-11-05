/**
 * پیش‌فرض‌های فرم فاکتور — تنظیم سازمانی، نه سلیقهٔ هر کاربر.
 *
 * مالیات در این سامانه سه بخش دارد: **حالت** (درصدی یا مبلغ ثابت)، **نرخ** و
 * **مبلغ**. تا پیش از این هر ردیف تازه با «درصدی، ۱۰٪» شروع می‌شد؛ سازمانی که
 * فاکتورهایش معاف است، همان عدد را در هر ردیف دستی صفر می‌کرد.
 *
 * چرا تنظیم سازمانی و نه ترجیح کاربر: نرخ مالیات به حساب فاکتور می‌رسد و باید
 * برای همهٔ کاربران یکی باشد؛ دو کارپرداز با دو پیش‌فرضِ متفاوت، دو فاکتور متفاوت
 * از یک خرید می‌ساختند.
 *
 * این مقدار فقط **نقطهٔ شروع** فرم است: کاربر در هر ردیف می‌تواند عوضش کند و
 * مرجعِ محاسبه همان چیزی است که ثبت می‌شود.
 */

import { z } from 'zod';

import { TAX_MODES } from './calculate.js';

export const invoiceDefaultsSchema = z.object({
  /** حالت پیش‌فرض مالیات در ردیف تازه. */
  taxMode: z.enum(TAX_MODES).default('PERCENT'),
  /**
   * نرخ پیش‌فرض به basis point؛ ۱۰ درصد ⇒ ۱۰۰۰، صفر درصد ⇒ ۰ (ADR-0003).
   *
   * `null` یعنی «نرخ سال مالی» — همان چیزی که تا امروز حاکم بود.
   */
  taxRateBp: z.coerce.number().int().min(0).max(10_000).nullable().default(null),
  /**
   * مبلغ ثابت پیش‌فرض، رشتهٔ رقمی ریالی.
   *
   * فقط در حالت «مبلغ» معنا دارد؛ رشته است چون مبلغ در کل سامانه رشتهٔ صحیح
   * است و نه number (ADR-0003).
   */
  taxAmount: z
    .string()
    .regex(/^\d*$/u, 'مبلغ مالیات فقط رقم است')
    .max(18)
    .default(''),
});

export type InvoiceDefaults = z.infer<typeof invoiceDefaultsSchema>;

export const DEFAULT_INVOICE_DEFAULTS: InvoiceDefaults = {
  taxMode: 'PERCENT',
  taxRateBp: null,
  taxAmount: '',
};

/** خواندن امن از JSON ذخیره‌شده؛ مقدار نامعتبر به پیش‌فرض برمی‌گردد. */
export function parseInvoiceDefaults(value: unknown): InvoiceDefaults {
  const parsed = invoiceDefaultsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_INVOICE_DEFAULTS;
}
