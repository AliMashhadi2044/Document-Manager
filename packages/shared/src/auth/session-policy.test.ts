import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SESSION_POLICY,
  SESSION_IDLE_MAX_MINUTES,
  SESSION_IDLE_MIN_MINUTES,
  parseSessionPolicy,
  sessionPolicySchema,
} from './session-policy.js';

describe('سیاست نشست', () => {
  it('مقدار نیامده یعنی «پیش‌فرض سرور»، نه بی‌نهایت', () => {
    const parsed = sessionPolicySchema.parse({});
    expect(parsed.idleMinutes).toBeNull();
    expect(DEFAULT_SESSION_POLICY.idleMinutes).toBeNull();
  });

  it('عدد معتبر پذیرفته می‌شود', () => {
    expect(sessionPolicySchema.parse({ idleMinutes: 45 }).idleMinutes).toBe(45);
  });

  it('رشتهٔ رقمی هم پذیرفته می‌شود (ورودی فرم رشته است)', () => {
    expect(sessionPolicySchema.parse({ idleMinutes: '20' }).idleMinutes).toBe(20);
  });

  /*
    کمینه و بیشینه، کنترل امنیتی‌اند نه سلیقه: مهلت یک‌دقیقه‌ای کاربر را وسط فرم
    بیرون می‌انداخت و مهلت یک‌هفته‌ای مهلت را عملاً برمی‌داشت.
  */
  it.each([
    SESSION_IDLE_MIN_MINUTES - 1,
    0,
    -5,
    SESSION_IDLE_MAX_MINUTES + 1,
  ])('عدد بیرون از بازه رد می‌شود: %s', (value) => {
    expect(sessionPolicySchema.safeParse({ idleMinutes: value }).success).toBe(false);
  });

  it('عدد اعشاری رد می‌شود', () => {
    expect(sessionPolicySchema.safeParse({ idleMinutes: 12.5 }).success).toBe(false);
  });

  it('مرزهای بازه خودشان معتبرند', () => {
    expect(
      sessionPolicySchema.parse({ idleMinutes: SESSION_IDLE_MIN_MINUTES }).idleMinutes,
    ).toBe(SESSION_IDLE_MIN_MINUTES);
    expect(
      sessionPolicySchema.parse({ idleMinutes: SESSION_IDLE_MAX_MINUTES }).idleMinutes,
    ).toBe(SESSION_IDLE_MAX_MINUTES);
  });

  it('مقدار ذخیره‌شدهٔ خراب، سامانه را نمی‌خواباند', () => {
    expect(parseSessionPolicy({ idleMinutes: 'خیلی' })).toEqual(DEFAULT_SESSION_POLICY);
    expect(parseSessionPolicy(null)).toEqual(DEFAULT_SESSION_POLICY);
    expect(parseSessionPolicy({ idleMinutes: 99_999 })).toEqual(DEFAULT_SESSION_POLICY);
  });
});
