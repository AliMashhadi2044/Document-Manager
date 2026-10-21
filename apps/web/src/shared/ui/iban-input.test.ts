import { describe, expect, it } from 'vitest';

import { onlyIbanDigits } from './iban-input';

/**
 * پاک‌سازی ورودی شبا.
 *
 * این تابع تنها جایی است که بین «آنچه کاربر می‌زند» و «آنچه ذخیره می‌شود» می‌ایستد؛
 * هر چیزی که از اینجا رد شود، مستقیم به سرور می‌رود.
 */
describe('onlyIbanDigits', () => {
  it('ارقام فارسی و عربی را به ASCII می‌برد', () => {
    expect(onlyIbanDigits('۱۲۳۴')).toBe('1234');
    expect(onlyIbanDigits('١٢٣٤')).toBe('1234');
  });

  it('فاصله، خط تیره و حروف را دور می‌ریزد', () => {
    expect(onlyIbanDigits('1234 5678-90ab')).toBe('1234567890');
  });

  it('پیشوند IRِ جای‌گذاری‌شده را کنار می‌گذارد، نه رقم‌ها را', () => {
    expect(onlyIbanDigits('IR840120000000000123456789')).toBe('840120000000000123456789');
    expect(onlyIbanDigits('ir84 0120 0000')).toBe('8401200000');
  });

  it('بیش از ۲۴ رقم را نمی‌پذیرد', () => {
    expect(onlyIbanDigits('9'.repeat(40))).toHaveLength(24);
  });

  it('ورودی خالی، رشته خالی می‌دهد', () => {
    expect(onlyIbanDigits('   ')).toBe('');
    expect(onlyIbanDigits('IR')).toBe('');
  });
});
