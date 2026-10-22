import { describe, expect, it } from 'vitest';

import { maskJalali } from './date-picker';

/**
 * ماسک تایپ تاریخ.
 *
 * این تابع تنها چیزی است که بین صفحه‌کلید کاربر و `parseJalali` می‌ایستد؛ هر چه از
 * اینجا رد شود، تاریخ سند می‌شود.
 */
describe('maskJalali', () => {
  it('جداکننده را خودش می‌گذارد', () => {
    expect(maskJalali('1405')).toBe('۱۴۰۵');
    expect(maskJalali('140507')).toBe('۱۴۰۵/۰۷');
    expect(maskJalali('14050712')).toBe('۱۴۰۵/۰۷/۱۲');
  });

  it('حرف، فاصله و نشانه را دور می‌ریزد', () => {
    expect(maskJalali('1405a07b12')).toBe('۱۴۰۵/۰۷/۱۲');
    expect(maskJalali('1405 / 07 / 12')).toBe('۱۴۰۵/۰۷/۱۲');
    expect(maskJalali('abcd')).toBe('');
  });

  it('ارقام فارسی و عربی را می‌پذیرد', () => {
    expect(maskJalali('۱۴۰۵۰۷۱۲')).toBe('۱۴۰۵/۰۷/۱۲');
    expect(maskJalali('١٤٠٥٠٧١٢')).toBe('۱۴۰۵/۰۷/۱۲');
  });

  it('بیش از هشت رقم نمی‌پذیرد', () => {
    expect(maskJalali('140507129999')).toBe('۱۴۰۵/۰۷/۱۲');
  });

  /**
   * ادعای واقعی: خروجی ماسک باید دوباره **خوانا** باشد، وگرنه کاربر تاریخ کامل را
   * می‌بیند و فرم می‌گوید خالی است.
   */
  it('خروجی کامل، همان قالبی است که سامانه می‌خواند', () => {
    expect(maskJalali('14050712')).toMatch(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/u);
  });
});
