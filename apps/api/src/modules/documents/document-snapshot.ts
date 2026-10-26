import type { Prisma } from '@prisma/client';

/**
 * ساخت snapshot کامل یک سند برای `document_revisions` (ADR-0009).
 *
 * قاعده: **یک** تابع سریالایز وجود دارد. اگر فیلدی به مدل اضافه شود و اینجا نیاید،
 * تست رفت‌وبرگشت snapshot آن را می‌گیرد — نه اینکه بی‌صدا از نسخه تاریخی جا بماند.
 *
 * `schemaVersion` روی رکورد نسخه ذخیره می‌شود تا خواننده آینده بتواند نسخه‌های قدیمی
 * را درست تفسیر کند.
 */
export const DOCUMENT_SNAPSHOT_SCHEMA_VERSION = 1;

export interface DocumentSnapshotV1 {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly document: Record<string, unknown>;
  readonly stadMetadata: Record<string, unknown> | null;
  readonly buyerSnapshot: Record<string, unknown> | null;
  readonly invoices: ReadonlyArray<Record<string, unknown>>;
}

export async function buildDocumentSnapshot(
  tx: Prisma.TransactionClient,
  documentId: string,
): Promise<DocumentSnapshotV1> {
  const document = await tx.financialDocument.findUniqueOrThrow({
    where: { id: documentId },
    include: {
      stadMetadata: true,
      buyerSnapshot: true,
      invoices: {
        orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        include: {
          vendorSnapshot: true,
          buyerSnapshot: true,
          items: { orderBy: { rowNo: 'asc' } },
          payment: true,
        },
      },
    },
  });

  return {
    schemaVersion: DOCUMENT_SNAPSHOT_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    document: serialize({
      id: document.id,
      title: document.title,
      type: document.type,
      status: document.status,
      fiscalYear: document.fiscalYear,
      jalaliYear: document.jalaliYear,
      buyerEntityId: document.buyerEntityId,
      documentNumber: document.documentNumber,
      documentDate: document.documentDate,
      // سیاست گرد کردن هم در نسخه می‌آید تا بازتولید خروجی تاریخی دقیق بماند.
      roundingPolicy: document.roundingPolicy,
      totalGross: document.totalGross,
      totalDiscount: document.totalDiscount,
      totalNet: document.totalNet,
      totalTax: document.totalTax,
      totalAmount: document.totalAmount,
      createdById: document.createdById,
      createdAt: document.createdAt,
      finalizedAt: document.finalizedAt,
    }),
    stadMetadata: document.stadMetadata ? serialize(document.stadMetadata) : null,
    buyerSnapshot: serialize(document.buyerSnapshot),
    invoices: document.invoices.map((invoice) => ({
      ...serialize({
        id: invoice.id,
        invoiceTypeId: invoice.invoiceTypeId,
        invoiceKind: invoice.invoiceKind,
        chapterId: invoice.chapterId,
        chapterCodeSnapshot: invoice.chapterCodeSnapshot,
        chapterTitleSnapshot: invoice.chapterTitleSnapshot,
        vendorId: invoice.vendorId,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        taxMode: invoice.taxMode,
        taxRateBp: invoice.taxRateBp,
        grossAmount: invoice.grossAmount,
        discountAmount: invoice.discountAmount,
        netAmount: invoice.netAmount,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        customFields: invoice.customFields,
        notes: invoice.notes,
      }),
      vendorSnapshot: invoice.vendorSnapshot ? serialize(invoice.vendorSnapshot) : null,
      buyerSnapshot: serialize(invoice.buyerSnapshot),
      payment: invoice.payment ? serialize(invoice.payment) : null,
      items: invoice.items.map((item) => serialize(item)),
    })),
  };
}

/**
 * تبدیل مقادیری که JSON نمی‌پذیرد.
 * `bigint` به رشته می‌رود تا دقت مبالغ بزرگ در نسخه تاریخی هم حفظ شود (ریسک R2).
 */
function serialize(value: Record<string, unknown> | null): Record<string, unknown> {
  if (value === null) return {};

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'bigint') {
      result[key] = item.toString();
    } else if (item instanceof Date) {
      result[key] = item.toISOString();
    } else if (item !== null && typeof item === 'object' && 'toFixed' in item) {
      // Prisma.Decimal (مقدار/تعداد)
      result[key] = (item as { toFixed(places: number): string }).toFixed(3);
    } else {
      result[key] = item;
    }
  }
  return result;
}
