import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import { serializeBigInts } from './bigint-serializer.interceptor';

/**
 * معیار پذیرش فاز ۱: مبلغ بزرگ‌تر از حد امن Number در مرز API دقت از دست نمی‌دهد
 * (ریسک R2، ADR-0003).
 */
describe('سریالایز BIGINT در مرز API', () => {
  it('bigint را به رشته تبدیل می‌کند', () => {
    expect(serializeBigInts(125_000_000n)).toBe('125000000');
  });

  it('مبلغ بزرگ‌تر از ۲^۵۳ را بدون از دست رفتن دقت منتقل می‌کند', () => {
    const value = 9_007_199_254_740_993n; // ۲^۵۳ + ۱
    const serialized = serializeBigInts(value);

    expect(serialized).toBe('9007199254740993');
    // اثبات اینکه مسیر JSON هم سالم می‌ماند
    expect(JSON.parse(JSON.stringify({ amount: serialized })).amount).toBe('9007199254740993');
    // و اینکه بازگشت به bigint همان مقدار اولیه است
    expect(BigInt(serialized as string)).toBe(value);
  });

  it('درون اشیای تودرتو هم کار می‌کند', () => {
    const input = {
      document: {
        totalAmount: 9_007_199_254_740_993n,
        invoices: [{ total: 1n }, { total: 2n }],
      },
    };

    expect(serializeBigInts(input)).toEqual({
      document: {
        totalAmount: '9007199254740993',
        invoices: [{ total: '1' }, { total: '2' }],
      },
    });
  });

  it('مقادیر دیگر را دست‌نخورده می‌گذارد', () => {
    const date = new Date('2026-10-16T00:00:00.000Z');
    expect(serializeBigInts('متن')).toBe('متن');
    expect(serializeBigInts(42)).toBe(42);
    expect(serializeBigInts(true)).toBe(true);
    expect(serializeBigInts(null)).toBeNull();
    expect(serializeBigInts(undefined)).toBeUndefined();
    expect(serializeBigInts(date)).toBe(date);
  });

  it('Prisma.Decimal به رشته با سه رقم اعشار تبدیل می‌شود', () => {
    // بدون این، مقدار به‌صورت **عدد** سریالایز می‌شد و قرارداد «مقدار = رشته»
    // می‌شکست — همان باگی که در رندر جزئیات سند دیده شد.
    expect(serializeBigInts(new Prisma.Decimal('2.5'))).toBe('2.500');
    expect(serializeBigInts(new Prisma.Decimal('3'))).toBe('3.000');
    expect(typeof serializeBigInts(new Prisma.Decimal('1.234'))).toBe('string');
  });

  it('مقدار اعشاری درون ردیف فاکتور هم تبدیل می‌شود', () => {
    const row = { rowNo: 1, quantity: new Prisma.Decimal('2.5'), unitPrice: 1_000_001n };
    expect(serializeBigInts(row)).toEqual({
      rowNo: 1,
      quantity: '2.500',
      unitPrice: '1000001',
    });
  });

  it('آرایه در ریشه را هم پوشش می‌دهد', () => {
    expect(serializeBigInts([1n, 2n])).toEqual(['1', '2']);
  });

  it('کل پاسخ پس از سریالایز قابل JSON شدن است', () => {
    const payload = { amounts: [1n, 9_007_199_254_740_993n], nested: { value: 5n } };
    expect(() => JSON.stringify(serializeBigInts(payload))).not.toThrow();
    // بدون interceptor، همین کار خطا می‌دهد:
    expect(() => JSON.stringify(payload)).toThrow(TypeError);
  });
});
