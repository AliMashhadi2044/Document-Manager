import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';

/**
 * داشبورد — کوئری‌های تجمیعی، نه شمردن ردیف‌های خوانده‌شده.
 *
 * دو قاعده:
 *
 *  ۱. **همه اعداد با `count`/`aggregate`/`groupBy` در دیتابیس حساب می‌شوند.** یک
 *     داشبورد که برای شمردن، ردیف‌ها را به سرویس می‌آورد، با رشد داده اول کند و بعد
 *     بی‌استفاده می‌شود.
 *
 *  ۲. **همان دامنه دسترسی سند.** داشبورد یک نمای خلاصه است، نه یک در پشتی: کاربری
 *     که پیش‌نویس‌ها را نمی‌بیند، نباید جمعشان را در داشبورد ببیند. شرط دامنه در
 *     **همه** کوئری‌ها هست، از جمله تجمیع‌ها.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DocumentAccessService,
  ) {}

  async summary(user: AuthenticatedUser, fiscalYear?: number) {
    const scope = this.access.scope(user);
    const where = fiscalYear === undefined ? scope : { ...scope, fiscalYear };

    const [
      documentCount,
      totals,
      byStatus,
      byType,
      invoiceCount,
      openFeedbacks,
      pendingArchive,
      topVendors,
      byChapter,
    ] = await Promise.all([
      this.prisma.financialDocument.count({ where }),

      this.prisma.financialDocument.aggregate({
        where,
        _sum: { totalGross: true, totalDiscount: true, totalNet: true, totalTax: true, totalAmount: true },
      }),

      this.prisma.financialDocument.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),

      this.prisma.financialDocument.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),

      this.prisma.invoice.count({ where: { document: where } }),

      this.prisma.reviewFeedback.count({
        where: { status: { in: ['OPEN', 'ANSWERED'] }, document: where },
      }),

      this.prisma.financialDocument.count({ where: { ...where, status: 'PENDING_ARCHIVE' } }),

      /*
       * ده فروشنده بزرگ از نظر مبلغ.
       *
       * گروه‌بندی روی `vendor_id` انجام می‌شود (ستون خودِ جدول فاکتور) و نام در یک
       * کوئری **دوم** برای همان ده شناسه خوانده می‌شود — نه یک کوئری به‌ازای هر
       * ردیف. دو کوئری ثابت، مستقل از تعداد فروشندگان.
       */
      this.prisma.invoice.groupBy({
        by: ['vendorId'],
        where: { document: where, vendorId: { not: null } },
        _sum: { totalAmount: true, taxAmount: true },
        _count: { _all: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      }),

      this.prisma.invoice.groupBy({
        by: ['chapterTitleSnapshot'],
        where: { document: where },
        _sum: { totalAmount: true, taxAmount: true },
        _count: { _all: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      }),
    ]);

    const vendorIds = topVendors
      .map((row) => row.vendorId)
      .filter((id): id is string => id !== null);
    const vendorNames =
      vendorIds.length === 0
        ? []
        : await this.prisma.vendor.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, name: true },
          });
    const nameById = new Map(vendorNames.map((vendor) => [vendor.id, vendor.name]));

    return {
      fiscalYear: fiscalYear ?? null,
      documentCount,
      invoiceCount,
      openFeedbackCount: openFeedbacks,
      pendingArchiveCount: pendingArchive,
      totals: {
        gross: (totals._sum.totalGross ?? 0n).toString(),
        discount: (totals._sum.totalDiscount ?? 0n).toString(),
        net: (totals._sum.totalNet ?? 0n).toString(),
        tax: (totals._sum.totalTax ?? 0n).toString(),
        total: (totals._sum.totalAmount ?? 0n).toString(),
      },
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
        total: (row._sum.totalAmount ?? 0n).toString(),
      })),
      byType: byType.map((row) => ({
        type: row.type,
        count: row._count._all,
        total: (row._sum.totalAmount ?? 0n).toString(),
      })),
      topVendors: topVendors.map((row) => ({
        vendorId: row.vendorId,
        name: row.vendorId === null ? 'بدون فروشنده' : (nameById.get(row.vendorId) ?? '—'),
        invoiceCount: row._count._all,
        total: (row._sum.totalAmount ?? 0n).toString(),
        tax: (row._sum.taxAmount ?? 0n).toString(),
      })),
      byChapter: byChapter.map((row) => ({
        chapterTitle: row.chapterTitleSnapshot,
        invoiceCount: row._count._all,
        total: (row._sum.totalAmount ?? 0n).toString(),
        tax: (row._sum.taxAmount ?? 0n).toString(),
      })),
    };
  }

  /** سال‌های مالی موجود در دامنه دسترسی کاربر — برای فیلتر داشبورد. */
  async fiscalYears(user: AuthenticatedUser): Promise<number[]> {
    const rows = await this.prisma.financialDocument.groupBy({
      by: ['fiscalYear'],
      where: this.access.scope(user),
      orderBy: { fiscalYear: 'desc' },
    });
    return rows.map((row) => row.fiscalYear);
  }
}
