import { Injectable } from '@nestjs/common';
import { JALALI_MONTH_NAMES, jalaliToIsoDate } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';

/** مبنای سال در فیلتر داشبورد. */
export type YearBasis = 'fiscal' | 'jalali';

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

  /**
   * خلاصه داشبورد، بر اساس سال مالی یا سال شمسی.
   *
   * این دو یکی نیستند: سند هم `fiscal_year` دارد (سال بودجه‌ای که سند به آن نسبت داده
   * می‌شود) و هم `jalali_year` (سال شمسیِ ثبت). سندی که اسفند ثبت شده ولی به سال مالی
   * بعد تعلق دارد، در دو نما در دو جای متفاوت دیده می‌شود — و هر دو درست‌اند.
   */
  async summary(user: AuthenticatedUser, year?: number, basis: YearBasis = 'fiscal') {
    const scope = this.access.scope(user);
    const where =
      year === undefined
        ? scope
        : { ...scope, ...(basis === 'jalali' ? { jalaliYear: year } : { fiscalYear: year }) };

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
      basis,
      year: year ?? null,
      fiscalYear: basis === 'fiscal' ? (year ?? null) : null,
      jalaliYear: basis === 'jalali' ? (year ?? null) : null,
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
      byMonth: await this.monthlySeries(where, year ?? (await this.latestYear(user, basis))),
    };
  }

  /**
   * روند ماهانه فاکتورها در یک سال **شمسی**.
   *
   * چرا دوازده کوئری و نه یک `groupBy`: PostgreSQL تقویم شمسی ندارد و ماه‌های شمسی
   * با ماه‌های میلادی هم‌مرز نیستند، پس `date_trunc('month', ...)` ماهِ اشتباه
   * می‌دهد. اینجا مرز هر ماه با همان کتابخانه تقویم پروژه حساب و به‌صورت بازه تاریخ
   * به دیتابیس داده می‌شود — نتیجه، دقیقاً ماه شمسی است.
   *
   * تعداد کوئری **ثابت** است (دوازده، موازی) و با حجم داده رشد نمی‌کند؛ ستون
   * `invoice_date` هم ایندکس دارد.
   */
  private async monthlySeries(where: object, jalaliYear: number | null) {
    if (jalaliYear === null) return [];

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const from = new Date(`${jalaliToIsoDate({ year: jalaliYear, month, day: 1 })}T00:00:00.000Z`);
      const to =
        month === 12
          ? new Date(`${jalaliToIsoDate({ year: jalaliYear + 1, month: 1, day: 1 })}T00:00:00.000Z`)
          : new Date(`${jalaliToIsoDate({ year: jalaliYear, month: month + 1, day: 1 })}T00:00:00.000Z`);
      return { month, from, to };
    });

    const rows = await Promise.all(
      months.map((range) =>
        this.prisma.invoice.aggregate({
          where: { document: where, invoiceDate: { gte: range.from, lt: range.to } },
          _sum: { totalAmount: true, taxAmount: true },
          _count: { _all: true },
        }),
      ),
    );

    return months.map((range, index) => ({
      month: range.month,
      label: JALALI_MONTH_NAMES[range.month - 1] ?? String(range.month),
      invoiceCount: rows[index]?._count._all ?? 0,
      total: (rows[index]?._sum.totalAmount ?? 0n).toString(),
      tax: (rows[index]?._sum.taxAmount ?? 0n).toString(),
    }));
  }

  /** تازه‌ترین سال در دامنه کاربر — مبنای روند ماهانه وقتی سالی انتخاب نشده. */
  private async latestYear(user: AuthenticatedUser, basis: YearBasis): Promise<number | null> {
    const years = await this.years(user);
    return (basis === 'jalali' ? years.jalali[0] : years.fiscal[0]) ?? null;
  }

  /**
   * سال‌های موجود در دامنه دسترسی کاربر، برای هر دو مبنا.
   *
   * هر دو در یک پاسخ می‌آیند تا عوض کردن مبنا در رابط، فهرست سال‌ها را خالی نکند و
   * منتظر یک رفت و برگشت تازه نماند.
   */
  async years(user: AuthenticatedUser): Promise<{ fiscal: number[]; jalali: number[] }> {
    const scope = this.access.scope(user);

    const [fiscal, jalali] = await Promise.all([
      this.prisma.financialDocument.groupBy({
        by: ['fiscalYear'],
        where: scope,
        orderBy: { fiscalYear: 'desc' },
      }),
      this.prisma.financialDocument.groupBy({
        by: ['jalaliYear'],
        where: scope,
        orderBy: { jalaliYear: 'desc' },
      }),
    ]);

    return {
      fiscal: fiscal.map((row) => row.fiscalYear),
      jalali: jalali.map((row) => row.jalaliYear),
    };
  }
}
