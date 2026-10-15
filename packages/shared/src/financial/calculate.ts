/**
 * تنها مرجع محاسبات مالی سامانه.
 *
 * Frontend این توابع را برای «پیش‌نمایش» و Backend همین توابع را برای «نتیجه قطعی»
 * فراخوانی می‌کند. هیچ فرمولی در کامپوننت UI، کوئری SQL یا قالب گزارش بازنویسی نمی‌شود.
 * این تنها راه جلوگیری از واگرایی مبالغ است (ریسک R1).
 */

import {
  MAX_RATE_BP,
  QTY_SCALE,
  RATE_SCALE,
  type Money,
  type Qty,
} from '../money/money.js';
import { allocateProportionally, roundDiv, type RoundingPolicy } from '../money/rounding.js';

export const TAX_MODES = ['PERCENT', 'AMOUNT'] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export class FinancialError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'FinancialError';
  }
}

/** ورودی یک ردیف کالا یا خدمت. */
export interface LineInput {
  /** مقدار با مقیاس هزارم. */
  readonly quantity: Qty;
  readonly unitPrice: Money;
  readonly discount: Money;
  readonly taxMode: TaxMode;
  /** basis point؛ فقط در حالت PERCENT. */
  readonly taxRateBp: number | null;
  /** فقط در حالت AMOUNT. */
  readonly taxAmount: Money | null;
}

export interface LineResult {
  readonly gross: Money;
  readonly discount: Money;
  readonly net: Money;
  readonly tax: Money;
  readonly total: Money;
}

export interface InvoiceTotals {
  readonly gross: Money;
  readonly discount: Money;
  readonly net: Money;
  readonly tax: Money;
  readonly total: Money;
}

/** اجازه تخفیف بیشتر از مبلغ کل. پیش‌فرض بسته است. */
export interface CalculationOptions {
  readonly allowDiscountOverGross?: boolean;
}

/**
 * محاسبه یک ردیف.
 *
 * سیاست گرد کردن **پارامتر صریح** است و از هیچ متغیر سراسری خوانده نمی‌شود؛
 * فراموش کردنش خطای کامپایل است، نه باگ خاموش.
 */
export function calculateLine(
  input: LineInput,
  policy: RoundingPolicy,
  options: CalculationOptions = {},
): LineResult {
  if (input.quantity <= 0n) {
    throw new FinancialError('تعداد باید بزرگ‌تر از صفر باشد', 'QUANTITY_NOT_POSITIVE', 'quantity');
  }
  if (input.unitPrice < 0n) {
    throw new FinancialError('مبلغ واحد نمی‌تواند منفی باشد', 'UNIT_PRICE_NEGATIVE', 'unitPrice');
  }
  if (input.discount < 0n) {
    throw new FinancialError('تخفیف نمی‌تواند منفی باشد', 'DISCOUNT_NEGATIVE', 'discount');
  }

  const gross = roundDiv(input.quantity * input.unitPrice, QTY_SCALE, policy.mode) as Money;

  if (!options.allowDiscountOverGross && input.discount > gross) {
    throw new FinancialError(
      'تخفیف نمی‌تواند از مبلغ کل بیشتر باشد',
      'DISCOUNT_EXCEEDS_GROSS',
      'discount',
    );
  }

  const net = (gross - input.discount) as Money;
  if (net < 0n) {
    throw new FinancialError('مبلغ خالص نمی‌تواند منفی شود', 'NET_NEGATIVE', 'net');
  }

  const tax = resolveTax(input, net, policy);
  const total = (net + tax) as Money;

  return { gross, discount: input.discount, net, tax, total };
}

function resolveTax(input: LineInput, net: Money, policy: RoundingPolicy): Money {
  if (input.taxMode === 'PERCENT') {
    if (input.taxRateBp === null) {
      throw new FinancialError('نرخ مالیات در حالت درصدی الزامی است', 'TAX_RATE_MISSING', 'taxRateBp');
    }
    assertValidRate(input.taxRateBp);
    return roundDiv(net * BigInt(input.taxRateBp), RATE_SCALE, policy.mode) as Money;
  }

  if (input.taxRateBp !== null) {
    throw new FinancialError(
      'در حالت ورود مستقیم مبلغ، نرخ مالیات باید خالی باشد',
      'TAX_RATE_NOT_ALLOWED',
      'taxRateBp',
    );
  }
  if (input.taxAmount === null) {
    throw new FinancialError('مبلغ مالیات الزامی است', 'TAX_AMOUNT_MISSING', 'taxAmount');
  }
  if (input.taxAmount < 0n) {
    throw new FinancialError('مبلغ مالیات نمی‌تواند منفی باشد', 'TAX_AMOUNT_NEGATIVE', 'taxAmount');
  }
  return input.taxAmount;
}

export function assertValidRate(rateBp: number): void {
  if (!Number.isInteger(rateBp)) {
    throw new FinancialError('نرخ مالیات باید عدد صحیح (basis point) باشد', 'TAX_RATE_NOT_INTEGER', 'taxRateBp');
  }
  if (rateBp < 0 || rateBp > MAX_RATE_BP) {
    throw new FinancialError('نرخ مالیات باید بین ۰ تا ۱۰۰ درصد باشد', 'TAX_RATE_OUT_OF_RANGE', 'taxRateBp');
  }
}

/**
 * محاسبه یک فاکتور چندردیفی.
 *
 * در حالت `scope: 'LINE'` مالیات هر ردیف مستقل گرد می‌شود و جمع فاکتور مجموع ردیف‌هاست.
 * در حالت `scope: 'INVOICE'` مالیات یک‌بار روی جمع خالص حساب و سپس بین ردیف‌ها تخصیص
 * داده می‌شود، به‌گونه‌ای که **جمع سهم ردیف‌ها دقیقاً با مالیات فاکتور برابر** بماند.
 */
export function calculateInvoice(
  lines: readonly LineInput[],
  policy: RoundingPolicy,
  invoiceTax: { readonly mode: TaxMode; readonly rateBp: number | null; readonly amount: Money | null },
  options: CalculationOptions = {},
): { readonly lines: LineResult[]; readonly totals: InvoiceTotals } {
  if (policy.scope === 'LINE') {
    const results = lines.map((line) => calculateLine(line, policy, options));
    return { lines: results, totals: sumLines(results) };
  }

  // سطح فاکتور: ابتدا ردیف‌ها بدون مالیات، سپس مالیات روی جمع خالص.
  const bare = lines.map((line) =>
    calculateLine({ ...line, taxMode: 'AMOUNT', taxRateBp: null, taxAmount: 0n as Money }, policy, options),
  );

  const net = bare.reduce((sum, line) => sum + line.net, 0n) as Money;

  let totalTax: Money;
  if (invoiceTax.mode === 'PERCENT') {
    if (invoiceTax.rateBp === null) {
      throw new FinancialError('نرخ مالیات فاکتور الزامی است', 'TAX_RATE_MISSING', 'taxRateBp');
    }
    assertValidRate(invoiceTax.rateBp);
    totalTax = roundDiv(net * BigInt(invoiceTax.rateBp), RATE_SCALE, policy.mode) as Money;
  } else {
    if (invoiceTax.amount === null) {
      throw new FinancialError('مبلغ مالیات فاکتور الزامی است', 'TAX_AMOUNT_MISSING', 'taxAmount');
    }
    if (invoiceTax.amount < 0n) {
      throw new FinancialError('مبلغ مالیات نمی‌تواند منفی باشد', 'TAX_AMOUNT_NEGATIVE', 'taxAmount');
    }
    totalTax = invoiceTax.amount;
  }

  const shares = allocateProportionally(totalTax, bare.map((line) => line.net), policy.mode);

  const results: LineResult[] = bare.map((line, index) => {
    const tax = (shares[index] ?? 0n) as Money;
    return { ...line, tax, total: (line.net + tax) as Money };
  });

  return { lines: results, totals: sumLines(results) };
}

/** جمع ردیف‌های از پیش محاسبه‌شده. */
export function sumLines(lines: readonly LineResult[]): InvoiceTotals {
  let gross = 0n;
  let discount = 0n;
  let net = 0n;
  let tax = 0n;
  let total = 0n;

  for (const line of lines) {
    gross += line.gross;
    discount += line.discount;
    net += line.net;
    tax += line.tax;
    total += line.total;
  }

  return {
    gross: gross as Money,
    discount: discount as Money,
    net: net as Money,
    tax: tax as Money,
    total: total as Money,
  };
}

/** جمع یک سند از جمع فاکتورهایش. */
export function sumInvoiceTotals(invoices: readonly InvoiceTotals[]): InvoiceTotals {
  return sumLines(
    invoices.map((invoice) => ({
      gross: invoice.gross,
      discount: invoice.discount,
      net: invoice.net,
      tax: invoice.tax,
      total: invoice.total,
    })),
  );
}

/**
 * محاسبه فاکتور تک‌مبلغی (انشعابات) — همان قواعد فاکتور عادی با یک ردیف.
 * عمداً از همان مسیر محاسبه عبور می‌کند تا رفتار مالیات درصدی/دستی یکسان بماند.
 */
export function calculateSingleAmountInvoice(
  input: {
    readonly baseAmount: Money;
    readonly discount: Money;
    readonly taxMode: TaxMode;
    readonly taxRateBp: number | null;
    readonly taxAmount: Money | null;
  },
  policy: RoundingPolicy,
  options: CalculationOptions = {},
): LineResult {
  return calculateLine(
    {
      quantity: QTY_SCALE as Qty,
      unitPrice: input.baseAmount,
      discount: input.discount,
      taxMode: input.taxMode,
      taxRateBp: input.taxRateBp,
      taxAmount: input.taxAmount,
    },
    policy,
    options,
  );
}

/** جمع ساده ردیف‌های سوخت‌گیری. تخفیف و مالیات فعلاً صفر است (تصمیم Q10). */
export function calculateFuelInvoice(entries: readonly Money[]): InvoiceTotals {
  let gross = 0n;
  for (const amount of entries) {
    if (amount < 0n) {
      throw new FinancialError('مبلغ سوخت‌گیری نمی‌تواند منفی باشد', 'FUEL_AMOUNT_NEGATIVE');
    }
    gross += amount;
  }
  return {
    gross: gross as Money,
    discount: 0n as Money,
    net: gross as Money,
    tax: 0n as Money,
    total: gross as Money,
  };
}
