import { describe, expect, it } from 'vitest';

import {
  buildFuelEntryDate,
  daysInJalaliMonth,
  formatJalali,
  isLeapJalaliYear,
  isoDateToJalali,
  jalaliMonthName,
  jalaliToIsoDate,
  JalaliError,
  parseJalali,
  toPersianDigits,
} from './jalali';

describe('تبدیل شمسی و میلادی', () => {
  it('تاریخ امروز مرجع را درست تبدیل می‌کند', () => {
    expect(jalaliToIsoDate({ year: 1405, month: 7, day: 24 })).toBe('2026-10-16');
    expect(isoDateToJalali('2026-10-16')).toEqual({ year: 1405, month: 7, day: 24 });
  });

  it('تاریخ‌های تصویر مرجع را درست تبدیل می‌کند', () => {
    expect(jalaliToIsoDate({ year: 1405, month: 7, day: 12 })).toBe('2026-10-04');
    expect(jalaliToIsoDate({ year: 1405, month: 7, day: 13 })).toBe('2026-10-05');
  });

  it('اول فروردین را درست می‌دهد', () => {
    expect(jalaliToIsoDate({ year: 1404, month: 1, day: 1 })).toBe('2025-03-21');
  });

  it('رفت‌وبرگشت روی بازه چندساله پایدار است', () => {
    for (let year = 1395; year <= 1415; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const day = Math.min(28, daysInJalaliMonth(year, month));
        const iso = jalaliToIsoDate({ year, month, day });
        expect(isoDateToJalali(iso)).toEqual({ year, month, day });
      }
    }
  });
});

describe('طول ماه و سال کبیسه', () => {
  it('شش ماه اول ۳۱ روز دارند', () => {
    for (let month = 1; month <= 6; month += 1) {
      expect(daysInJalaliMonth(1405, month)).toBe(31);
    }
  });

  it('ماه‌های هفتم تا یازدهم ۳۰ روز دارند', () => {
    for (let month = 7; month <= 11; month += 1) {
      expect(daysInJalaliMonth(1405, month)).toBe(30);
    }
  });

  it('اسفند در سال کبیسه ۳۰ و در غیرکبیسه ۲۹ روز است', () => {
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(daysInJalaliMonth(1403, 12)).toBe(30);
    expect(isLeapJalaliYear(1405)).toBe(false);
    expect(daysInJalaliMonth(1405, 12)).toBe(29);
  });
});

describe('اعتبارسنجی روز ماه — فاکتور سوخت', () => {
  it('روز معتبر تاریخ کامل می‌سازد', () => {
    expect(buildFuelEntryDate(1405, 6, 6)).toBe(jalaliToIsoDate({ year: 1405, month: 6, day: 6 }));
  });

  it('روز ۳۱ در ماه ۳۰ روزه رد می‌شود', () => {
    expect(() => buildFuelEntryDate(1405, 7, 31)).toThrow(JalaliError);
    expect(() => buildFuelEntryDate(1405, 7, 31)).toThrow(/۳۰ روز|30 روز/);
  });

  it('روز ۳۰ اسفند در سال غیرکبیسه رد می‌شود', () => {
    expect(() => buildFuelEntryDate(1405, 12, 30)).toThrow(JalaliError);
  });

  it('روز ۳۰ اسفند در سال کبیسه پذیرفته می‌شود', () => {
    expect(() => buildFuelEntryDate(1403, 12, 30)).not.toThrow();
  });

  it('ماه و روز بیرون از بازه رد می‌شوند', () => {
    expect(() => buildFuelEntryDate(1405, 13, 1)).toThrow(JalaliError);
    expect(() => buildFuelEntryDate(1405, 0, 1)).toThrow(JalaliError);
    expect(() => buildFuelEntryDate(1405, 1, 0)).toThrow(JalaliError);
  });

  it('سال بیرون از بازه مجاز رد می‌شود', () => {
    expect(() => buildFuelEntryDate(1200, 1, 1)).toThrow(/سال شمسی/);
    expect(() => buildFuelEntryDate(1600, 1, 1)).toThrow(/سال شمسی/);
  });
});

describe('تاریخ بدون ساعت نباید با timezone جابه‌جا شود', () => {
  // ریسک R12: تاریخ تقویمی هرگز از مسیر Date با ساعت عبور نمی‌کند.
  const zones = ['UTC', 'Asia/Tehran', 'Pacific/Kiritimati', 'America/Los_Angeles'];

  it('نتیجه تبدیل در هر timezone یکسان است', () => {
    const original = process.env.TZ;
    const results = zones.map((zone) => {
      process.env.TZ = zone;
      return jalaliToIsoDate({ year: 1405, month: 7, day: 24 });
    });
    process.env.TZ = original;

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe('2026-10-16');
  });
});

describe('قالب و خواندن تاریخ', () => {
  it('قالب فارسی با صفر ابتدایی می‌دهد', () => {
    expect(formatJalali({ year: 1405, month: 7, day: 12 })).toBe('۱۴۰۵/۰۷/۱۲');
  });

  it('قالب ASCII هم در دسترس است', () => {
    expect(formatJalali({ year: 1405, month: 7, day: 12 }, { persianDigits: false })).toBe(
      '1405/07/12',
    );
  });

  it('ارقام فارسی را می‌خواند', () => {
    expect(parseJalali('۱۴۰۵/۰۷/۱۲')).toEqual({ year: 1405, month: 7, day: 12 });
  });

  it('جداکننده خط تیره را هم می‌پذیرد', () => {
    expect(parseJalali('1405-07-12')).toEqual({ year: 1405, month: 7, day: 12 });
  });

  it('تاریخ نامعتبر را هنگام خواندن رد می‌کند', () => {
    expect(() => parseJalali('1405/07/31')).toThrow(JalaliError);
    expect(() => parseJalali('سلام')).toThrow(JalaliError);
  });

  it('نام ماه‌ها درست است', () => {
    expect(jalaliMonthName(1)).toBe('فروردین');
    expect(jalaliMonthName(6)).toBe('شهریور');
    expect(jalaliMonthName(12)).toBe('اسفند');
  });

  it('تبدیل ارقام به فارسی کار می‌کند', () => {
    expect(toPersianDigits('2026-10-16')).toBe('۲۰۲۶-۱۰-۱۶');
  });
});

describe('ورودی میلادی نامعتبر', () => {
  it('قالب اشتباه رد می‌شود', () => {
    expect(() => isoDateToJalali('2026/10/16')).toThrow(JalaliError);
    expect(() => isoDateToJalali('2026-13-01')).toThrow(JalaliError);
  });
});
