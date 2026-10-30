import { describe, expect, it, vi } from 'vitest';

import { RateLimitGuard } from './rate-limit.guard';

const AUTH_RULE = { windowMs: 5 * 60_000, max: 20 };
const GENERAL_RULE = { windowMs: 60_000, max: 600 };

/** تنظیماتی که سرویس از محیط می‌خواند، با همان عددهای بالا. */
const CONFIG = {
  get: (key: string) =>
    ({
      AUTH_RATE_LIMIT_MAX: AUTH_RULE.max,
      AUTH_RATE_LIMIT_WINDOW_MINUTES: AUTH_RULE.windowMs / 60_000,
      GENERAL_RATE_LIMIT_MAX: GENERAL_RULE.max,
    })[key],
} as never;

const makeGuard = (): RateLimitGuard => new RateLimitGuard(CONFIG);

/**
 * سقف نرخ درخواست.
 *
 * ادعای اصلی چیزی است که قفلِ حساب نمی‌توانست: کسی که یک رمز را روی **نام‌های
 * کاربری مختلف** امتحان می‌کند هم باید متوقف شود — پس شمارش روی نشانی است، نه
 * روی حساب.
 */
function context(ip: string, path: string) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ ip, path }) }),
  } as never;
}

function hit(guard: RateLimitGuard, ip: string, path: string, times: number): number {
  let allowed = 0;
  for (let index = 0; index < times; index += 1) {
    try {
      guard.canActivate(context(ip, path));
      allowed += 1;
    } catch {
      break;
    }
  }
  return allowed;
}

describe('سقف نرخ', () => {
  it('ورودِ پیاپی از یک نشانی، با نام‌های کاربری مختلف هم، متوقف می‌شود', () => {
    const guard = makeGuard();

    expect(hit(guard, '10.0.0.1', '/api/v1/auth/login', AUTH_RULE.max + 5)).toBe(AUTH_RULE.max);
  });

  it('نشانی دیگر سهمیهٔ خودش را دارد', () => {
    const guard = makeGuard();
    hit(guard, '10.0.0.1', '/api/v1/auth/login', AUTH_RULE.max + 5);

    expect(() => guard.canActivate(context('10.0.0.2', '/api/v1/auth/login'))).not.toThrow();
  });

  it('سهمیهٔ ورود، سهمیهٔ مسیرهای دیگر را خرج نمی‌کند', () => {
    const guard = makeGuard();
    hit(guard, '10.0.0.1', '/api/v1/auth/login', AUTH_RULE.max + 5);

    // وگرنه چند تلاش ناموفق ورود، کاربر را از کل سامانه بیرون می‌انداخت.
    expect(() => guard.canActivate(context('10.0.0.1', '/api/v1/documents'))).not.toThrow();
  });

  it('سقف عمومی بسیار بالاتر است و کاربر واقعی به آن نمی‌خورد', () => {
    const guard = makeGuard();

    expect(GENERAL_RULE.max).toBeGreaterThan(AUTH_RULE.max * 10);
    expect(hit(guard, '10.0.0.3', '/api/v1/documents', 100)).toBe(100);
  });

  it('با گذشتن پنجره، سهمیه برمی‌گردد', () => {
    vi.useFakeTimers();
    try {
      const guard = makeGuard();
      hit(guard, '10.0.0.4', '/api/v1/auth/login', AUTH_RULE.max + 5);

      vi.advanceTimersByTime(AUTH_RULE.windowMs + 1_000);
      expect(() => guard.canActivate(context('10.0.0.4', '/api/v1/auth/login'))).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
