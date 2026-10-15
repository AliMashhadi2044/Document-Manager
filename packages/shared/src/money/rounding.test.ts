import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { allocateProportionally, roundDiv } from './rounding';

describe('roundDiv — HALF_UP', () => {
  it('نیم را به بالا می‌برد', () => {
    expect(roundDiv(5n, 10n, 'HALF_UP')).toBe(1n);
    expect(roundDiv(15n, 10n, 'HALF_UP')).toBe(2n);
    expect(roundDiv(25n, 10n, 'HALF_UP')).toBe(3n);
  });

  it('کمتر از نیم را پایین می‌آورد', () => {
    expect(roundDiv(4n, 10n, 'HALF_UP')).toBe(0n);
    expect(roundDiv(14n, 10n, 'HALF_UP')).toBe(1n);
  });

  it('برای منفی، دور از صفر گرد می‌کند', () => {
    expect(roundDiv(-5n, 10n, 'HALF_UP')).toBe(-1n);
    expect(roundDiv(-15n, 10n, 'HALF_UP')).toBe(-2n);
  });

  it('تقسیم دقیق را تغییر نمی‌دهد', () => {
    expect(roundDiv(100n, 10n, 'HALF_UP')).toBe(10n);
  });
});

describe('roundDiv — FLOOR', () => {
  it('همیشه به سمت منفی بی‌نهایت می‌رود', () => {
    expect(roundDiv(19n, 10n, 'FLOOR')).toBe(1n);
    expect(roundDiv(-11n, 10n, 'FLOOR')).toBe(-2n);
    expect(roundDiv(-10n, 10n, 'FLOOR')).toBe(-1n);
  });
});

describe('roundDiv — HALF_EVEN', () => {
  it('نیم را به نزدیک‌ترین زوج می‌برد', () => {
    expect(roundDiv(5n, 10n, 'HALF_EVEN')).toBe(0n); // 0.5 → 0 (زوج)
    expect(roundDiv(15n, 10n, 'HALF_EVEN')).toBe(2n); // 1.5 → 2 (زوج)
    expect(roundDiv(25n, 10n, 'HALF_EVEN')).toBe(2n); // 2.5 → 2 (زوج)
    expect(roundDiv(35n, 10n, 'HALF_EVEN')).toBe(4n); // 3.5 → 4 (زوج)
  });

  it('غیرنیم را عادی گرد می‌کند', () => {
    expect(roundDiv(26n, 10n, 'HALF_EVEN')).toBe(3n);
    expect(roundDiv(24n, 10n, 'HALF_EVEN')).toBe(2n);
  });
});

describe('roundDiv — نگهبان‌ها', () => {
  it('مخرج صفر یا منفی را رد می‌کند', () => {
    expect(() => roundDiv(1n, 0n, 'HALF_UP')).toThrow(RangeError);
    expect(() => roundDiv(1n, -10n, 'HALF_UP')).toThrow(RangeError);
  });

  it('روی مبالغ بسیار بزرگ هم دقیق است', () => {
    const huge = 9_007_199_254_740_993n;
    expect(roundDiv(huge * 1000n, 10_000n, 'HALF_UP')).toBe(900_719_925_474_099n);
  });
});

describe('تخصیص سهم — جمع باید دقیقاً برابر کل باشد', () => {
  it('تخصیص ساده و بدون باقیمانده', () => {
    const shares = allocateProportionally(100n, [1n, 1n], 'HALF_UP');
    expect(shares).toEqual([50n, 50n]);
  });

  it('باقیمانده را پخش می‌کند تا جمع دقیق بماند', () => {
    const shares = allocateProportionally(100n, [1n, 1n, 1n], 'HALF_UP');
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(100n);
  });

  it('وزن صفر: کل مبلغ به ردیف اول می‌رود', () => {
    const shares = allocateProportionally(90n, [0n, 0n], 'HALF_UP');
    expect(shares).toEqual([90n, 0n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(90n);
  });

  it('فهرست خالی نتیجه خالی می‌دهد', () => {
    expect(allocateProportionally(10n, [], 'HALF_UP')).toEqual([]);
  });

  it('ترتیب تخصیص باقیمانده قطعی و تکرارپذیر است', () => {
    const first = allocateProportionally(1000n, [333n, 333n, 334n], 'HALF_UP');
    const second = allocateProportionally(1000n, [333n, 333n, 334n], 'HALF_UP');
    expect(first).toEqual(second);
  });

  it('property: جمع سهم‌ها همیشه دقیقاً برابر کل است', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 12n }), { minLength: 1, maxLength: 12 }),
        (total, weights) => {
          const shares = allocateProportionally(total, weights, 'HALF_UP');
          const sum = shares.reduce((a, b) => a + b, 0n);
          expect(sum).toBe(total);
          expect(shares).toHaveLength(weights.length);
        },
      ),
      { numRuns: 300 },
    );
  });
});
