import { describe, expect, it } from 'vitest';

import { PASSWORD_MIN_LENGTH, passwordPolicyIssue } from './password-policy.js';

/**
 * سیاست رمز عبور.
 *
 * ارزش این تست‌ها در چیزی است که **رد** می‌شود: «۱۲ نویسه» به‌تنهایی رمزی مثل
 * `123456789012` را قبول می‌کرد، و همان چیزی است که کاربر وقتی فقط طول را
 * می‌شنود می‌نویسد.
 */
describe('سیاست رمز عبور', () => {
  it('رمز به‌قدر کافی بلند و متنوع را می‌پذیرد', () => {
    expect(passwordPolicyIssue('Tehran-1404-Karpardaz')).toBeNull();
  });

  it('رمز کوتاه را با گفتن حد مجاز رد می‌کند', () => {
    expect(passwordPolicyIssue('Short1')).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it('رمز همه‌عدد را رد می‌کند، هرچند بلند باشد', () => {
    expect(passwordPolicyIssue('123456789012345')).toBe('رمز عبور نمی‌تواند فقط از رقم ساخته شود');
  });

  it('رمزِ یک نویسهٔ تکرارشده را رد می‌کند', () => {
    expect(passwordPolicyIssue('aaaaaaaaaaaaaaaa')).toBe('رمز عبور بیش از حد تکراری است');
    expect(passwordPolicyIssue('abababababababab')).toBe('رمز عبور بیش از حد تکراری است');
  });

  it('رمز بیش از حد بلند هم رد می‌شود', () => {
    // بدون سقف، هر درخواست می‌توانست سرور را به هش کردن مگابایت‌ها وادار کند.
    expect(passwordPolicyIssue('a1B'.repeat(200))).toContain('200');
  });
});
