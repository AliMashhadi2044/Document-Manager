import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  INVOICE_KIND_LABELS,
  PERSON_TYPE_LABELS,
  aggregateByVendor,
  isoDateToJalali,
  formatJalali,
  moneyToString,
  type AggregatableInvoice,
  type Money,
} from '@dm/shared';
import type { ReportDataset, SignatorySnapshot } from '@dm/report-engine';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';
import { DATA_SOURCE_BY_KEY, permissionsForPaths } from './data-dictionary';

/**
 * لایه ۳ — حل داده (docs/09 §۱).
 *
 * اینجا جایی است که **هویت کاربر اجراکننده** به داده وصل می‌شود. خروجی‌اش یک شیء
 * ساده است: نه کلاینت Prisma، نه تابع، نه مسیر برگشتی به دیتابیس. موتور رندر هر
 * بلایی هم سرش بیاورد، نمی‌تواند به چیزی برسد که اینجا نگذاشته‌ایم.
 *
 * تجمیع فروشنده در **بسته مشترک** انجام می‌شود (`aggregateByVendor`)، نه اینجا: قاعده
 * «شماره صورتحساب خالی برای چند فاکتور» و «تاریخ اولین فاکتور» کد تست‌شده است و باید
 * همان کدی باشد که کلاینت هم می‌تواند با آن پیش‌نمایش بسازد.
 */
@Injectable()
export class DatasetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DocumentAccessService,
  ) {}

  /**
   * بررسی مجوز مسیرهای داده‌ای که یک قالب لمس می‌کند.
   *
   * fail-closed: مسیر ناشناخته یعنی خطا، نه «رد شو و ادامه بده».
   */
  assertPathsAllowed(paths: Iterable<string>, user: AuthenticatedUser): void {
    const { permissions, unknownPaths } = permissionsForPaths(paths);

    if (unknownPaths.length > 0) {
      throw AppError.validation('قالب به داده ناشناخته اشاره می‌کند', [
        { path: 'template', message: `مسیر داده نامعتبر: ${unknownPaths.join('، ')}` },
      ]);
    }

    const missing = [...permissions].filter(
      (permission) => !user.permissions.includes(permission),
    );
    if (missing.length > 0) {
      // نام مجوز لو نمی‌رود؛ کاربر فقط باید بداند که نمی‌تواند.
      throw AppError.forbidden('اجرای این گزارش در اختیار نقش شما نیست');
    }
  }

  /**
   * ساخت داده گزارش مالیات برای یک سند.
   *
   * `generatedAt` از بیرون می‌آید و `new Date()` داخلی نیست: خروجی باید بازتولیدپذیر
   * باشد و یک تست هم نباید به ساعت سیستم گره بخورد.
   */
  async buildDocumentDataset(
    documentId: string,
    user: AuthenticatedUser,
    generatedAt: Date,
  ): Promise<ReportDataset & { readonly skippedInvoiceCount: number }> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    const [full, organization, signatories, productTypes] = await Promise.all([
      this.prisma.financialDocument.findUniqueOrThrow({
        where: { id: documentId },
        include: {
          buyerSnapshot: true,
          invoices: {
            include: {
              vendorSnapshot: true,
              invoiceType: { select: { titleFa: true } },
            },
          },
        },
      }),
      this.prisma.organizationSettings.findFirst(),
      this.prisma.signatory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.documentVendorProductType.findMany({
        where: { documentId },
        include: { productType: { select: { title: true } } },
      }),
    ]);

    const aggregatable: AggregatableInvoice[] = full.invoices.map((invoice) => ({
      id: invoice.id,
      vendorId: invoice.vendorId,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      invoiceNumber: invoice.invoiceNumber,
      gross: invoice.grossAmount as Money,
      discount: invoice.discountAmount as Money,
      tax: invoice.taxAmount as Money,
    }));

    const { rows, skippedInvoiceIds } = aggregateByVendor(aggregatable);

    /*
      «نوع کالا» با سه منبع، به ترتیب.

      اول آنچه کاربر ثبت کرده (از فهرست یا متن آزاد)؛ اگر ثبت نکرده، **شرح اولین
      فاکتور** همان فروشنده در همین سند — کاربر شرح را موقع ثبت فاکتور نوشته و
      دوباره پرسیدنش کار اضافه است. پس این ستون بدون هیچ کاری هم معمولاً درست است.

      ترتیب «اولین» همان ترتیب قطعی گزارش است (تاریخ صعودی، سپس شناسه) و فاکتورها
      از همان `include` با همین ترتیب آمده‌اند.
    */
    const productTypeByVendor = new Map(
      productTypes.map((item) => [
        item.vendorId,
        item.productType?.title ?? (item.customTitle as string),
      ]),
    );

    const descriptionByVendor = new Map<string, string>();
    for (const invoice of full.invoices) {
      if (!invoice.vendorId || !invoice.description) continue;
      if (!descriptionByVendor.has(invoice.vendorId)) {
        descriptionByVendor.set(invoice.vendorId, invoice.description);
      }
    }

    // هویت فروشنده از **snapshot همان فاکتورها** خوانده می‌شود، نه از رکورد زنده:
    // گزارش یک سند ثبت‌شده باید همان چیزی را نشان دهد که در زمان ثبت بوده است.
    const snapshotByVendor = new Map<string, (typeof full.invoices)[number]['vendorSnapshot']>();
    for (const invoice of full.invoices) {
      if (invoice.vendorId && invoice.vendorSnapshot && !snapshotByVendor.has(invoice.vendorId)) {
        snapshotByVendor.set(invoice.vendorId, invoice.vendorSnapshot);
      }
    }

    const vendorAggregates = rows.map((row, index) => {
      const snapshot = snapshotByVendor.get(row.vendorId);
      return {
        index: index + 1,
        vendorId: row.vendorId,
        vendorName: snapshot?.name ?? '',
        // شخص حقوقی شماره اقتصادی دارد و شخص حقیقی کد ملی؛ ستون یکی است.
        vendorIdentifier: snapshot?.economicCode ?? snapshot?.nationalId ?? '',
        personType: label(PERSON_TYPE_LABELS, snapshot?.personType),
        representativeName: snapshot?.representativeName ?? '',
        address: snapshot?.addressLine ?? '',
        phone: snapshot?.phone ?? '',
        postalCode: snapshot?.postalCode ?? '',
        invoiceNumber: row.invoiceNumber ?? '',
        invoiceDate: row.invoiceDate,
        invoiceCount: row.invoiceCount,
        productTypeTitle:
          productTypeByVendor.get(row.vendorId) ?? descriptionByVendor.get(row.vendorId) ?? '',
        goodsAmount: moneyToString(row.goodsAmount),
        discount: moneyToString(row.discount),
        net: moneyToString(row.net),
        tax: moneyToString(row.tax),
        total: moneyToString(row.total),
        invoiceIds: row.invoiceIds,
      };
    });

    const invoiceRows = full.invoices.map((invoice, index) => ({
      index: index + 1,
      invoiceNumber: invoice.invoiceNumber ?? '',
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      invoiceKind: label(INVOICE_KIND_LABELS, invoice.invoiceKind),
      chapterTitle: invoice.chapterTitleSnapshot,
      vendorName: invoice.vendorSnapshot?.name ?? '',
      grossAmount: invoice.grossAmount.toString(),
      discountAmount: invoice.discountAmount.toString(),
      netAmount: invoice.netAmount.toString(),
      taxAmount: invoice.taxAmount.toString(),
      totalAmount: invoice.totalAmount.toString(),
    }));

    const documentDate = full.documentDate?.toISOString().slice(0, 10) ?? '';

    return {
      values: {
        organization: {
          name: organization?.name ?? '',
          economicCode: '',
          addressLine: organization?.addressLine ?? '',
          phone: organization?.phone ?? '',
        },
        document: {
          title: document.title,
          type: label(DOCUMENT_TYPE_LABELS, document.type),
          status: label(DOCUMENT_STATUS_LABELS, document.status),
          fiscalYear: document.fiscalYear,
          jalaliYear: document.jalaliYear,
          documentNumber: document.documentNumber ?? '',
          documentDate,
          documentDateJalali: documentDate === '' ? '' : safeJalali(documentDate),
          buyerName: full.buyerSnapshot?.name ?? '',
          buyerEconomicCode: full.buyerSnapshot?.economicCode ?? '',
          totalGross: full.totalGross.toString(),
          totalDiscount: full.totalDiscount.toString(),
          totalNet: full.totalNet.toString(),
          totalTax: full.totalTax.toString(),
          totalAmount: full.totalAmount.toString(),
          invoiceCount: full.invoices.length,
        },
      },
      collections: {
        'document.vendorAggregates': vendorAggregates,
        'document.invoices': invoiceRows,
      },
      signatories: signatories.map(
        (item): SignatorySnapshot => ({
          roleKey: item.roleKey,
          fullName: item.fullName,
          positionTitle: item.positionTitle,
        }),
      ),
      // سیاست گرد کردن **خود سند** — نه پیش‌فرض سامانه؛ سند قدیمی با سیاست قدیمی
      // ثبت شده و گزارشش هم باید با همان حساب شود (ADR-0012).
      roundingMode: readRoundingMode(document.roundingPolicy),
      generatedAt: generatedAt.toISOString().slice(0, 10),
      skippedInvoiceCount: skippedInvoiceIds.length,
    };
  }

  /** فهرست منابع داده برای طراح گزارش (فاز ۷) و برای نمایش در UI. */
  describeDataSources(user: AuthenticatedUser) {
    return [...DATA_SOURCE_BY_KEY.values()]
      .filter((source) =>
        source.requiredPermissions.every((permission) => user.permissions.includes(permission)),
      )
      .map((source) => ({
        key: source.key,
        titleFa: source.titleFa,
        cardinality: source.cardinality,
        fields: source.fields.map((field) => ({
          key: field.key,
          titleFa: field.titleFa,
          type: field.type,
        })),
      }));
  }
}

/**
 * برچسب فارسی یک مقدار enum برای **نمایش**.
 *
 * قالب گزارش این مقدار را همان‌طور که هست چاپ می‌کند؛ `STAD` و `FINAL` نامی نیستند
 * که کسی بیرون از سامانه بخواند. مقدار ناشناخته خام می‌ماند — پنهان کردنش بدتر از
 * نشان دادنش است.
 */
function label(labels: Readonly<Record<string, string>>, value: string | null | undefined): string {
  if (!value) return '';
  return labels[value] ?? value;
}

function safeJalali(iso: string): string {
  try {
    return formatJalali(isoDateToJalali(iso));
  } catch {
    return iso;
  }
}

function readRoundingMode(policy: unknown): 'HALF_UP' | 'FLOOR' | 'HALF_EVEN' {
  if (policy !== null && typeof policy === 'object' && 'mode' in policy) {
    const mode = (policy as { mode: unknown }).mode;
    if (mode === 'FLOOR' || mode === 'HALF_EVEN' || mode === 'HALF_UP') return mode;
  }
  return 'HALF_UP';
}
