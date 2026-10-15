/**
 * تجمیع فروشنده برای گزارش مالیات (docs/08-financial-rules.md §۸).
 *
 * دامنه: **یک سند** (تصمیم Q13). دو قاعده زیر صریحاً در پرامپت آمده‌اند و هر کدام
 * تست مستقل دارند:
 *  - شماره صورتحساب: فروشنده با یک فاکتور ⇒ شماره؛ با بیش از یک فاکتور ⇒ **خالی**.
 *  - تاریخ صورتحساب: تاریخ **اولین** فاکتور پس از مرتب‌سازی صعودی، با ترتیب ثانویه پایدار.
 */

import type { Money } from '../money/money.js';

/** یک فاکتور، در حدی که گزارش مالیات به آن نیاز دارد. */
export interface AggregatableInvoice {
  readonly id: string;
  readonly vendorId: string | null;
  /** تاریخ صورتحساب به‌صورت YYYY-MM-DD میلادی (تاریخ تقویمی، بدون ساعت). */
  readonly invoiceDate: string;
  readonly invoiceNumber: string | null;
  readonly gross: Money;
  readonly discount: Money;
  readonly tax: Money;
}

export interface VendorAggregateRow {
  readonly vendorId: string;
  /** فاکتورهای تشکیل‌دهنده این ردیف، به ترتیب قطعی. */
  readonly invoiceIds: readonly string[];
  readonly invoiceCount: number;
  /** فقط وقتی فروشنده دقیقاً یک فاکتور دارد. */
  readonly invoiceNumber: string | null;
  /** تاریخ اولین فاکتور. */
  readonly invoiceDate: string;
  /** مبلغ کالا: جمع مبالغ **قبل از تخفیف**. */
  readonly goodsAmount: Money;
  readonly discount: Money;
  readonly net: Money;
  readonly tax: Money;
  readonly total: Money;
}

export interface VendorAggregateResult {
  readonly rows: readonly VendorAggregateRow[];
  /** فاکتورهای بدون فروشنده که در گزارش نیامده‌اند (برای هشدار شمارش‌شده در UI). */
  readonly skippedInvoiceIds: readonly string[];
}

/**
 * ترتیب قطعی فاکتورها: تاریخ صعودی، و در تاریخ‌های برابر، شناسه صعودی.
 * بدون ترتیب ثانویه، «اولین فاکتور» در تاریخ‌های برابر غیرقطعی می‌شد.
 */
export function compareInvoicesForReport(a: AggregatableInvoice, b: AggregatableInvoice): number {
  if (a.invoiceDate !== b.invoiceDate) {
    return a.invoiceDate < b.invoiceDate ? -1 : 1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function aggregateByVendor(
  invoices: readonly AggregatableInvoice[],
): VendorAggregateResult {
  const skipped: string[] = [];
  const groups = new Map<string, AggregatableInvoice[]>();

  for (const invoice of invoices) {
    if (invoice.vendorId === null) {
      skipped.push(invoice.id);
      continue;
    }
    const existing = groups.get(invoice.vendorId);
    if (existing) {
      existing.push(invoice);
    } else {
      groups.set(invoice.vendorId, [invoice]);
    }
  }

  const rows: VendorAggregateRow[] = [];

  for (const [vendorId, group] of groups) {
    const ordered = [...group].sort(compareInvoicesForReport);

    let goodsAmount = 0n;
    let discount = 0n;
    let tax = 0n;
    for (const invoice of ordered) {
      goodsAmount += invoice.gross;
      discount += invoice.discount;
      tax += invoice.tax;
    }

    const net = goodsAmount - discount;
    const first = ordered[0] as AggregatableInvoice;

    rows.push({
      vendorId,
      invoiceIds: ordered.map((invoice) => invoice.id),
      invoiceCount: ordered.length,
      // قاعده §۲۲.۴ — بیش از یک فاکتور ⇒ ستون خالی می‌ماند.
      invoiceNumber: ordered.length === 1 ? first.invoiceNumber : null,
      // قاعده §۲۲.۵ — تاریخ اولین فاکتور، نه تاریخ ایجاد سند یا بایگانی.
      invoiceDate: first.invoiceDate,
      goodsAmount: goodsAmount as Money,
      discount: discount as Money,
      net: net as Money,
      tax: tax as Money,
      total: (net + tax) as Money,
    });
  }

  // ترتیب ردیف‌های گزارش: بر اساس تاریخ اولین فاکتور، سپس شناسه فروشنده.
  rows.sort((a, b) => {
    if (a.invoiceDate !== b.invoiceDate) return a.invoiceDate < b.invoiceDate ? -1 : 1;
    return a.vendorId < b.vendorId ? -1 : 1;
  });

  return { rows, skippedInvoiceIds: skipped };
}

/** جمع ستون‌های گزارش. */
export function sumVendorAggregates(rows: readonly VendorAggregateRow[]): {
  readonly goodsAmount: Money;
  readonly discount: Money;
  readonly net: Money;
  readonly tax: Money;
  readonly total: Money;
} {
  let goodsAmount = 0n;
  let discount = 0n;
  let net = 0n;
  let tax = 0n;
  let total = 0n;

  for (const row of rows) {
    goodsAmount += row.goodsAmount;
    discount += row.discount;
    net += row.net;
    tax += row.tax;
    total += row.total;
  }

  return {
    goodsAmount: goodsAmount as Money,
    discount: discount as Money,
    net: net as Money,
    tax: tax as Money,
    total: total as Money,
  };
}
