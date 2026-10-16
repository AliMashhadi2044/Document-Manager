import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import { buildDocumentSnapshot, DOCUMENT_SNAPSHOT_SCHEMA_VERSION } from './document-snapshot';

/**
 * snapshot سند باید **همه** فیلدهای لازم برای بازسازی وضعیت را نگه دارد (ADR-0009).
 *
 * مهم‌ترین نکته: مبالغ `bigint` باید به **رشته** تبدیل شوند. اگر به `number` می‌رفتند،
 * مبلغ بزرگ‌تر از ۲^۵۳ در نسخه تاریخی خاموشانه خراب می‌شد (ریسک R2).
 */

const HUGE = 9_007_199_254_740_993n; // ۲^۵۳ + ۱

function fakeTx(document: unknown) {
  return {
    financialDocument: {
      findUniqueOrThrow: () => Promise.resolve(document),
    },
  } as never;
}

function buildDocument() {
  return {
    id: 'doc-1',
    title: 'سند آزمون',
    type: 'NORMAL',
    status: 'FINALIZED',
    fiscalYear: 1405,
    jalaliYear: 1405,
    buyerEntityId: 'buyer-1',
    documentNumber: null,
    documentDate: null,
    roundingPolicy: { scope: 'LINE', mode: 'HALF_UP' },
    totalGross: HUGE,
    totalDiscount: 3n,
    totalNet: HUGE - 3n,
    totalTax: 625_000n,
    totalAmount: HUGE - 3n + 625_000n,
    createdById: 'user-1',
    createdAt: new Date('2026-10-16T00:00:00.000Z'),
    finalizedAt: new Date('2026-10-16T01:00:00.000Z'),
    stadMetadata: null,
    buyerSnapshot: { id: 'bs-1', name: 'خریدار', personType: 'LEGAL' },
    invoices: [
      {
        id: 'inv-1',
        invoiceTypeId: 'it-1',
        invoiceKind: 'NORMAL',
        chapterId: 'ch-1',
        chapterCodeSnapshot: '2213000',
        chapterTitleSnapshot: 'مواد مصرفی',
        vendorId: 'v-1',
        invoiceNumber: '4499',
        invoiceDate: new Date('2026-10-05T00:00:00.000Z'),
        taxMode: 'PERCENT',
        taxRateBp: 1000,
        grossAmount: HUGE,
        discountAmount: 3n,
        netAmount: HUGE - 3n,
        taxAmount: 625_000n,
        totalAmount: HUGE - 3n + 625_000n,
        customFields: null,
        notes: null,
        vendorSnapshot: { id: 'vs-1', name: 'فروشنده', personType: 'LEGAL' },
        buyerSnapshot: { id: 'bs-1', name: 'خریدار', personType: 'LEGAL' },
        payment: { invoiceId: 'inv-1', methodKind: 'BENEFICIARY_ACCOUNT', ibanSnapshot: 'IR02' },
        items: [
          {
            id: 'item-1',
            rowNo: 1,
            description: 'کاغذ',
            quantity: new Prisma.Decimal('2.5'),
            unitPrice: 1_000_001n,
            grossAmount: 2_500_003n,
            discountAmount: 3n,
            netAmount: 2_500_000n,
            taxAmount: 250_000n,
            totalAmount: 2_750_000n,
          },
        ],
      },
    ],
  };
}

describe('snapshot سند', () => {
  it('نسخه schema را ثبت می‌کند تا خواننده آینده بتواند تفسیرش کند', async () => {
    const snapshot = await buildDocumentSnapshot(fakeTx(buildDocument()), 'doc-1');
    expect(snapshot.schemaVersion).toBe(DOCUMENT_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('مبالغ بزرگ را به رشته تبدیل می‌کند و دقت را حفظ می‌کند', async () => {
    const snapshot = await buildDocumentSnapshot(fakeTx(buildDocument()), 'doc-1');

    expect(snapshot.document['totalGross']).toBe('9007199254740993');
    expect(typeof snapshot.document['totalGross']).toBe('string');

    const invoice = snapshot.invoices[0] as Record<string, unknown>;
    expect(invoice['grossAmount']).toBe('9007199254740993');
  });

  it('کل snapshot قابل تبدیل به JSON است', async () => {
    const snapshot = await buildDocumentSnapshot(fakeTx(buildDocument()), 'doc-1');
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it('مقدار اعشاری را با سه رقم نگه می‌دارد', async () => {
    const snapshot = await buildDocumentSnapshot(fakeTx(buildDocument()), 'doc-1');
    const invoice = snapshot.invoices[0] as Record<string, unknown>;
    const items = invoice['items'] as Array<Record<string, unknown>>;
    expect(items[0]?.['quantity']).toBe('2.500');
  });

  it('سیاست گرد کردن را هم نگه می‌دارد تا بازتولید خروجی دقیق بماند', async () => {
    const snapshot = await buildDocumentSnapshot(fakeTx(buildDocument()), 'doc-1');
    expect(snapshot.document['roundingPolicy']).toEqual({ scope: 'LINE', mode: 'HALF_UP' });
  });

  it('snapshotهای فروشنده و خریدار و پرداخت را شامل می‌شود', async () => {
    const snapshot = await buildDocumentSnapshot(fakeTx(buildDocument()), 'doc-1');
    const invoice = snapshot.invoices[0] as Record<string, unknown>;

    expect(invoice['vendorSnapshot']).toMatchObject({ name: 'فروشنده' });
    expect(invoice['buyerSnapshot']).toMatchObject({ name: 'خریدار' });
    expect(invoice['payment']).toMatchObject({ methodKind: 'BENEFICIARY_ACCOUNT' });
  });

  it('تاریخ‌ها به ISO تبدیل می‌شوند', async () => {
    const snapshot = await buildDocumentSnapshot(fakeTx(buildDocument()), 'doc-1');
    expect(snapshot.document['finalizedAt']).toBe('2026-10-16T01:00:00.000Z');
  });
});
