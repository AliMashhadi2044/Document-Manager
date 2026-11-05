import { describe, expect, it } from 'vitest';

import { createInvoiceSchema } from './invoice.schema';

/**
 * روش پرداخت، الزامی.
 *
 * پیش از این اختیاری بود و فرم حتی گزینهٔ صریحِ «ثبت نشود» داشت. نتیجه،
 * فاکتورهایی بود که نمی‌شد گفت پولشان به کجا رفت: خانهٔ «پرداخت به» در فرم
 * ریزهزینه خالی می‌ماند و فاکتور از گزارش شبای ذی‌نفعان بیرون می‌افتاد. ثبت
 * نهایی سند جلویشان را می‌گرفت، ولی آن‌قدر دیر که کاربر باید به هر فاکتور
 * برمی‌گشت.
 *
 * ادعای این آزمون روی **مرز سرور** است و نه روی فرم: پنهان کردن یا الزامی
 * کردن یک کنترل در مرورگر، اعتبارسنجی نیست.
 */
const UUID = '4e269289-1b8c-4245-be3f-a15b5c17c147';

function body(payment: unknown): Record<string, unknown> {
  const base: Record<string, unknown> = {
    chapterId: UUID,
    invoiceTypeId: UUID,
    vendorId: UUID,
    invoiceDate: '2026-10-04',
    description: 'خرید ملزومات',
    details: {
      kind: 'NORMAL',
      taxMode: 'PERCENT',
      taxRateBp: 1000,
      items: [
        {
          rowNo: 1,
          description: 'کاغذ A4',
          quantity: '1000',
          unitPrice: '1200000',
          taxMode: 'PERCENT',
          taxRateBp: 1000,
        },
      ],
    },
  };
  if (payment !== undefined) base.payment = payment;
  return base;
}

function issues(input: Record<string, unknown>): string[] {
  const result = createInvoiceSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('روش پرداخت فاکتور', () => {
  it('فاکتور با روش پرداخت پذیرفته می‌شود', () => {
    expect(issues(body({ paymentMethodId: UUID }))).toEqual([]);
  });

  it('بدون روش پرداخت رد می‌شود', () => {
    expect(issues(body(undefined))).toEqual(['payment: روش پرداخت فاکتور الزامی است']);
  });

  /*
    `null` هم همان است.

    این همان چیزی است که فرم با گزینهٔ «ثبت نشود» می‌فرستاد؛ پس ادعا باید
    صریحاً دربارهٔ `null` باشد و نه فقط دربارهٔ «نیامده».
  */
  it('«ثبت نشود» — یعنی null — هم رد می‌شود', () => {
    expect(issues(body(null))).toEqual(['payment: روش پرداخت فاکتور الزامی است']);
  });

  // پیام فارسی، نه «expected string, received undefined».
  it('شیء خالی، پیام فارسی می‌دهد', () => {
    expect(issues(body({}))).toEqual(['payment.paymentMethodId: روش پرداخت را انتخاب کنید']);
  });

  it('شناسهٔ بی‌شکل رد می‌شود', () => {
    expect(issues(body({ paymentMethodId: 'not-a-uuid' })).length).toBe(1);
  });
});
