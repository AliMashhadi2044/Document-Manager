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
 * در کنارش یک حافظه کوچک نگه داشته می‌شود: هر انتخاب، شمارنده
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

    const [suggestions, allTypes, current, recentPurchases] = await Promise.all([
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
      // خریدهای قبلی همین فروشنده — فقط در **اسناد قابل مشاهده همان کاربر**.
      this.prisma.invoice.findMany({
        where: { vendorId, document: this.access.scope(user) },
        orderBy: { invoiceDate: 'desc' },
        take: 10,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          totalAmount: true,
          chapterTitleSnapshot: true,
          document: { select: { id: true, title: true, fiscalYear: true } },
        },
      }),
    ]);

    return {
      current: current ? { id: current.productType.id, title: current.productType.title } : null,
      suggestions: suggestions
        .filter((item) => item.productType.isActive)
        .map((item) => ({
          id: item.productType.id,
          title: item.productType.title,
          useCount: item.useCount,
        })),
      allTypes,
      recentPurchases: recentPurchases.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
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

  /** ثبت یا تغییر نوع کالای یک فروشنده در یک سند. */
  async set(
    documentId: string,
    vendorId: string,
    productTypeId: string,
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

    const productType = await this.prisma.productType.findFirst({
      where: { id: productTypeId, isActive: true },
      select: { id: true, title: true },
    });
    if (!productType) {
      throw AppError.validation('نوع کالا یافت نشد یا غیرفعال است', [
        { path: 'productTypeId', message: 'نوع کالای معتبر انتخاب کنید' },
      ]);
    }

    const previous = await this.prisma.documentVendorProductType.findUnique({
      where: { documentId_vendorId: { documentId, vendorId } },
      select: { productTypeId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.documentVendorProductType.upsert({
        where: { documentId_vendorId: { documentId, vendorId } },
        create: { documentId, vendorId, productTypeId, setById: user.id },
        update: { productTypeId, setById: user.id, setAt: new Date() },
        include: { productType: { select: { id: true, title: true } } },
      });

      // حافظه پیشنهاد: فقط وقتی انتخاب **عوض** شده، نه هر بار ذخیره دوباره همان مقدار.
      if (previous?.productTypeId !== productTypeId) {
        await tx.vendorProductTypeSuggestion.upsert({
          where: { vendorId_productTypeId: { vendorId, productTypeId } },
          create: { vendorId, productTypeId, useCount: 1 },
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
          before: previous ? { vendorId, productTypeId: previous.productTypeId } : null,
          after: { vendorId, productTypeId, title: productType.title },
        },
        tx,
      );

      return { id: saved.productType.id, title: saved.productType.title };
    });
  }
}
