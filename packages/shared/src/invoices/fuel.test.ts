import { describe, expect, it } from 'vitest';

import { FinancialError, calculateFuelInvoice } from '../financial/calculate.js';
import { isLeapJalaliYear } from '../jalali/jalali.js';
import type { Money } from '../money/money.js';
import { MAX_FUEL_ENTRIES, resolveFuelEntries } from './fuel.js';

const rial = (value: number | bigint): Money => BigInt(value) as Money;

/** معیار پذیرش ۴ فاز ۴: روز ناموجود در ماه شمسی رد می‌شود. */
describe('ردیف‌های سوخت و اعتبارسنجی روز ماه شمسی', () => {
  it('روز ۳۱ در ماه ۳۰ روزه (مهر) رد می‌شود', () => {
    try {
      resolveFuelEntries(1405, 7, [{ day: 31, amount: rial(500_000) }]);
      expect.unreachable('باید خطا می‌داد');
    } catch (error) {
      expect(error).toBeInstanceOf(FinancialError);
      expect((error as FinancialError).code).toBe('FUEL_DAY_OUT_OF_MONTH');
      // پیام باید به همان ردیف بچسبد، نه به کل فاکتور.
      expect((error as FinancialError).path).toBe('entries.0.day');
    }
  });

  it('روز ۳۱ در ماه ۳۱ روزه (اردیبهشت) پذیرفته می‌شود', () => {
    const resolved = resolveFuelEntries(1405, 2, [{ day: 31, amount: rial(500_000) }]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.entryDate).toBe('2026-05-21');
  });

  it('روز ۳۰ اسفند در سال غیرکبیسه رد و در سال کبیسه پذیرفته می‌شود', () => {
    expect(isLeapJalaliYear(1405)).toBe(false);
    expect(isLeapJalaliYear(1403)).toBe(true);

    expect(() => resolveFuelEntries(1405, 12, [{ day: 30, amount: rial(1) }])).toThrowError(
      FinancialError,
    );

    const leap = resolveFuelEntries(1403, 12, [{ day: 30, amount: rial(1) }]);
    expect(leap[0]?.day).toBe(30);
    // ۳۰ اسفند ۱۴۰۳ = ۲۰ مارس ۲۰۲۵
    expect(leap[0]?.entryDate).toBe('2025-03-20');
  });

  it('ردیف‌ها بر اساس روز صعودی مرتب می‌شوند و ترتیب روزهای تکراری پایدار می‌ماند', () => {
    const resolved = resolveFuelEntries(1405, 7, [
      { day: 12, amount: rial(300_000) },
      { day: 3, amount: rial(100_000) },
      { day: 12, amount: rial(200_000) },
    ]);

    expect(resolved.map((entry) => entry.day)).toEqual([3, 12, 12]);
    // دو ردیف در روز ۱۲ به ترتیب ورودی می‌مانند؛ جابه‌جایی یعنی شماره ردیف ناپایدار.
    expect(resolved.map((entry) => entry.amount.toString())).toEqual([
      '100000',
      '300000',
      '200000',
    ]);
  });

  it('چند بار سوخت‌گیری در یک روز مجاز است', () => {
    const resolved = resolveFuelEntries(1405, 7, [
      { day: 5, amount: rial(100_000) },
      { day: 5, amount: rial(150_000) },
    ]);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.entryDate).toBe(resolved[1]?.entryDate);
  });

  it('مبلغ منفی، فهرست خالی و تعداد بیش از حد رد می‌شوند', () => {
    expect(() => resolveFuelEntries(1405, 7, [{ day: 1, amount: rial(-1) }])).toThrowError(
      /منفی/,
    );
    expect(() => resolveFuelEntries(1405, 7, [])).toThrowError(/حداقل یک ردیف/);

    const tooMany = Array.from({ length: MAX_FUEL_ENTRIES + 1 }, () => ({
      day: 1,
      amount: rial(1),
    }));
    expect(() => resolveFuelEntries(1405, 7, tooMany)).toThrowError(/بیشتر باشد/);
  });

  it('ماه و سال نامعتبر پیش از روزها گزارش می‌شوند', () => {
    try {
      resolveFuelEntries(1405, 13, [{ day: 1, amount: rial(1) }]);
      expect.unreachable('باید خطا می‌داد');
    } catch (error) {
      expect((error as FinancialError).path).toBe('jalaliMonth');
    }

    expect(() => resolveFuelEntries(1200, 7, [{ day: 1, amount: rial(1) }])).toThrowError(
      FinancialError,
    );
  });

  it('جمع فاکتور سوخت برابر مجموع ردیف‌هاست و مالیات صفر می‌ماند', () => {
    const resolved = resolveFuelEntries(1405, 7, [
      { day: 2, amount: rial(1_250_000) },
      { day: 9, amount: rial(980_000) },
    ]);

    const totals = calculateFuelInvoice(resolved.map((entry) => entry.amount));

    expect(totals.gross.toString()).toBe('2230000');
    expect(totals.tax).toBe(0n);
    expect(totals.total.toString()).toBe('2230000');
  });
});
