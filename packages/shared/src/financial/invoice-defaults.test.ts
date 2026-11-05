import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INVOICE_DEFAULTS,
  invoiceDefaultsSchema,
  parseInvoiceDefaults,
} from './invoice-defaults.js';

/**
 * پیش‌فرض‌های فاکتور.
 *
 * ادعای اول از یک باگ واقعی آمد: صفحهٔ «فصل‌ها» این کلید را از پاسخ سرور
 * مستقیم در حالت می‌نشاند، و سرویسی که هنوز ارتقا نیافته بود آن را اصلاً
 * نمی‌فرستاد — یک `undefined` که کل صفحه را از کار انداخت. خواندن باید **هر**
 * ورودی را به مقدار معتبر برگرداند.
 */
describe('خواندن پیش‌فرض‌های فاکتور', () => {
  it('نبودنِ مقدار، پیش‌فرض می‌دهد — نه undefined', () => {
    expect(parseInvoiceDefaults(undefined)).toEqual(DEFAULT_INVOICE_DEFAULTS);
    expect(parseInvoiceDefaults(null)).toEqual(DEFAULT_INVOICE_DEFAULTS);
    expect(parseInvoiceDefaults({})).toEqual(DEFAULT_INVOICE_DEFAULTS);
  });

  it('مقدار بی‌ربط هم پیش‌فرض می‌دهد', () => {
    expect(parseInvoiceDefaults('یک رشته')).toEqual(DEFAULT_INVOICE_DEFAULTS);
    expect(parseInvoiceDefaults({ taxMode: 'NEON' })).toEqual(DEFAULT_INVOICE_DEFAULTS);
  });

  it('مقدار معتبر دست‌نخورده می‌ماند', () => {
    const value = { taxMode: 'AMOUNT' as const, taxRateBp: 0, taxAmount: '150000' };
    expect(parseInvoiceDefaults(value)).toEqual(value);
  });

  it('صفر درصد، یک انتخاب معتبر است', () => {
    // سازمان معاف: ردیف‌ها باید بدون مالیات شروع شوند، نه با نرخ سال مالی.
    expect(parseInvoiceDefaults({ taxRateBp: 0 }).taxRateBp).toBe(0);
  });

  it('نرخ بیرون از دامنه و مبلغ غیررقمی رد می‌شوند', () => {
    expect(invoiceDefaultsSchema.safeParse({ taxRateBp: 10_001 }).success).toBe(false);
    expect(invoiceDefaultsSchema.safeParse({ taxAmount: '12a' }).success).toBe(false);
  });
});
