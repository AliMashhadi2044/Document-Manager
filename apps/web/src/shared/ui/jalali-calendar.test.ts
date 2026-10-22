import { describe, expect, it } from 'vitest';
import { jalaliToIsoDate } from '@dm/shared';

import {
  addDays,
  buildMonthGrid,
  isWithin,
  joinDateTime,
  parseTime,
  quickRanges,
  shiftMonth,
  splitDateTime,
  weekdayIndex,
} from './jalali-calendar';

describe('ستون هفته', () => {
  it('شنبه ستون صفر است و جمعه ستون شش', () => {
    // ۱۴۰۵/۰۷/۲۴ برابر ۲۰۲۶-۱۰-۱۶ است و جمعه.
    const friday = jalaliToIsoDate({ year: 1405, month: 7, day: 24 });
    expect(weekdayIndex(friday)).toBe(6);
    expect(weekdayIndex(addDays(friday, 1))).toBe(0);
    expect(weekdayIndex(addDays(friday, 2))).toBe(1);
  });
});

describe('شبکهٔ ماه', () => {
  it('همیشه هفته‌های کامل می‌سازد و با شنبه شروع می‌شود', () => {
    for (const month of [1, 7, 12]) {
      const grid = buildMonthGrid(1405, month);
      expect(grid.length % 7).toBe(0);
      expect(weekdayIndex(grid[0]?.iso ?? '')).toBe(0);
    }
  });

  it('همهٔ روزهای ماه را دارد و نه یکی بیشتر', () => {
    const grid = buildMonthGrid(1405, 7); // مهر، ۳۰ روز
    const inside = grid.filter((cell) => !cell.outside);
    expect(inside).toHaveLength(30);
    expect(inside[0]?.jalali.day).toBe(1);
    expect(inside[29]?.jalali.day).toBe(30);
  });

  it('اسفند کبیسه ۳۰ روز دارد و اسفند عادی ۲۹ روز', () => {
    // ۱۴۰۳ کبیسه است، ۱۴۰۴ نیست.
    expect(buildMonthGrid(1403, 12).filter((cell) => !cell.outside)).toHaveLength(30);
    expect(buildMonthGrid(1404, 12).filter((cell) => !cell.outside)).toHaveLength(29);
  });

  it('خانه‌های بیرونی، روزهای پیوستهٔ ماه‌های همسایه‌اند', () => {
    const grid = buildMonthGrid(1405, 7);
    for (let index = 1; index < grid.length; index += 1) {
      expect(grid[index]?.iso).toBe(addDays(grid[index - 1]?.iso ?? '', 1));
    }
  });
});

describe('جابه‌جایی ماه', () => {
  it('از فروردین به عقب، به اسفند سال قبل می‌رود', () => {
    expect(shiftMonth(1405, 1, -1)).toEqual({ year: 1404, month: 12 });
  });

  it('از اسفند به جلو، به فروردین سال بعد می‌رود', () => {
    expect(shiftMonth(1405, 12, 1)).toEqual({ year: 1406, month: 1 });
  });

  it('از مرزهای مجاز تقویم بیرون نمی‌رود', () => {
    expect(shiftMonth(1300, 1, -1)).toEqual({ year: 1300, month: 1 });
    expect(shiftMonth(1500, 12, 1)).toEqual({ year: 1500, month: 12 });
  });
});

describe('بازه', () => {
  it('مرزها هم داخل بازه‌اند', () => {
    expect(isWithin('2026-10-10', '2026-10-10', '2026-10-20')).toBe(true);
    expect(isWithin('2026-10-20', '2026-10-10', '2026-10-20')).toBe(true);
    expect(isWithin('2026-10-21', '2026-10-10', '2026-10-20')).toBe(false);
  });

  it('بازهٔ ناقص، هیچ روزی را دربر نمی‌گیرد', () => {
    expect(isWithin('2026-10-10', '2026-10-10', null)).toBe(false);
    expect(isWithin('2026-10-10', null, '2026-10-20')).toBe(false);
  });

  /** ادعای واقعی: «۷ روز اخیر» باید دقیقاً ۷ روز باشد، نه ۶ و نه ۸. */
  it('بازه‌های آماده طول درست دارند', () => {
    const ranges = quickRanges('2026-10-21');
    const last7 = ranges.find((range) => range.key === 'last7');
    expect(last7?.from).toBe('2026-10-15');
    expect(last7?.to).toBe('2026-10-21');

    const last30 = ranges.find((range) => range.key === 'last30');
    expect(last30?.from).toBe('2026-09-22');
  });

  it('«ماه گذشته» کل ماه شمسی قبل است', () => {
    // ۲۰۲۶-۱۰-۲۱ یعنی ۱۴۰۵/۰۷/۲۹؛ ماه قبل شهریور ۱۴۰۵ با ۳۱ روز.
    const previous = quickRanges('2026-10-21').find((range) => range.key === 'lastMonth');
    expect(previous?.from).toBe(jalaliToIsoDate({ year: 1405, month: 6, day: 1 }));
    expect(previous?.to).toBe(jalaliToIsoDate({ year: 1405, month: 6, day: 31 }));
  });
});

describe('ساعت', () => {
  it('ارقام فارسی و قالب‌های کوتاه را می‌خواند', () => {
    expect(parseTime('09:30')).toBe('09:30');
    expect(parseTime('۰۹:۳۰')).toBe('09:30');
    expect(parseTime('930')).toBe('09:30');
    expect(parseTime('2359')).toBe('23:59');
  });

  it('ساعت بی‌معنا را null می‌کند', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('12:70')).toBeNull();
  });

  it('جدا و چسباندن تاریخ و ساعت، رفت‌وبرگشتی است', () => {
    expect(splitDateTime('2026-10-21T09:30')).toEqual({ date: '2026-10-21', time: '09:30' });
    expect(splitDateTime('2026-10-21')).toEqual({ date: '2026-10-21', time: null });
    expect(splitDateTime(null)).toEqual({ date: null, time: null });

    expect(joinDateTime('2026-10-21', '09:30')).toBe('2026-10-21T09:30');
    expect(joinDateTime('2026-10-21', null)).toBe('2026-10-21');
    expect(joinDateTime(null, '09:30')).toBeNull();
  });
});
