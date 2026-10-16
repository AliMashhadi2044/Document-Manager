import { describe, expect, it } from 'vitest';

import { INVOICE_KINDS } from '../enums/enums.js';
import { DEFAULT_ROUNDING_POLICY } from '../money/rounding.js';
import { QTY_SCALE, type Money, type Qty } from '../money/money.js';
import { calculateInvoice, calculateLine, calculateSingleAmountInvoice } from '../financial/calculate.js';
import {
  INVOICE_KIND_REGISTRY,
  INVOICE_LINE_MODELS,
  invoiceKindLineModel,
  invoiceKindSupportsTax,
} from './invoice-kind.js';

const rial = (value: number): Money => BigInt(value) as Money;

describe('رجیستری خانواده‌های فاکتور', () => {
  it('هر خانواده‌ای که در enum هست در رجیستری هم تعریف شده است', () => {
    for (const kind of INVOICE_KINDS) {
      const definition = INVOICE_KIND_REGISTRY[kind];
      expect(definition, `خانواده ${kind} در رجیستری نیست`).toBeDefined();
      expect(definition.kind).toBe(kind);
      expect(INVOICE_LINE_MODELS).toContain(definition.lineModel);
    }
    // رجیستری چیزی **بیشتر** از enum هم نباید داشته باشد.
    expect(Object.keys(INVOICE_KIND_REGISTRY).sort()).toEqual([...INVOICE_KINDS].sort());
  });

  it('مدل ردیف هر خانواده همان است که فرمش می‌طلبد', () => {
    expect(invoiceKindLineModel('NORMAL')).toBe('ITEMS');
    expect(invoiceKindLineModel('STAD')).toBe('ITEMS');
    expect(invoiceKindLineModel('UTILITY')).toBe('SINGLE_AMOUNT');
    expect(invoiceKindLineModel('FUEL')).toBe('DAILY_ENTRIES');
  });

  it('مالیات سوخت پنهان و مالیات انشعابات اختیاری است (تصمیم Q10 و §۱۲)', () => {
    expect(invoiceKindSupportsTax('FUEL')).toBe(false);
    expect(invoiceKindSupportsTax('UTILITY')).toBe(true);
    expect(INVOICE_KIND_REGISTRY.FUEL.supportsDiscount).toBe(false);
    expect(INVOICE_KIND_REGISTRY.UTILITY.supportsDiscount).toBe(true);
  });

  it('ناحیه و نوع خودرو در فیلدهای ورودی نیستند، چون سرور مشتقشان می‌کند', () => {
    expect(INVOICE_KIND_REGISTRY.UTILITY.detailFields).not.toContain('districtId');
    expect(INVOICE_KIND_REGISTRY.FUEL.detailFields).not.toContain('vehicleTypeId');
  });
});

/** معیار پذیرش ۵ فاز ۴: محاسبه انشعابات با فاکتور عادی یکسان است. */
describe('یکسانی محاسبه انشعابات و فاکتور عادی', () => {
  const policy = DEFAULT_ROUNDING_POLICY;

  it('مبلغ پایه با تخفیف و مالیات درصدی، همان نتیجه ردیف عادی را می‌دهد', () => {
    const utility = calculateSingleAmountInvoice(
      {
        baseAmount: rial(13_456_789),
        discount: rial(456_789),
        taxMode: 'PERCENT',
        taxRateBp: 1000,
        taxAmount: null,
      },
      policy,
    );

    const normal = calculateLine(
      {
        quantity: QTY_SCALE as Qty,
        unitPrice: rial(13_456_789),
        discount: rial(456_789),
        taxMode: 'PERCENT',
        taxRateBp: 1000,
        taxAmount: null,
      },
      policy,
    );

    expect(utility).toEqual(normal);

    // و با مسیر فاکتور چندردیفی هم که سرور استفاده می‌کند یکی است.
    const viaInvoice = calculateInvoice(
      [
        {
          quantity: QTY_SCALE as Qty,
          unitPrice: rial(13_456_789),
          discount: rial(456_789),
          taxMode: 'PERCENT',
          taxRateBp: 1000,
          taxAmount: null,
        },
      ],
      policy,
      { mode: 'PERCENT', rateBp: 1000, amount: null },
    );

    expect(viaInvoice.totals.tax).toBe(utility.tax);
    expect(viaInvoice.totals.total).toBe(utility.total);
  });

  it('مالیات دستی هم در هر دو مسیر یکسان است', () => {
    const input = {
      baseAmount: rial(1_000_000),
      discount: rial(0),
      taxMode: 'AMOUNT' as const,
      taxRateBp: null,
      taxAmount: rial(73_451),
    };

    const utility = calculateSingleAmountInvoice(input, policy);
    expect(utility.tax).toBe(rial(73_451));
    expect(utility.total).toBe(rial(1_073_451));
  });
});
