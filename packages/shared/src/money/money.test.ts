import { describe, expect, it } from 'vitest';

import {
  moneyFromString,
  moneyToString,
  normalizeDigits,
  qtyFromString,
  qtyToString,
  sumMoney,
  MoneyError,
  type Money,
} from './money.js';

describe('نرمال‌سازی ارقام', () => {
  it('ارقام فارسی را به ASCII تبدیل می‌کند', () => {
    expect(normalizeDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
  });

  it('ارقام عربی را به ASCII تبدیل می‌کند', () => {
    expect(normalizeDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
  });

  it('متن غیرعددی را دست‌نخورده می‌گذارد', () => {
    expect(normalizeDigits('مبلغ ۱۰۰ ریال')).toBe('مبلغ 100 ریال');
  });
});

describe('خواندن مبلغ از رشته', () => {
  it('رشته ساده را می‌خواند', () => {
    expect(moneyFromString('125000000')).toBe(125_000_000n);
  });

  it('ارقام فارسی را می‌پذیرد', () => {
    expect(moneyFromString('۲۹۵۰۴۸۱۵۱۰')).toBe(2_950_481_510n);
  });

  it('جداکننده هزارگان را نادیده می‌گیرد', () => {
    expect(moneyFromString('2,950,481,510')).toBe(2_950_481_510n);
    expect(moneyFromString('۲٬۹۵۰٬۴۸۱٬۵۱۰')).toBe(2_950_481_510n);
  });

  it('مبلغ منفی را می‌خواند', () => {
    expect(moneyFromString('-500')).toBe(-500n);
  });

  it('رشته نامعتبر را رد می‌کند', () => {
    expect(() => moneyFromString('12.5')).toThrow(MoneyError);
    expect(() => moneyFromString('abc')).toThrow(MoneyError);
    expect(() => moneyFromString('')).toThrow(MoneyError);
  });
});

describe('دقت مبالغ بزرگ — ریسک R2', () => {
  // این تست دلیل وجود کل قرارداد bigint است.
  const beyondSafeInteger = '9007199254740993'; // ۲^۵۳ + ۱

  it('مبلغ بزرگ‌تر از حد امن Number را بدون از دست رفتن دقت نگه می‌دارد', () => {
    const value = moneyFromString(beyondSafeInteger);
    expect(moneyToString(value)).toBe(beyondSafeInteger);
  });

  it('نشان می‌دهد که Number همین مقدار را خراب می‌کند', () => {
    // اثبات اینکه اگر از number استفاده می‌کردیم، خاموشانه خطا می‌دادیم.
    expect(String(Number(beyondSafeInteger))).not.toBe(beyondSafeInteger);
  });

  it('جمع مبالغ بسیار بزرگ دقیق می‌ماند', () => {
    const a = moneyFromString('9007199254740993');
    const b = moneyFromString('9007199254740993');
    expect(moneyToString(sumMoney([a, b]))).toBe('18014398509481986');
  });

  it('رفت‌وبرگشت رشته ⇄ مبلغ برای عدد بسیار بزرگ پایدار است', () => {
    const huge = '123456789012345678901234567890';
    expect(moneyToString(moneyFromString(huge))).toBe(huge);
  });
});

describe('مقدار با مقیاس هزارم', () => {
  it('عدد صحیح را می‌خواند', () => {
    expect(qtyFromString('3')).toBe(3000n);
  });

  it('عدد اعشاری را می‌خواند', () => {
    expect(qtyFromString('2.5')).toBe(2500n);
    expect(qtyFromString('0.001')).toBe(1n);
  });

  it('ممیز و ارقام فارسی را می‌پذیرد', () => {
    expect(qtyFromString('۲٫۵')).toBe(2500n);
  });

  it('بیش از سه رقم اعشار را رد می‌کند تا گرد کردن خاموش رخ ندهد', () => {
    expect(() => qtyFromString('1.2345')).toThrow(MoneyError);
  });

  it('سریالایز مقدار سه رقم اعشار می‌دهد', () => {
    expect(qtyToString(2500n as never)).toBe('2.500');
    expect(qtyToString(1n as never)).toBe('0.001');
  });
});

describe('جمع مبالغ', () => {
  it('فهرست خالی صفر می‌دهد', () => {
    expect(sumMoney([])).toBe(0n);
  });

  it('مبالغ را جمع می‌کند', () => {
    const values = [100n, 250n, 3n] as Money[];
    expect(sumMoney(values)).toBe(353n);
  });
});
