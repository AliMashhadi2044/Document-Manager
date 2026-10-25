import { describe, expect, it } from 'vitest';

import { checkSplitPayment, splitDifference, splitSum } from './split-payment';

/**
 * قاعدهٔ پرداخت ترکیبی.
 *
 * این آزمون‌ها همان چیزی را می‌سنجند که سه جا به آن تکیه می‌کنند: فرم فاکتور،
 * سرویس فاکتور و بررسی ثبت نهایی. هر ادعا یک حالت واقعی است، نه یک عدد دلخواه.
 */

describe('تقسیم پرداخت بین کارپرداز و ذی‌نفع', () => {
  it('تقسیم درست، مشکلی ندارد', () => {
    expect(checkSplitPayment(600_000n, 400_000n, 1_000_000n)).toBeNull();
  });

  it('سهم واردنشده یعنی تقسیم ناقص، نه صفر', () => {
    // تفاوت مهم است: اگر خالی را صفر می‌گرفتیم، «فقط یک طرف پر شده» بی‌صدا به
    // «یک طرف صفر دارد» تبدیل می‌شد و پیام خطا هم بی‌ربط می‌شد.
    expect(checkSplitPayment(null, 400_000n, 400_000n)).toEqual({ code: 'MISSING' });
    expect(checkSplitPayment(400_000n, null, 400_000n)).toEqual({ code: 'MISSING' });
  });

  it('سهم صفر یعنی این پرداخت ترکیبی نیست', () => {
    expect(checkSplitPayment(0n, 1_000_000n, 1_000_000n)).toEqual({
      code: 'NON_POSITIVE',
      side: 'beneficiary',
    });
    expect(checkSplitPayment(1_000_000n, 0n, 1_000_000n)).toEqual({
      code: 'NON_POSITIVE',
      side: 'pettyCash',
    });
  });

  it('سهم منفی هم پذیرفته نمی‌شود', () => {
    expect(checkSplitPayment(1_200_000n, -200_000n, 1_000_000n)).toEqual({
      code: 'NON_POSITIVE',
      side: 'pettyCash',
    });
  });

  it('کم بودن جمع: بخشی از پول تقسیم‌نشده می‌ماند', () => {
    expect(checkSplitPayment(600_000n, 300_000n, 1_000_000n)).toEqual({
      code: 'MISMATCH',
      sum: 900_000n,
      total: 1_000_000n,
      difference: 100_000n,
    });
  });

  it('زیاد بودن جمع: سند بیش از مبلغش پرداخت نشان می‌دهد', () => {
    expect(checkSplitPayment(600_000n, 600_000n, 1_000_000n)).toEqual({
      code: 'MISMATCH',
      sum: 1_200_000n,
      total: 1_000_000n,
      difference: -200_000n,
    });
  });

  it('مبالغ بزرگ‌تر از محدودهٔ عدد جاوااسکریپت هم درست حساب می‌شوند', () => {
    // همان دلیلی که مبالغ `bigint` هستند (ADR-0003): با `number`، این دو عدد
    // برابر به‌نظر می‌رسیدند و تقسیمِ غلط از بررسی رد می‌شد.
    const total = 9_007_199_254_740_993n;
    expect(checkSplitPayment(9_007_199_254_740_992n, 1n, total)).toBeNull();
    expect(checkSplitPayment(9_007_199_254_740_992n, 2n, total)).toMatchObject({
      code: 'MISMATCH',
      difference: -1n,
    });
  });

  it('اختلاف، وسط تایپ کردن هم قابل محاسبه است', () => {
    // فرم باید پیش از کامل شدن هر دو فیلد هم بتواند بگوید چقدر مانده.
    expect(splitDifference(null, null, 1_000_000n)).toBe(1_000_000n);
    expect(splitDifference(400_000n, null, 1_000_000n)).toBe(600_000n);
    expect(splitSum(400_000n, null)).toBe(400_000n);
  });
});
