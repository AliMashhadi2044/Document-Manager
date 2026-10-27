import { describe, expect, it } from 'vitest';

import {
  OUTSTANDING_FOLLOW_UP_DAYS,
  checkSettlement,
  outstandingAge,
  settlementDifference,
} from './payment-settlement';

/**
 * وضعیت پرداخت سند.
 *
 * دو قاعده سنجیده می‌شوند و هر دو جای واقعی دارند: مبالغ (سرویس بایگانی و قید
 * دیتابیس) و ساعت پیگیری (رنگ نشان در کارتابل، داشبورد و اعلان‌ها).
 */

const TOTAL = 10_000_000n;

describe('مبالغ وضعیت پرداخت', () => {
  it('پرداخت کامل: کل مبلغ سند و شناسایی صفر', () => {
    expect(checkSettlement('FULLY_PAID', TOTAL, 0n, TOTAL)).toBeNull();
  });

  it('پرداخت کاملِ ناسازگار رد می‌شود', () => {
    // این حالت از رابط ساخته نمی‌شود (مبالغ مشتق‌اند)، ولی قاعده نگهبانش است:
    // یک درخواست مستقیم به API نباید بتواند «پرداخت کامل»ِ نصفه ثبت کند.
    expect(checkSettlement('FULLY_PAID', TOTAL / 2n, 0n, TOTAL)).toMatchObject({
      code: 'MISMATCH',
    });
  });

  it('شناسایی درست، مشکلی ندارد', () => {
    expect(checkSettlement('OUTSTANDING', 6_000_000n, 4_000_000n, TOTAL)).toBeNull();
  });

  it('شناسایی با پرداختِ صفر هم معتبر است', () => {
    // «هنوز چیزی پرداخت نشده» یک حالت واقعی است و نباید با «وارد نشده» قاطی شود.
    expect(checkSettlement('OUTSTANDING', 0n, TOTAL, TOTAL)).toBeNull();
  });

  it('مبلغ واردنشده یعنی ناقص، نه صفر', () => {
    expect(checkSettlement('OUTSTANDING', null, TOTAL, TOTAL)).toEqual({ code: 'MISSING' });
    expect(checkSettlement('OUTSTANDING', TOTAL, null, TOTAL)).toEqual({ code: 'MISSING' });
  });

  it('شناساییِ صفر یعنی پرداخت کامل، نه شناسایی', () => {
    expect(checkSettlement('OUTSTANDING', TOTAL, 0n, TOTAL)).toEqual({ code: 'NOT_OUTSTANDING' });
  });

  it('مبلغ منفی پذیرفته نمی‌شود', () => {
    expect(checkSettlement('OUTSTANDING', -1n, TOTAL + 1n, TOTAL)).toEqual({ code: 'NEGATIVE' });
  });

  it('جمعِ کمتر: بخشی از پول نه پرداخت شده و نه پیگیری می‌شود', () => {
    expect(checkSettlement('OUTSTANDING', 6_000_000n, 3_000_000n, TOTAL)).toEqual({
      code: 'MISMATCH',
      sum: 9_000_000n,
      total: TOTAL,
      difference: 1_000_000n,
    });
  });

  it('جمعِ بیشتر: سند بیش از مبلغش تعهد نشان می‌دهد', () => {
    expect(checkSettlement('OUTSTANDING', 6_000_000n, 5_000_000n, TOTAL)).toMatchObject({
      code: 'MISMATCH',
      difference: -1_000_000n,
    });
  });

  it('اختلاف، پیش از کامل شدن فرم هم قابل محاسبه است', () => {
    expect(settlementDifference(null, null, TOTAL)).toBe(TOTAL);
    expect(settlementDifference(4_000_000n, null, TOTAL)).toBe(6_000_000n);
  });
});

describe('ساعت پیگیری شناسایی', () => {
  const at = (days: number): Date => new Date(Date.UTC(2026, 0, 1 + days, 12));
  const start = at(0);

  it('شناسایی تازه، آبی است', () => {
    expect(outstandingAge(start, at(0))).toMatchObject({ days: 0, level: 'fresh' });
    expect(outstandingAge(start, at(4)).level).toBe('fresh');
  });

  it('نزدیک مهلت، زرد می‌شود', () => {
    expect(outstandingAge(start, at(5)).level).toBe('due-soon');
    expect(outstandingAge(start, at(7)).level).toBe('due-soon');
  });

  it('دو روز مانده، فوری', () => {
    expect(outstandingAge(start, at(8)).level).toBe('urgent');
    expect(outstandingAge(start, at(9))).toMatchObject({ daysLeft: 1, level: 'urgent' });
  });

  it('در روز دهم، معوق', () => {
    // مرز، همان مهلتِ اعلام‌شده است و نه یک روز این‌طرف‌تر یا آن‌طرف‌تر.
    const deadline = outstandingAge(start, at(OUTSTANDING_FOLLOW_UP_DAYS));
    expect(deadline).toMatchObject({ days: OUTSTANDING_FOLLOW_UP_DAYS, daysLeft: 0 });
    expect(deadline.level).toBe('overdue');
  });

  it('مدت‌ها پس از مهلت هم معوق می‌ماند و منفی نمی‌شمارد', () => {
    const late = outstandingAge(start, at(40));
    expect(late.level).toBe('overdue');
    expect(late.days).toBe(40);
  });

  it('تاریخ آینده صفر روز است، نه عدد منفی', () => {
    // ساعت ماشین کاربر می‌تواند عقب باشد؛ «−۳ روز گذشته» در رابط بی‌معناست.
    expect(outstandingAge(at(3), at(0)).days).toBe(0);
  });
});
