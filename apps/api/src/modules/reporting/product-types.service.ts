import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';

/**
 * «نوع کالا» در گزارش مالیات.
 *
 * کلید `(document_id, vendor_id)` است، نه فروشنده به‌تنهایی: یک فروشنده در سند مهرماه
 * «انشعاب برق» فروخته و در سند آبان «چاه ارت» (docs/03-erd.md §۵).
 *
 * ─────── مقدار از کجا می‌آید ───────
 *
 * سه منبع، به همین ترتیب:
 *
 *  ۱. آنچه کاربر برای همین سند و همین فروشنده **ثبت کرده** — یکی از انواع تعریف‌شده
 *     یا متنی که خودش نوشته.
 *  ۲. اگر ثبت نکرده: **شرح اولین فاکتور** همان فروشنده در همین سند. کاربر شرح را
 *     موقع ثبت فاکتور نوشته؛ دوباره پرسیدنش کار اضافه است.
 *  ۳. وگرنه خالی.
 *
 * پس ستون «نوع کالا» بدون هیچ کاری هم معمولاً درست است، و تغییرش یک کلیک فاصله
 * دارد — نه یک کار اجباری روی تک‌تک ردیف‌ها.
 *
 * در کنارش یک حافظه کوچک نگه داشته می‌شود: هر انتخاب **از فهرست**، شمارنده
 * `vendor_product_type_suggestions` همان فروشنده را بالا می‌برد تا دفعه بعد پیشنهاد
 * اول، همان چیزی باشد که کاربر معمولاً انتخاب می‌کند. این حافظه به سند بسته نیست و با
 * حذف سند از بین نمی‌رود.
 */
@Injectable()
export class ProductTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: DocumentAccessService,
  ) {}

  /**
   * پیشنهادها برای یک فروشنده: اول آنچه خودش قبلاً داشته، بعد بقیه انواع فعال.
   *
   * همراهش خریدهای قبلی همان فروشنده می‌آید تا کاربر بتواند تصمیم بگیرد — همان
   * «نمایش خریدهای فروشنده» در §۲۲ پرامپت.
   */
  async suggestions(documentId: string, vendorId: string, user: AuthenticatedUser) {
    await this.access.assertDocumentVisible(documentId, user);

    const [suggestions, allTypes, current, recentPurchases, invoicesHere] = await Promise.all([
      this.prisma.vendorProductTypeSuggestion.findMany({
        where: { vendorId },
        orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }],
        take: 5,
        include: { productType: { select: { id: true, title: true, isActive: true } } },
      }),
      this.prisma.productType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true },
      }),
      this.prisma.documentVendorProductType.findUnique({
        where: { documentId_vendorId: { documentId, vendorId } },
        include: { productType: { select: { id: true, title: true } } },
      }),
      /*
        تاریخچهٔ نوشته‌های همین فروشنده — فقط در **اسناد قابل مشاهده همان کاربر**.

        فاکتوری که شرح ندارد در این فهرست نمی‌آید: ردیفی که عنوانش خالی است چیزی
        برای انتخاب کردن ندارد و فقط فهرست را شلوغ می‌کند.
      */
      this.prisma.invoice.findMany({
        where: {
          vendorId,
          description: { not: null },
          documentId: { not: documentId },
          document: this.access.scope(user),
        },
        orderBy: { invoiceDate: 'desc' },
        take: 10,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          description: true,
          totalAmount: true,
          chapterTitleSnapshot: true,
          document: { select: { id: true, title: true, fiscalYear: true } },
        },
      }),

      /*
        شرح فاکتورهای همین فروشنده در **همین سند**.

        یک فروشنده می‌تواند در یک سند چند فاکتور داشته باشد با شرح‌های متفاوت؛
        پیش‌فرض، شرح اولی است (به ترتیب قطعی گزارش) ولی کاربر باید بتواند بقیه را
        هم ببیند و یکی را انتخاب کند.
      */
      this.prisma.invoice.findMany({
        where: { documentId, vendorId, description: { not: null } },
        orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          description: true,
          invoiceDate: true,
          totalAmount: true,
          chapterTitleSnapshot: true,
          invoiceType: { select: { titleFa: true } },
        },
      }),
    ]);

    return {
      current: current
        ? {
            id: current.productType?.id ?? null,
            title: current.productType?.title ?? (current.customTitle as string),
          }
        : null,
      suggestions: suggestions
        .filter((item) => item.productType.isActive)
        .map((item) => ({
          id: item.productType.id,
          title: item.productType.title,
          useCount: item.useCount,
        })),
      allTypes,
      /** شرح فاکتورهای همین سند — اولی، پیش‌فرض است. */
      invoiceDescriptions: invoicesHere.map((invoice) => ({
        invoiceId: invoice.id,
        description: invoice.description as string,
        invoiceTypeTitle: invoice.invoiceType.titleFa,
        chapterTitle: invoice.chapterTitleSnapshot,
        invoiceDate: invoice.invoiceDate,
        totalAmount: invoice.totalAmount.toString(),
      })),
      recentPurchases: recentPurchases.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        description: invoice.description as string,
        totalAmount: invoice.totalAmount.toString(),
        chapterTitle: invoice.chapterTitleSnapshot,
        document: invoice.document,
      })),
    };
  }

  /**
   * جزئیات مبالغ یک ردیف گزارش.
   *
   * ردیف گزارش یک **تجمیع** است؛ بدون این صفحه، کاربر می‌بیند «۲۰٬۱۲۳٬۴۵۵» ولی
   * نمی‌داند از کجا آمده. اینجا همان فاکتورهایی که ردیف را ساخته‌اند، به ترتیب قطعی
   * گزارش، با مبالغشان فهرست می‌شوند.
   */
  async amountDetails(documentId: string, vendorId: string, user: AuthenticatedUser) {
    await this.access.assertDocumentVisible(documentId, user);

    const invoices = await this.prisma.invoice.findMany({
      where: { documentId, vendorId },
      // همان ترتیبی که تجمیع گزارش استفاده می‌کند: تاریخ صعودی، سپس شناسه.
      orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        invoiceKind: true,
        chapterTitleSnapshot: true,
        grossAmount: true,
        discountAmount: true,
        netAmount: true,
        taxAmount: true,
        totalAmount: true,
      },
    });

    if (invoices.length === 0) {
      throw AppError.notFound('این فروشنده در این سند فاکتوری ندارد');
    }

    const sum = invoices.reduce(
      (totals, invoice) => ({
        gross: totals.gross + invoice.grossAmount,
        discount: totals.discount + invoice.discountAmount,
        net: totals.net + invoice.netAmount,
        tax: totals.tax + invoice.taxAmount,
        total: totals.total + invoice.totalAmount,
      }),
      { gross: 0n, discount: 0n, net: 0n, tax: 0n, total: 0n },
    );

    return {
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        invoiceKind: invoice.invoiceKind,
        chapterTitle: invoice.chapterTitleSnapshot,
        grossAmount: invoice.grossAmount.toString(),
        discountAmount: invoice.discountAmount.toString(),
        netAmount: invoice.netAmount.toString(),
        taxAmount: invoice.taxAmount.toString(),
        totalAmount: invoice.totalAmount.toString(),
      })),
      totals: {
        gross: sum.gross.toString(),
        discount: sum.discount.toString(),
        net: sum.net.toString(),
        tax: sum.tax.toString(),
        total: sum.total.toString(),
      },
    };
  }

  /**
   * ثبت یا تغییر نوع کالای یک فروشنده در یک سند.
   *
   * یا یکی از انواع تعریف‌شده، یا متنی که کاربر نوشته — دقیقاً یکی از این دو،
   * همان قیدی که دیتابیس هم نگه می‌دارد.
   */
  async set(
    documentId: string,
    vendorId: string,
    input: { productTypeId: string | null; customTitle: string | null },
    user: AuthenticatedUser,
  ) {
    await this.access.assertDocumentVisible(documentId, user);

    // فروشنده باید واقعاً در همین سند فاکتور داشته باشد؛ وگرنه کاربر می‌توانست با
    // فرستادن شناسه دلخواه، وجود فروشنده‌ای را استنباط کند یا ردیف بی‌ربط بسازد.
    const hasInvoice = await this.prisma.invoice.findFirst({
      where: { documentId, vendorId },
      select: { id: true },
    });
    if (!hasInvoice) {
      throw AppError.notFound('این فروشنده در این سند فاکتوری ندارد');
    }

    let title: string;

    if (input.productTypeId) {
      const productType = await this.prisma.productType.findFirst({
        where: { id: input.productTypeId, isActive: true },
        select: { id: true, title: true },
      });
      if (!productType) {
        throw AppError.validation('نوع کالا یافت نشد یا غیرفعال است', [
          { path: 'productTypeId', message: 'نوع کالای معتبر انتخاب کنید' },
        ]);
      }
      title = productType.title;
    } else {
      title = input.customTitle as string;
    }

    const previous = await this.prisma.documentVendorProductType.findUnique({
      where: { documentId_vendorId: { documentId, vendorId } },
      select: { productTypeId: true, customTitle: true },
    });

    const data = {
      productTypeId: input.productTypeId,
      customTitle: input.productTypeId ? null : input.customTitle,
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.documentVendorProductType.upsert({
        where: { documentId_vendorId: { documentId, vendorId } },
        create: { documentId, vendorId, ...data, setById: user.id },
        update: { ...data, setById: user.id, setAt: new Date() },
      });

      /*
        حافظه پیشنهاد فقط برای انتخاب **از فهرست** است.

        متن آزاد شمارنده‌ای ندارد — و نباید داشته باشد: فهرست پیشنهادها قرار است
        انواع تعریف‌شده را بالا بیاورد، نه هر عبارتی که یک بار نوشته شده. تاریخچهٔ
        متن‌ها جای دیگری است: شرح خودِ فاکتورها.
      */
      if (input.productTypeId && previous?.productTypeId !== input.productTypeId) {
        await tx.vendorProductTypeSuggestion.upsert({
          where: { vendorId_productTypeId: { vendorId, productTypeId: input.productTypeId } },
          create: { vendorId, productTypeId: input.productTypeId, useCount: 1 },
          update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
        });
      }

      await this.audit.record(
        {
          actorId: user.id,
          action: 'PRODUCT_TYPE_SET',
          entityType: 'documentVendorProductType',
          // کلید این رکورد ترکیبی است ولی ستون `entity_id` یک UUID است؛ سند را
          // می‌نویسیم و فروشنده را در داده تغییر، تا هم جست‌وجو کار کند و هم ستون
          // نوعش را نگه دارد.
          entityId: documentId,
          documentId,
          before: previous ? { vendorId, ...previous } : null,
          after: { vendorId, ...data, title },
        },
        tx,
      );

      return { id: input.productTypeId, title };
    });
  }
}
