import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUNDING_POLICY } from '@dm/shared';

import { parseRoundingPolicy } from './financial.service';

/**
 * سیاست گرد کردن از JSON ذخیره‌شده روی سند خوانده می‌شود. اگر مقدار خراب یا از نسخه
 * قدیمی باشد، باید به پیش‌فرض برگردد — نه اینکه محاسبه با مقدار نامعتبر انجام شود.
 */
describe('خواندن سیاست گرد کردن از snapshot سند', () => {
  it('مقدار معتبر را همان‌طور برمی‌گرداند', () => {
    expect(parseRoundingPolicy({ scope: 'INVOICE', mode: 'HALF_EVEN' })).toEqual({
      scope: 'INVOICE',
      mode: 'HALF_EVEN',
    });
  });

  it('هر سه حالت گرد کردن پذیرفته می‌شوند', () => {
    for (const mode of ['HALF_UP', 'FLOOR', 'HALF_EVEN'] as const) {
      expect(parseRoundingPolicy({ scope: 'LINE', mode })).toEqual({ scope: 'LINE', mode });
    }
  });

  it('مقدار ناشناخته به پیش‌فرض برمی‌گردد', () => {
    expect(parseRoundingPolicy({ scope: 'GALAXY', mode: 'HALF_UP' })).toEqual(
      DEFAULT_ROUNDING_POLICY,
    );
    expect(parseRoundingPolicy({ scope: 'LINE', mode: 'RANDOM' })).toEqual(
      DEFAULT_ROUNDING_POLICY,
    );
  });

  it('مقدار خالی یا نادرست به پیش‌فرض برمی‌گردد', () => {
    expect(parseRoundingPolicy(null)).toEqual(DEFAULT_ROUNDING_POLICY);
    expect(parseRoundingPolicy(undefined)).toEqual(DEFAULT_ROUNDING_POLICY);
    expect(parseRoundingPolicy('LINE')).toEqual(DEFAULT_ROUNDING_POLICY);
    expect(parseRoundingPolicy({})).toEqual(DEFAULT_ROUNDING_POLICY);
  });
});
