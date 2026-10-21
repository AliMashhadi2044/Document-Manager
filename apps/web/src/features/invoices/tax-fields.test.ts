import { describe, expect, it } from 'vitest';

import { parsePercent } from './tax-fields';

/**
 * درصد مالیات به basis point.
 *
 * مقدار نامعتبر باید `null` شود و نه صفر: صفر یعنی «مالیات ندارد» و بی‌صدا یک فاکتور
 * غلط می‌سازد، در حالی که `null` فرم را نامعتبر نگه می‌دارد و سرور هم ردش می‌کند.
 */
describe('parsePercent', () => {
  it('درصد صحیح و اعشاری را به basis point می‌برد', () => {
    expect(parsePercent('10')).toBe(1000);
    expect(parsePercent('9.5')).toBe(950);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('100')).toBe(10_000);
  });

  it('ارقام و ممیز فارسی را می‌پذیرد', () => {
    expect(parsePercent('۹٫۵')).toBe(950);
    expect(parsePercent('۱۰')).toBe(1000);
  });

  it('به نزدیک‌ترین basis point گرد می‌کند', () => {
    expect(parsePercent('9.555')).toBe(956);
    expect(parsePercent('9.554')).toBe(955);
  });

  it('مقدار بی‌معنا یا خارج از بازه را null می‌کند، نه صفر', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent('.')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parsePercent('101')).toBeNull();
    // علامت منفی اصلاً خوانده نمی‌شود: «-۵» همان ۵ درصد است، نه مقداری منفی.
    expect(parsePercent('-5')).toBe(500);
  });
});
