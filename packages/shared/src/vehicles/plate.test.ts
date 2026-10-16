import { describe, expect, it } from 'vitest';

import { PlateError, normalizePlate, samePlate } from './plate.js';

describe('نرمال‌سازی پلاک خودرو', () => {
  it('ارقام فارسی را به لاتین تبدیل می‌کند', () => {
    expect(normalizePlate('۱۲ب۳۴۵۶۷')).toBe('12ب34567');
  });

  it('فاصله، خط تیره و واژه «ایران» را حذف می‌کند', () => {
    const forms = ['۱۲ ب ۳۴۵ ایران ۶۷', '12ب345-67', '12 ب 345 / 67', '۱۲ب۳۴۵۶۷'];
    const normalized = forms.map((form) => normalizePlate(form));

    // هر چهار نگارش باید به یک صورت یکتا برسند — وگرنه یک خودرو چند رکورد می‌شود.
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('12ب34567');
  });

  it('حروف عربی را به معادل فارسی یکدست می‌کند', () => {
    // ي عربی و ی فارسی روی صفحه‌کلیدهای مختلف جای هم تایپ می‌شوند.
    expect(samePlate('۱۲ي۳۴۵۶۷', '۱۲ی۳۴۵۶۷')).toBe(true);
    expect(samePlate('۱۲ك۳۴۵۶۷', '۱۲ک۳۴۵۶۷')).toBe(true);
  });

  it('نیم‌فاصله و نویسه‌های جهت‌نما را نادیده می‌گیرد', () => {
    expect(samePlate('۱۲‌ب‏۳۴۵۶۷', '12ب34567')).toBe(true);
  });

  it('پلاک‌های متفاوت را یکی نمی‌کند', () => {
    expect(samePlate('۱۲ب۳۴۵۶۷', '۱۲ب۳۴۵۶۸')).toBe(false);
    expect(samePlate('۱۲ب۳۴۵۶۷', '۱۲ج۳۴۵۶۷')).toBe(false);
  });

  it('پلاک خالی و پلاک بدون رقم رد می‌شوند', () => {
    expect(() => normalizePlate('   ')).toThrowError(PlateError);
    expect(() => normalizePlate('ایران')).toThrowError(PlateError);
    expect(() => normalizePlate('ب ج د')).toThrowError(/حداقل یک رقم/);
  });

  it('پلاک بسیار بلند رد می‌شود', () => {
    expect(() => normalizePlate('1'.repeat(51))).toThrowError(/بیشتر از/);
  });
});
