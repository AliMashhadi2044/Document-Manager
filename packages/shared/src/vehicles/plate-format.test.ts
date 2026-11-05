import { describe, expect, it } from 'vitest';

import {
  formatPlate,
  isPlateComplete,
  parsePlate,
  plateDigits,
  plateLetterFor,
} from './plate-format.js';

describe('قالب پلاک ایران', () => {
  it('متن نمایشی را با ارقام لاتین و واژه ایران می‌سازد', () => {
    expect(formatPlate({ left: '12', letter: 'ب', right: '345', iran: '11' })).toBe(
      '12 ب 345 ایران 11',
    );
  });

  it('همان متن را دوباره به بخش‌هایش می‌شکند', () => {
    const parts = { left: '12', letter: 'ب', right: '345', iran: '11' };
    expect(parsePlate(formatPlate(parts))).toEqual(parts);
  });

  /** مهم‌ترین ادعا: پلاک‌های قدیمیِ ثبت‌شده هم در همین فرم باز می‌شوند. */
  it('صورت‌های مختلف نوشتن یک پلاک را یکسان می‌شکند', () => {
    const forms = ['۱۲ ب ۳۴۵ ایران ۶۷', '12ب345-67', '12 ب 345 ایران 67', '۱۲ب۳۴۵۶۷'];
    for (const form of forms) {
      expect(parsePlate(form)).toEqual({ left: '12', letter: 'ب', right: '345', iran: '67' });
    }
  });

  it('حرف چندنویسه‌ای (الف) را هم می‌شناسد', () => {
    expect(parsePlate('۳۳ الف ۴۴۴ ایران ۱۰')).toEqual({
      left: '33',
      letter: 'الف',
      right: '444',
      iran: '10',
    });
  });

  it('برای پلاک غیرمعمول null می‌دهد تا فرم به متن آزاد برگردد', () => {
    expect(parsePlate('۱۲۳۴۵ موتور')).toBeNull();
    expect(parsePlate('12345678')).toBeNull();
    expect(parsePlate('ایران')).toBeNull();
  });

  it('کامل بودن را بر اساس تعداد رقم هر بخش می‌سنجد', () => {
    expect(isPlateComplete({ left: '12', letter: 'ب', right: '345', iran: '11' })).toBe(true);
    expect(isPlateComplete({ left: '1', letter: 'ب', right: '345', iran: '11' })).toBe(false);
    expect(isPlateComplete({ left: '12', letter: '', right: '345', iran: '11' })).toBe(false);
    expect(isPlateComplete({ left: '12', letter: 'ب', right: '34', iran: '11' })).toBe(false);
  });

  it('ورودی رقمی را به ارقام لاتین و طول مجاز محدود می‌کند', () => {
    expect(plateDigits('۱۲', 2)).toBe('12');
    expect(plateDigits('1a2b3', 3)).toBe('123');
    expect(plateDigits('12345', 3)).toBe('123');
    expect(plateDigits('ب', 2)).toBe('');
  });
});

/**
 * تایپ مستقیم حرف پلاک.
 *
 * «الف» سه نویسه است و هیچ‌وقت با یک فشردن کلید برابر نمی‌شود؛ کاربری که «ا»
 * می‌زد هیچ سری‌ای انتخاب نمی‌شد و فکر می‌کرد صفحه‌کلید کار نمی‌کند.
 */
describe('حرف پلاک از کلید تایپ‌شده', () => {
  it('«ا» سری «الف» را می‌دهد', () => {
    expect(plateLetterFor('ا')).toBe('الف');
  });

  it('حرف‌های تک‌نویسه‌ای همان خودشان‌اند', () => {
    expect(plateLetterFor('ب')).toBe('ب');
    expect(plateLetterFor('ژ')).toBe('ژ');
  });

  it('شکل عربی همان حرف هم پذیرفته می‌شود', () => {
    // روی صفحه‌کلیدهای مختلف «ي» جای «ی» و «أ» جای «ا» تایپ می‌شود.
    expect(plateLetterFor('ي')).toBe('ی');
    expect(plateLetterFor('أ')).toBe('الف');
  });

  it('کلیدی که سری نیست، چیزی برنمی‌گرداند', () => {
    expect(plateLetterFor('Enter')).toBeNull();
    expect(plateLetterFor('خ')).toBeNull();
    expect(plateLetterFor('5')).toBeNull();
  });
});
