import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';

/**
 * ردیف‌های «گزارش مالی سامانه ستاد».
 *
 * گزارش یک ردیف به‌ازای هر سند ستادی دارد و سند ستادی دقیقاً یک فاکتور، پس ردیف
 * روی **فاکتور** می‌نشیند. چهار مقدار دارد که کاربر می‌تواند عوضشان کند — عنوان
 * کالا، تعداد، مبلغ نقدی و سایر توضیحات — و همه با پیش‌فرضی ساخته می‌شوند که از
 * خودِ فاکتور می‌آید.
 *
 * ─────── چرا مادی‌شده و نه فقط override ───────
 *
 * اگر فقط تفاوت‌ها ذخیره می‌شد، گزارش برای سندی که کسی دستش نزده خالی درمی‌آمد و
 * کاربر باید تک‌تک ردیف‌ها را باز می‌کرد تا پر شوند. ردیف با پیش‌فرض ساخته می‌شود و
 * `editedFields` می‌گوید کدام مقدار دستی شده: بقیه با هر تغییر فاکتور دوباره حساب
 * می‌شوند. بدون آن یکی از دو بد پیش می‌آمد — یا ویرایش کاربر با اولین ویرایش
 * فاکتور پاک می‌شد، یا عددی که فاکتورش عوض شده بود برای همیشه کهنه می‌ماند.
 */

/** چیزی که برای ساختن پیش‌فرض‌ها لازم است. */
interface InvoiceForLine {
  readonly id: string;
  readonly description: string | null;
  readonly netAmount: bigint;
  readonly totalAmount: bigint;
  readonly items: readonly { readonly quantity: Prisma.Decimal }[];
}

export const EDITABLE_FIELDS = ['itemTitle', 'quantity', 'cashAmount', 'notes'] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** «تعداد ۳ قلم کالا مجموعا ۲۸ عدد» — همان جمله‌ای که روی فرم کاغذی نوشته می‌شود. */
export function defaultNotes(items: readonly { readonly quantity: Prisma.Decimal }[]): string {
  if (items.length === 0) return '';

  const total = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  // مقدار با سه رقم اعشار ذخیره می‌شود ولی «عدد» شمردنی است؛ کسرِ باقی‌مانده گرد می‌شود.
  return `تعداد ${items.length} قلم کالا مجموعا ${Math.round(total)} عدد`;
}

/**
 * تعداد مبنای فرم.
 *
 * فاکتور تک‌قلمی تعداد همان قلم را می‌گیرد — همان عددی که روی فرم کاغذی دیده
 * می‌شود. فاکتور چندقلمی عددِ واحدی ندارد، پس ۱ می‌گیرد و شرحِ قلم‌ها به «سایر
 * توضیحات» می‌رود.
 */
export function defaultQuantity(
  items: readonly { readonly quantity: Prisma.Decimal }[],
): number {
  if (items.length !== 1) return 1;
  const quantity = Math.round(Number(items[0]?.quantity ?? 1));
  return quantity >= 1 ? quantity : 1;
}

/** مبلغ واحد = مبلغ کل بدون ارزش افزوده ÷ تعداد، با گرد کردن به ریال. */
export function unitAmountOf(netAmount: bigint, quantity: number): bigint {
  const safe = BigInt(quantity >= 1 ? quantity : 1);
  return netAmount / safe;
}

@Injectable()
export class StadReportLinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: DocumentAccessService,
  ) {}

  /**
   * ردیف گزارش را با فاکتور هماهنگ می‌کند.
   *
   * پس از ساخت یا ویرایش فاکتورِ یک سند ستادی صدا زده می‌شود، داخل همان تراکنش:
   * ردیفی که نیمه‌ساخته بماند یعنی گزارشی که یک سند را جا انداخته.
   */
  async sync(
    tx: Prisma.TransactionClient,
    documentType: string,
    invoice: InvoiceForLine,
  ): Promise<void> {
    // فقط سند ستادی ردیف دارد؛ سند عادی در این گزارش نیست.
    if (documentType !== 'STAD') {
      await tx.invoiceStadReportLine.deleteMany({ where: { invoiceId: invoice.id } });
      return;
    }

    const existing = await tx.invoiceStadReportLine.findUnique({
      where: { invoiceId: invoice.id },
      select: { editedFields: true, quantity: true, itemTitle: true, cashAmount: true, notes: true },
    });

    const edited = new Set(existing?.editedFields ?? []);
    const keep = <T>(field: EditableField, current: T | undefined, fresh: T): T =>
      edited.has(field) && current !== undefined ? current : fresh;

    const quantity = keep('quantity', existing?.quantity, defaultQuantity(invoice.items));

    const data = {
      itemTitle: keep('itemTitle', existing?.itemTitle, invoice.description ?? ''),
      quantity,
      // مبلغ واحد همیشه بازحساب می‌شود: مشتقِ تعداد و مبلغ است و ویرایش دستی ندارد.
      unitAmount: unitAmountOf(invoice.netAmount, quantity),
      cashAmount: keep('cashAmount', existing?.cashAmount, invoice.totalAmount),
      notes: keep('notes', existing?.notes, defaultNotes(invoice.items)),
    };

    await tx.invoiceStadReportLine.upsert({
      where: { invoiceId: invoice.id },
      create: { invoiceId: invoice.id, ...data, editedFields: [] },
      update: data,
    });
  }

  /** ردیف گزارش به‌علاوهٔ قلم‌های همان فاکتور — ورودی پنجرهٔ جزئیات. */
  async detail(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, document: { type: 'STAD' } },
      select: {
        id: true,
        documentId: true,
        description: true,
        netAmount: true,
        totalAmount: true,
        document: { select: { title: true, documentNumber: true } },
        items: {
          orderBy: { rowNo: 'asc' },
          select: {
            rowNo: true,
            description: true,
            productCode: true,
            quantity: true,
            unitPrice: true,
            netAmount: true,
            unit: { select: { title: true } },
          },
        },
        stadReport: true,
      },
    });

    if (!invoice) throw AppError.notFound('این ردیف گزارش وجود ندارد');
    await this.access.assertDocumentVisible(invoice.documentId, user);

    return {
      invoiceId: invoice.id,
      documentId: invoice.documentId,
      documentTitle: invoice.document.title,
      documentNumber: invoice.document.documentNumber,
      invoiceDescription: invoice.description,
      line: invoice.stadReport
        ? {
            itemTitle: invoice.stadReport.itemTitle,
            quantity: invoice.stadReport.quantity,
            unitAmount: invoice.stadReport.unitAmount.toString(),
            cashAmount: invoice.stadReport.cashAmount.toString(),
            notes: invoice.stadReport.notes,
            editedFields: invoice.stadReport.editedFields,
          }
        : null,
      /*
        پیش‌فرض‌ها هم می‌روند، نه فقط مقدار فعلی.

        کاربری که توضیح را دستی عوض کرده باید بتواند به جملهٔ شمارشِ قلم‌ها
        برگردد، بی‌آنکه خودش بشمارد.
      */
      defaults: {
        itemTitle: invoice.description ?? '',
        quantity: defaultQuantity(invoice.items),
        cashAmount: invoice.totalAmount.toString(),
        notes: defaultNotes(invoice.items),
      },
      items: invoice.items.map((item) => ({
        rowNo: item.rowNo,
        description: item.description,
        productCode: item.productCode,
        quantity: item.quantity.toString(),
        unitTitle: item.unit?.title ?? null,
        unitPrice: item.unitPrice.toString(),
        netAmount: item.netAmount.toString(),
      })),
    };
  }

  /**
   * ثبت مقدارهای دستی.
   *
   * هر فیلدی که در ورودی بیاید «دستی» علامت می‌خورد و از آن پس بازحساب نمی‌شود؛
   * `null` یعنی «به پیش‌فرض برگرد» و علامت را برمی‌دارد.
   */
  async save(
    invoiceId: string,
    input: Partial<Record<EditableField, string | number | null | undefined>>,
    user: AuthenticatedUser,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, document: { type: 'STAD' } },
      select: {
        id: true,
        documentId: true,
        description: true,
        netAmount: true,
        totalAmount: true,
        items: { select: { quantity: true } },
        stadReport: true,
      },
    });

    if (!invoice) throw AppError.notFound('این ردیف گزارش وجود ندارد');
    await this.access.assertDocumentVisible(invoice.documentId, user);

    const defaults = {
      itemTitle: invoice.description ?? '',
      quantity: defaultQuantity(invoice.items),
      cashAmount: invoice.totalAmount,
      notes: defaultNotes(invoice.items),
    };

    const edited = new Set<string>(invoice.stadReport?.editedFields ?? []);
    const current = {
      itemTitle: invoice.stadReport?.itemTitle ?? defaults.itemTitle,
      quantity: invoice.stadReport?.quantity ?? defaults.quantity,
      cashAmount: invoice.stadReport?.cashAmount ?? defaults.cashAmount,
      notes: invoice.stadReport?.notes ?? defaults.notes,
    };

    for (const field of EDITABLE_FIELDS) {
      const value = input[field];
      if (value === undefined) continue;

      if (value === null) {
        edited.delete(field);
        (current as Record<string, unknown>)[field] = defaults[field];
        continue;
      }

      edited.add(field);
      if (field === 'quantity') {
        const quantity = Math.trunc(Number(value));
        if (!Number.isFinite(quantity) || quantity < 1) {
          throw AppError.validation('تعداد باید عددی مثبت باشد');
        }
        current.quantity = quantity;
      } else if (field === 'cashAmount') {
        // مبلغ رشتهٔ عددی است، همان قرارداد مرز API (ADR-0003).
        if (!/^\d{1,18}$/u.test(String(value))) {
          throw AppError.validation('مبلغ نقدی باید عددی و بدون اعشار باشد');
        }
        current.cashAmount = BigInt(String(value));
      } else {
        current[field] = String(value);
      }
    }

    const data = {
      itemTitle: current.itemTitle.slice(0, 500),
      quantity: current.quantity,
      unitAmount: unitAmountOf(invoice.netAmount, current.quantity),
      cashAmount: current.cashAmount,
      notes: current.notes,
      editedFields: [...edited],
      updatedById: user.id,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceStadReportLine.upsert({
        where: { invoiceId },
        create: { invoiceId, ...data },
        update: data,
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'STAD_REPORT_LINE_UPDATE',
          entityType: 'invoice',
          entityId: invoiceId,
          documentId: invoice.documentId,
          after: { editedFields: data.editedFields },
        },
        tx,
      );
    });

    return this.detail(invoiceId, user);
  }
}
