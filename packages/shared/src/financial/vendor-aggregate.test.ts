import { describe, expect, it } from 'vitest';

import {
  aggregateByVendor,
  sumVendorAggregates,
  type AggregatableInvoice,
} from './vendor-aggregate';
import type { Money } from '../money/money';

function invoice(partial: Partial<AggregatableInvoice> & { id: string }): AggregatableInvoice {
  return {
    vendorId: 'vendor-a',
    invoiceDate: '2026-10-04',
    invoiceNumber: null,
    gross: 0n as Money,
    discount: 0n as Money,
    tax: 0n as Money,
    ...partial,
  };
}

describe('۱۷ — فروشنده با یک فاکتور', () => {
  it('شماره صورتحساب نمایش داده می‌شود', () => {
    const { rows } = aggregateByVendor([
      invoice({ id: 'i1', invoiceNumber: '4499', gross: 140_000_000n as Money }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.invoiceCount).toBe(1);
    expect(rows[0]?.invoiceNumber).toBe('4499');
  });
});

describe('۱۸ — فروشنده با چند فاکتور (قاعده §۲۲.۴ و §۲۲.۵)', () => {
  const invoices = [
    invoice({ id: 'i2', invoiceDate: '2026-10-05', invoiceNumber: '200', gross: 200n as Money }),
    invoice({ id: 'i1', invoiceDate: '2026-10-03', invoiceNumber: '100', gross: 100n as Money }),
    invoice({ id: 'i3', invoiceDate: '2026-10-07', invoiceNumber: '300', gross: 300n as Money }),
  ];

  it('ستون شماره صورتحساب خالی می‌ماند', () => {
    const { rows } = aggregateByVendor(invoices);
    expect(rows[0]?.invoiceCount).toBe(3);
    expect(rows[0]?.invoiceNumber).toBeNull();
  });

  it('تاریخ، تاریخ اولین فاکتور پس از مرتب‌سازی صعودی است', () => {
    const { rows } = aggregateByVendor(invoices);
    expect(rows[0]?.invoiceDate).toBe('2026-10-03');
  });

  it('تاریخ از ترتیب ورودی مستقل است', () => {
    const shuffled = [invoices[2], invoices[0], invoices[1]] as AggregatableInvoice[];
    const { rows } = aggregateByVendor(shuffled);
    expect(rows[0]?.invoiceDate).toBe('2026-10-03');
  });
});

describe('۱۹ — تاریخ‌های برابر، ترتیب قطعی', () => {
  it('در تاریخ برابر، ترتیب ثانویه شناسه پایدار است', () => {
    const a = aggregateByVendor([
      invoice({ id: 'b', invoiceDate: '2026-10-04' }),
      invoice({ id: 'a', invoiceDate: '2026-10-04' }),
    ]);
    const b = aggregateByVendor([
      invoice({ id: 'a', invoiceDate: '2026-10-04' }),
      invoice({ id: 'b', invoiceDate: '2026-10-04' }),
    ]);

    expect(a.rows[0]?.invoiceIds).toEqual(['a', 'b']);
    expect(a.rows[0]?.invoiceIds).toEqual(b.rows[0]?.invoiceIds);
  });
});

describe('تجمیع مبالغ', () => {
  it('مبلغ کالا جمع مبالغ قبل از تخفیف است', () => {
    const { rows } = aggregateByVendor([
      invoice({ id: 'i1', gross: 1_000n as Money, discount: 100n as Money, tax: 90n as Money }),
      invoice({ id: 'i2', gross: 2_000n as Money, discount: 200n as Money, tax: 180n as Money }),
    ]);

    const row = rows[0];
    expect(row?.goodsAmount).toBe(3_000n);
    expect(row?.discount).toBe(300n);
    expect(row?.net).toBe(2_700n);
    expect(row?.tax).toBe(270n);
    expect(row?.total).toBe(2_970n);
  });

  it('اتحاد هر ردیف برقرار است', () => {
    const { rows } = aggregateByVendor([
      invoice({ id: 'i1', gross: 777n as Money, discount: 77n as Money, tax: 70n as Money }),
    ]);
    const row = rows[0];
    expect(row?.net).toBe((row?.goodsAmount ?? 0n) - (row?.discount ?? 0n));
    expect(row?.total).toBe((row?.net ?? 0n) + (row?.tax ?? 0n));
  });
});

describe('۲۱ — چند فروشنده، بدون دوباره‌شماری', () => {
  const invoices = [
    invoice({ id: 'i1', vendorId: 'barq', gross: 2_950_481_510n as Money }),
    invoice({ id: 'i2', vendorId: 'arman', gross: 140_000_000n as Money, invoiceNumber: '4499' }),
    invoice({ id: 'i3', vendorId: 'barq', gross: 10_000n as Money }),
  ];

  it('هر فروشنده یک ردیف می‌گیرد', () => {
    const { rows } = aggregateByVendor(invoices);
    expect(rows).toHaveLength(2);
  });

  it('جمع گزارش دقیقاً برابر جمع فاکتورهاست', () => {
    const { rows } = aggregateByVendor(invoices);
    const totals = sumVendorAggregates(rows);
    const expected = invoices.reduce((sum, item) => sum + item.gross, 0n);
    expect(totals.goodsAmount).toBe(expected);
  });

  it('فروشنده دو فاکتوری شماره ندارد و تک‌فاکتوری دارد', () => {
    const { rows } = aggregateByVendor(invoices);
    const barq = rows.find((row) => row.vendorId === 'barq');
    const arman = rows.find((row) => row.vendorId === 'arman');
    expect(barq?.invoiceNumber).toBeNull();
    expect(arman?.invoiceNumber).toBe('4499');
  });
});

describe('فاکتور بدون فروشنده (تصمیم Q1)', () => {
  it('کنار گذاشته و شمارش می‌شود', () => {
    const { rows, skippedInvoiceIds } = aggregateByVendor([
      invoice({ id: 'i1', vendorId: null }),
      invoice({ id: 'i2', vendorId: 'barq', gross: 500n as Money }),
    ]);

    expect(rows).toHaveLength(1);
    expect(skippedInvoiceIds).toEqual(['i1']);
  });
});

describe('ورودی خالی', () => {
  it('گزارش خالی می‌دهد', () => {
    const result = aggregateByVendor([]);
    expect(result.rows).toEqual([]);
    expect(sumVendorAggregates(result.rows).total).toBe(0n);
  });
});
