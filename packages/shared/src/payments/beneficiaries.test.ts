import { describe, expect, it } from 'vitest';

import type { Money } from '../money/money';
import {
  PETTY_CASH_CARD_LABEL,
  groupBeneficiaries,
  type BeneficiaryInvoiceInput,
} from './beneficiaries';

/**
 * تجمیع مقصدهای پرداخت.
 *
 * ادعای مرکزی: واحدِ ردیف **مقصد** است، نه فاکتور و نه فروشنده. هر آزمون یک حالت
 * واقعی از همان فرم کاغذی است.
 */

const base = {
  invoiceNumber: null,
  invoiceDate: '2026-10-01',
  vendorName: 'فروشنده',
  methodKind: 'BENEFICIARY_ACCOUNT',
  ibanSnapshot: null,
  bankTitleSnapshot: null,
  accountTitleSnapshot: null,
  paymentIdentifier: null,
  billIdentifier: null,
  pettyCashHolderNameSnapshot: null,
  pettyCashAccountHolderSnapshot: null,
  pettyCashBankTitleSnapshot: null,
  pettyCashIbanSnapshot: null,
  beneficiaryAmount: null,
  pettyCashAmount: null,
} satisfies Omit<BeneficiaryInvoiceInput, 'invoiceId' | 'totalAmount'>;

const invoice = (over: Partial<BeneficiaryInvoiceInput>): BeneficiaryInvoiceInput => ({
  ...base,
  invoiceId: 'inv',
  totalAmount: 1_000_000n as Money,
  ...over,
});

describe('تجمیع مقصدهای پرداخت', () => {
  it('دو فاکتور به یک شبا، یک ردیف می‌شوند', () => {
    const { rows } = groupBeneficiaries([
      invoice({ invoiceId: 'a', ibanSnapshot: 'IR01', totalAmount: 1_000n as Money }),
      invoice({ invoiceId: 'b', ibanSnapshot: 'IR01', totalAmount: 2_000n as Money }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(3_000n);
    expect(rows[0]?.shares.map((share) => share.invoiceId)).toEqual(['a', 'b']);
  });

  it('یک فروشنده با دو شبا، دو ردیف می‌شود', () => {
    // کلید، حساب است و نه فروشنده — فرم دربارهٔ «پول کجا می‌رود» است.
    const { rows } = groupBeneficiaries([
      invoice({ invoiceId: 'a', ibanSnapshot: 'IR01' }),
      invoice({ invoiceId: 'b', ibanSnapshot: 'IR02' }),
    ]);

    expect(rows).toHaveLength(2);
  });

  it('پرداخت ترکیبی در دو ردیف دیده می‌شود، با سهم خودش', () => {
    const { rows } = groupBeneficiaries([
      invoice({
        invoiceId: 'a',
        methodKind: 'SPLIT',
        totalAmount: 1_000n as Money,
        ibanSnapshot: 'IR01',
        pettyCashIbanSnapshot: 'IR99',
        pettyCashHolderNameSnapshot: 'کارپرداز',
        beneficiaryAmount: 700n as Money,
        pettyCashAmount: 300n as Money,
      }),
    ]);

    expect(rows.map((row) => row.total)).toEqual([700n, 300n]);
    // و هر دو سهم «بخشی» علامت می‌خورند تا جزئیات بتواند بگوید چرا با مبلغ
    // فاکتور فرق دارند.
    expect(rows.every((row) => row.shares.every((share) => share.isPartial))).toBe(true);
  });

  it('جمع همهٔ ردیف‌ها، همان جمع فاکتورهاست', () => {
    // این ادعای حسابداری فرم است: هیچ ریالی نه گم می‌شود و نه دوبار شمرده.
    const { rows } = groupBeneficiaries([
      invoice({ invoiceId: 'a', ibanSnapshot: 'IR01', totalAmount: 5_000n as Money }),
      invoice({
        invoiceId: 'b',
        methodKind: 'SPLIT',
        totalAmount: 4_000n as Money,
        ibanSnapshot: 'IR02',
        pettyCashIbanSnapshot: 'IR99',
        beneficiaryAmount: 2_500n as Money,
        pettyCashAmount: 1_500n as Money,
      }),
      invoice({
        invoiceId: 'c',
        methodKind: 'BILL',
        billIdentifier: '123',
        totalAmount: 1_000n as Money,
      }),
    ]);

    const sum = rows.reduce((total, row) => total + row.total, 0n);
    expect(sum).toBe(10_000n);
  });

  it('قبض با شناسهٔ پرداخت، سلول دوخطی می‌سازد', () => {
    const { rows } = groupBeneficiaries([
      invoice({
        invoiceId: 'a',
        methodKind: 'BILL',
        billIdentifier: '5001510724423',
        paymentIdentifier: '171657610146',
        vendorName: 'مدرسه فرشته کوچک',
      }),
    ]);

    expect(rows[0]?.identifier).toBe('5001510724423');
    expect(rows[0]?.secondaryIdentifier).toBe('171657610146');
    expect(rows[0]?.accountHolder).toBe('مدرسه فرشته کوچک');
    expect(rows[0]?.bankTitle).toBe('قبض');
  });

  it('تنخواه‌دار بدون شبا، با عنوان کارتش می‌آید', () => {
    // خانهٔ خالی روی فرم، به امضاکننده چیزی نمی‌گوید.
    const { rows } = groupBeneficiaries([
      invoice({
        invoiceId: 'a',
        methodKind: 'PETTY_CASH',
        pettyCashHolderNameSnapshot: 'محمدصادق محمدی',
        pettyCashBankTitleSnapshot: 'ملی',
      }),
    ]);

    expect(rows[0]?.identifier).toBe(PETTY_CASH_CARD_LABEL);
    expect(rows[0]?.accountHolder).toBe('محمدصادق محمدی');
  });

  it('عنوان حسابِ خالی یعنی حساب به نام خود فروشنده', () => {
    const { rows } = groupBeneficiaries([
      invoice({ invoiceId: 'a', ibanSnapshot: 'IR01', vendorName: 'زینب معارف وند' }),
    ]);

    expect(rows[0]?.accountHolder).toBe('زینب معارف وند');
  });

  it('فاکتور بدون روش پرداخت کنار گذاشته و شمرده می‌شود', () => {
    const { rows, skippedInvoiceIds } = groupBeneficiaries([
      invoice({ invoiceId: 'a', methodKind: null }),
      invoice({ invoiceId: 'b', ibanSnapshot: 'IR01' }),
    ]);

    expect(rows).toHaveLength(1);
    expect(skippedInvoiceIds).toEqual(['a']);
  });

  it('سهم صفر ردیف نمی‌سازد', () => {
    // مقصدی که چیزی نمی‌گیرد، مقصد نیست — ردیفِ صفر فقط فرم را شلوغ می‌کند.
    const { rows } = groupBeneficiaries([
      invoice({ invoiceId: 'a', ibanSnapshot: 'IR01', totalAmount: 0n as Money }),
    ]);

    expect(rows).toHaveLength(0);
  });

  it('ترتیب ردیف‌ها، ترتیب اولین دیده شدن است', () => {
    // دو بار گرفتن یک گزارش نباید دو فرم با ترتیب متفاوت بدهد.
    const { rows } = groupBeneficiaries([
      invoice({ invoiceId: 'a', ibanSnapshot: 'IR02' }),
      invoice({ invoiceId: 'b', ibanSnapshot: 'IR01' }),
      invoice({ invoiceId: 'c', ibanSnapshot: 'IR02' }),
    ]);

    expect(rows.map((row) => row.identifier)).toEqual(['IR02', 'IR01']);
  });
});
