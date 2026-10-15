import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  calculateFuelInvoice,
  calculateInvoice,
  calculateLine,
  calculateSingleAmountInvoice,
  FinancialError,
  sumInvoiceTotals,
  type LineInput,
} from './calculate';
import { DEFAULT_ROUNDING_POLICY, type RoundingPolicy } from '../money/rounding';
import type { Money, Qty } from '../money/money';

const LINE_HALF_UP = DEFAULT_ROUNDING_POLICY;
const INVOICE_HALF_UP: RoundingPolicy = { scope: 'INVOICE', mode: 'HALF_UP' };

/** نرخ جاری سازمان: ۱۰٪ (تصمیم Q4). */
const RATE_10 = 1000;

function line(partial: Partial<LineInput> = {}): LineInput {
  return {
    quantity: 1000n as Qty, // یعنی ۱
    unitPrice: 0n as Money,
    discount: 0n as Money,
    taxMode: 'PERCENT',
    taxRateBp: RATE_10,
    taxAmount: null,
    ...partial,
  };
}

describe('۱ — ردیف ساده با تعداد صحیح', () => {
  it('مبلغ کل، خالص، مالیات و نهایی را درست می‌دهد', () => {
    const result = calculateLine(
      line({ quantity: 3000n as Qty, unitPrice: 1_250_000n as Money }),
      LINE_HALF_UP,
    );
    expect(result.gross).toBe(3_750_000n);
    expect(result.net).toBe(3_750_000n);
    expect(result.tax).toBe(375_000n);
    expect(result.total).toBe(4_125_000n);
  });
});

describe('۲ — تعداد اعشاری با گرد کردن', () => {
  it('۲٫۵ × ۱۰۰۰۰۰۱ را نیم به بالا گرد می‌کند', () => {
    const result = calculateLine(
      line({ quantity: 2500n as Qty, unitPrice: 1_000_001n as Money, discount: 3n as Money }),
      LINE_HALF_UP,
    );
    // 2.5 × 1000001 = 2500002.5 ⇒ 2500003
    expect(result.gross).toBe(2_500_003n);
    expect(result.net).toBe(2_500_000n);
    expect(result.tax).toBe(250_000n);
    expect(result.total).toBe(2_750_000n);
  });

  it('با حالت FLOOR نتیجه متفاوت و مستند است', () => {
    const result = calculateLine(
      line({ quantity: 2500n as Qty, unitPrice: 1_000_001n as Money }),
      { scope: 'LINE', mode: 'FLOOR' },
    );
    expect(result.gross).toBe(2_500_002n);
  });
});

describe('۳ و ۴ — تخفیف صفر و تخفیف کامل', () => {
  it('تخفیف صفر مبلغ را تغییر نمی‌دهد', () => {
    const result = calculateLine(line({ unitPrice: 1_000n as Money }), LINE_HALF_UP);
    expect(result.discount).toBe(0n);
    expect(result.net).toBe(1_000n);
  });

  it('تخفیف کامل، خالص و مالیات را صفر می‌کند', () => {
    const result = calculateLine(
      line({ unitPrice: 1_000n as Money, discount: 1_000n as Money }),
      LINE_HALF_UP,
    );
    expect(result.net).toBe(0n);
    expect(result.tax).toBe(0n);
    expect(result.total).toBe(0n);
  });
});

describe('۵ — تخفیف بیش از مبلغ کل', () => {
  it('به‌صورت پیش‌فرض رد می‌شود', () => {
    expect(() =>
      calculateLine(
        line({ unitPrice: 1_000n as Money, discount: 1_001n as Money }),
        LINE_HALF_UP,
      ),
    ).toThrow(FinancialError);
  });

  it('با تنظیم صریح مجاز می‌شود ولی خالص منفی همچنان رد است', () => {
    expect(() =>
      calculateLine(line({ unitPrice: 1_000n as Money, discount: 1_001n as Money }), LINE_HALF_UP, {
        allowDiscountOverGross: true,
      }),
    ).toThrow(/منفی/);
  });
});

describe('۶ و ۹ — نرخ صفر و نرخ اعشاری', () => {
  it('نرخ صفر مالیات صفر می‌دهد', () => {
    const result = calculateLine(
      line({ unitPrice: 1_000_000n as Money, taxRateBp: 0 }),
      LINE_HALF_UP,
    );
    expect(result.tax).toBe(0n);
    expect(result.total).toBe(1_000_000n);
  });

  it('نرخ ۹٫۵٪ به‌صورت ۹۵۰ basis point کار می‌کند', () => {
    const result = calculateLine(
      line({ unitPrice: 1_000_000n as Money, taxRateBp: 950 }),
      LINE_HALF_UP,
    );
    expect(result.tax).toBe(95_000n);
  });

  it('نرخ بیرون از بازه رد می‌شود', () => {
    expect(() => calculateLine(line({ taxRateBp: -1 }), LINE_HALF_UP)).toThrow(FinancialError);
    expect(() => calculateLine(line({ taxRateBp: 10_001 }), LINE_HALF_UP)).toThrow(FinancialError);
  });

  it('نرخ غیرصحیح رد می‌شود', () => {
    expect(() => calculateLine(line({ taxRateBp: 9.5 }), LINE_HALF_UP)).toThrow(FinancialError);
  });
});

describe('۷ و ۸ — مالیات دستی', () => {
  const manual = line({
    quantity: 2000n as Qty,
    unitPrice: 1_000_000n as Money,
    taxMode: 'AMOUNT',
    taxRateBp: null,
    taxAmount: 123_456n as Money,
  });

  it('مبلغ دستی عیناً استفاده می‌شود', () => {
    const result = calculateLine(manual, LINE_HALF_UP);
    expect(result.tax).toBe(123_456n);
    expect(result.total).toBe(2_123_456n);
  });

  it('تغییر تعداد، مالیات دستی را بازنویسی نمی‌کند', () => {
    const changed = calculateLine({ ...manual, quantity: 5000n as Qty }, LINE_HALF_UP);
    expect(changed.gross).toBe(5_000_000n);
    expect(changed.tax).toBe(123_456n); // دست‌نخورده
  });

  it('بازگشت به حالت درصدی، مالیات را بازمحاسبه می‌کند', () => {
    const back = calculateLine(
      { ...manual, taxMode: 'PERCENT', taxRateBp: RATE_10, taxAmount: null },
      LINE_HALF_UP,
    );
    expect(back.tax).toBe(200_000n);
  });

  it('در حالت دستی، نرخ باید خالی باشد', () => {
    expect(() => calculateLine({ ...manual, taxRateBp: RATE_10 }, LINE_HALF_UP)).toThrow(
      FinancialError,
    );
  });

  it('در حالت درصدی، نرخ الزامی است', () => {
    expect(() => calculateLine(line({ taxRateBp: null }), LINE_HALF_UP)).toThrow(FinancialError);
  });

  it('مالیات دستی منفی رد می‌شود', () => {
    expect(() =>
      calculateLine({ ...manual, taxAmount: -1n as Money }, LINE_HALF_UP),
    ).toThrow(FinancialError);
  });
});

describe('۱۰ و ۱۱ — مبالغ مرزی', () => {
  it('مبلغ بزرگ‌تر از ۲^۵۳ دقت خود را حفظ می‌کند', () => {
    const result = calculateLine(
      line({ unitPrice: 9_007_199_254_740_993n as Money, taxRateBp: 0 }),
      LINE_HALF_UP,
    );
    expect(result.gross).toBe(9_007_199_254_740_993n);
    expect(result.total.toString()).toBe('9007199254740993');
  });

  it('همه مقادیر صفر معتبر است', () => {
    const result = calculateLine(line({ unitPrice: 0n as Money, taxRateBp: 0 }), LINE_HALF_UP);
    expect(result).toMatchObject({ gross: 0n, net: 0n, tax: 0n, total: 0n });
  });
});

describe('۱۲ — تعداد و مبلغ نامعتبر', () => {
  it('تعداد صفر رد می‌شود', () => {
    expect(() => calculateLine(line({ quantity: 0n as Qty }), LINE_HALF_UP)).toThrow(/تعداد/);
  });

  it('تعداد منفی رد می‌شود', () => {
    expect(() => calculateLine(line({ quantity: -1000n as Qty }), LINE_HALF_UP)).toThrow(/تعداد/);
  });

  it('مبلغ واحد منفی رد می‌شود', () => {
    expect(() => calculateLine(line({ unitPrice: -1n as Money }), LINE_HALF_UP)).toThrow(/منفی/);
  });

  it('تخفیف منفی رد می‌شود', () => {
    expect(() => calculateLine(line({ discount: -1n as Money }), LINE_HALF_UP)).toThrow(/منفی/);
  });
});

describe('۱۳ و ۱۴ — جمع فاکتور و سند', () => {
  const lines: LineInput[] = [
    line({ quantity: 3000n as Qty, unitPrice: 1_250_000n as Money }),
    line({ quantity: 1000n as Qty, unitPrice: 500_000n as Money, discount: 50_000n as Money }),
  ];

  it('جمع فاکتور برابر مجموع ردیف‌های گرد‌شده است', () => {
    const { lines: results, totals } = calculateInvoice(lines, LINE_HALF_UP, {
      mode: 'PERCENT',
      rateBp: RATE_10,
      amount: null,
    });
    const manualTotal = results.reduce((sum, item) => sum + item.total, 0n);
    expect(totals.total).toBe(manualTotal);
    expect(totals.net).toBe(totals.gross - totals.discount);
    expect(totals.total).toBe(totals.net + totals.tax);
  });

  it('جمع سند برابر مجموع فاکتورهاست', () => {
    const invoiceA = calculateInvoice(lines, LINE_HALF_UP, {
      mode: 'PERCENT',
      rateBp: RATE_10,
      amount: null,
    }).totals;
    const invoiceB = calculateFuelInvoice([100_000n, 250_000n] as Money[]);

    const document = sumInvoiceTotals([invoiceA, invoiceB]);
    expect(document.gross).toBe(invoiceA.gross + invoiceB.gross);
    expect(document.total).toBe(invoiceA.total + invoiceB.total);
    expect(document.total).toBe(document.net + document.tax);
  });
});

describe('۲۵ و ۲۶ — سیاست گرد کردن سطح فاکتور', () => {
  const lines: LineInput[] = [
    line({ quantity: 1000n as Qty, unitPrice: 333n as Money }),
    line({ quantity: 1000n as Qty, unitPrice: 333n as Money }),
    line({ quantity: 1000n as Qty, unitPrice: 334n as Money }),
  ];

  it('جمع سهم مالیات ردیف‌ها دقیقاً با مالیات فاکتور برابر است', () => {
    const { lines: results, totals } = calculateInvoice(lines, INVOICE_HALF_UP, {
      mode: 'PERCENT',
      rateBp: RATE_10,
      amount: null,
    });
    const sumOfShares = results.reduce((sum, item) => sum + item.tax, 0n);
    expect(sumOfShares).toBe(totals.tax);
    expect(totals.tax).toBe(100n); // ۱۰٪ از ۱۰۰۰
  });

  it('دو سیاست نتیجه متفاوت و مستند می‌دهند', () => {
    const byLine = calculateInvoice(lines, LINE_HALF_UP, {
      mode: 'PERCENT',
      rateBp: RATE_10,
      amount: null,
    }).totals;
    const byInvoice = calculateInvoice(lines, INVOICE_HALF_UP, {
      mode: 'PERCENT',
      rateBp: RATE_10,
      amount: null,
    }).totals;

    // ردیفی: 33+33+33=99 ؛ فاکتوری: ۱۰٪ از ۱۰۰۰ = ۱۰۰
    expect(byLine.tax).toBe(99n);
    expect(byInvoice.tax).toBe(100n);
    expect(byInvoice.total).toBe(byInvoice.net + byInvoice.tax);
  });

  it('مالیات دستی در سطح فاکتور هم تخصیص می‌یابد', () => {
    const { lines: results, totals } = calculateInvoice(lines, INVOICE_HALF_UP, {
      mode: 'AMOUNT',
      rateBp: null,
      amount: 777n as Money,
    });
    expect(totals.tax).toBe(777n);
    expect(results.reduce((sum, item) => sum + item.tax, 0n)).toBe(777n);
  });
});

describe('۱۵ — فاکتور تک‌مبلغی انشعابات', () => {
  it('از همان مسیر محاسبه فاکتور عادی عبور می‌کند', () => {
    const result = calculateSingleAmountInvoice(
      {
        baseAmount: 2_950_481_510n as Money,
        discount: 0n as Money,
        taxMode: 'AMOUNT',
        taxRateBp: null,
        taxAmount: 0n as Money,
      },
      LINE_HALF_UP,
    );
    // مطابق ردیف اول تصویر مرجع
    expect(result.gross).toBe(2_950_481_510n);
    expect(result.net).toBe(2_950_481_510n);
    expect(result.tax).toBe(0n);
    expect(result.total).toBe(2_950_481_510n);
  });

  it('مالیات درصدی انشعابات با فاکتور عادی یکسان است', () => {
    const utility = calculateSingleAmountInvoice(
      {
        baseAmount: 1_000_000n as Money,
        discount: 0n as Money,
        taxMode: 'PERCENT',
        taxRateBp: RATE_10,
        taxAmount: null,
      },
      LINE_HALF_UP,
    );
    const normal = calculateLine(line({ unitPrice: 1_000_000n as Money }), LINE_HALF_UP);
    expect(utility.tax).toBe(normal.tax);
    expect(utility.total).toBe(normal.total);
  });
});

describe('۱۶ — فاکتور سوخت', () => {
  it('جمع ردیف‌های سوخت‌گیری را می‌دهد', () => {
    const totals = calculateFuelInvoice([150_000n, 200_000n, 175_000n] as Money[]);
    expect(totals.gross).toBe(525_000n);
    expect(totals.tax).toBe(0n);
    expect(totals.total).toBe(525_000n);
  });

  it('فاکتور بدون ردیف صفر است', () => {
    expect(calculateFuelInvoice([]).total).toBe(0n);
  });

  it('مبلغ منفی رد می‌شود', () => {
    expect(() => calculateFuelInvoice([-1n] as Money[])).toThrow(FinancialError);
  });
});

describe('۲۲ و ۲۳ — property-based', () => {
  const moneyArb = fc.bigInt({ min: 0n, max: 10n ** 18n });

  it('اتحادهای مالی برای هر ورودی معتبر برقرارند', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        moneyArb,
        fc.integer({ min: 0, max: 10_000 }),
        (quantity, unitPrice, rateBp) => {
          const result = calculateLine(
            {
              quantity: quantity as Qty,
              unitPrice: unitPrice as Money,
              discount: 0n as Money,
              taxMode: 'PERCENT',
              taxRateBp: rateBp,
              taxAmount: null,
            },
            LINE_HALF_UP,
          );

          expect(result.net).toBe(result.gross - result.discount);
          expect(result.total).toBe(result.net + result.tax);
          expect(result.gross >= 0n).toBe(true);
          expect(result.net >= 0n).toBe(true);
          expect(result.tax >= 0n).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('جمع فاکتور همیشه با مجموع ردیف‌ها برابر است', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            quantity: fc.bigInt({ min: 1n, max: 10n ** 6n }),
            unitPrice: fc.bigInt({ min: 0n, max: 10n ** 12n }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (rows) => {
          const inputs: LineInput[] = rows.map((row) => ({
            quantity: row.quantity as Qty,
            unitPrice: row.unitPrice as Money,
            discount: 0n as Money,
            taxMode: 'PERCENT',
            taxRateBp: RATE_10,
            taxAmount: null,
          }));

          const { lines: results, totals } = calculateInvoice(inputs, LINE_HALF_UP, {
            mode: 'PERCENT',
            rateBp: RATE_10,
            amount: null,
          });

          expect(totals.gross).toBe(results.reduce((sum, item) => sum + item.gross, 0n));
          expect(totals.tax).toBe(results.reduce((sum, item) => sum + item.tax, 0n));
          expect(totals.total).toBe(totals.net + totals.tax);
        },
      ),
      { numRuns: 200 },
    );
  });
});
