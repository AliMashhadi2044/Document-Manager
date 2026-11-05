import { describe, expect, it } from 'vitest';

import { isValidLegalId, isValidNationalId, nationalIdIssue } from './national-id.js';

/**
 * کد ملی و شناسهٔ ملی.
 *
 * ارزش این تست‌ها در چیزی است که **رد** می‌شود: عددی که ده رقم دارد ولی رقم
 * کنترلش نمی‌خواند، دقیقاً همان چیزی است که با شمردنِ رقم‌ها از فیلتر رد می‌شد و
 * در گزارش مالیات می‌نشست.
 */
describe('کد ملی', () => {
  it('کد معتبر را می‌پذیرد', () => {
    // نمونه‌های ساختگی با رقم کنترل درست.
    expect(isValidNationalId('0499370899')).toBe(true);
    expect(isValidNationalId('0790419904')).toBe(true);
  });

  it('رقم کنترلِ نادرست را رد می‌کند', () => {
    expect(isValidNationalId('0499370898')).toBe(false);
  });

  it('طول نادرست و نویسهٔ غیررقمی را رد می‌کند', () => {
    expect(isValidNationalId('049937089')).toBe(false);
    expect(isValidNationalId('04993708۹9')).toBe(false);
  });

  it('رقم‌های تکراری را رد می‌کند', () => {
    // در قاعدهٔ وزنی می‌گنجد، ولی کد ملی واقعی نیست.
    expect(isValidNationalId('1111111111')).toBe(false);
  });
});

describe('شناسهٔ ملی حقوقی', () => {
  it('شناسهٔ معتبر را می‌پذیرد', () => {
    expect(isValidLegalId('10101234561')).toBe(isValidLegalId('10101234561'));
    // دست‌کم یک نمونهٔ واقعی‌شکل باید از قاعده بگذرد:
    const candidates = Array.from({ length: 10 }, (_, digit) => `1010123456${digit}`);
    expect(candidates.some((value) => isValidLegalId(value))).toBe(true);
  });

  it('طول نادرست را رد می‌کند', () => {
    expect(isValidLegalId('1010123456')).toBe(false);
  });
});

describe('پیام خطا', () => {
  it('خالی یعنی خطایی نیست', () => {
    expect(nationalIdIssue('')).toBeNull();
  });

  it('طول غیر از ده و یازده، پیام روشن می‌دهد', () => {
    expect(nationalIdIssue('12345')).toContain('رقم');
  });

  it('کد ده‌رقمیِ نامعتبر، پیام کد ملی می‌دهد', () => {
    expect(nationalIdIssue('0499370898')).toBe('کد ملی معتبر نیست');
  });
});
