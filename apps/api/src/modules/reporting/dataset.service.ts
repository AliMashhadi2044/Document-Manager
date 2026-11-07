import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  INVOICE_KIND_LABELS,
  PERSON_TYPE_LABELS,
  aggregateByVendor,
  beneficiaryShareKind,
  paymentPayeeTitle,
  groupBeneficiaries,
  type BeneficiaryInvoiceInput,
  isoDateToJalali,
  formatJalali,
  moneyToString,
  parseReportSettings,
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
  ): Promise<
    ReportDataset & {
      readonly skippedInvoiceCount: number;
      readonly skippedPaymentCount: number;
    }
  > {
    const document = await this.access.assertDocumentVisible(documentId, user);

    const [full, organization, signatories, productTypes, chapters, reportSettingsRow] =
      await Promise.all([
      this.prisma.financialDocument.findUniqueOrThrow({
        where: { id: documentId },
        include: {
          buyerSnapshot: true,
          invoices: {
            /*
              ترتیب قطعی گزارش: تاریخ صورتحساب، سپس **ترتیب ثبت**، و در آخر شناسه.

              `createdAt` تزیین نیست: دو فاکتور با یک تاریخ، «اولین»شان همان است که
              کاربر اول ثبت کرده — نه آن‌که شناسهٔ تصادفی‌اش کوچک‌تر درآمده. ستون
              «نوع کالا» از همین «اولین» پر می‌شود، پس ترتیب تصادفی یعنی عنوانی که
              هر بار می‌تواند فرق کند.
            */
            orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            include: {
              vendorSnapshot: true,
              invoiceType: { select: { titleFa: true } },
              payment: true,
              chapter: { select: { id: true, category: { select: { key: true } } } },
              reportTitle: { include: { productType: { select: { title: true } } } },
              fuelDetail: true,
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
      /*
        فصل‌های **فعال**، به ترتیب خودشان.

        ستون‌های فرم ریزهزینه از همین می‌آیند. فصلِ غیرفعال ستون نمی‌گیرد — ولی
        فاکتوری که قبلاً به آن ثبت شده، در ردیف‌ها می‌ماند و جمعش هم از ستون «جمع»
        می‌آید. گم شدنِ خاموشِ مبلغ، بدترین چیزی است که یک فرم مالی می‌تواند بکند.
      */
      this.prisma.budgetChapter.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true, code: true, category: { select: { key: true } } },
      }),
      this.prisma.systemSetting.findUnique({ where: { key: 'report_settings' } }),
    ]);

    const reportSettings = parseReportSettings(reportSettingsRow?.value);

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

      ترتیب «اولین» همان ترتیب قطعی گزارش است (تاریخ، سپس ترتیب ثبت) و فاکتورها
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

    /*
      مقصدهای پرداخت — ورودی گزارش «شماره شبا ذینفعان سند».

      قاعدهٔ گروه‌بندی در `@dm/shared` است و نه اینجا: دیالوگ «جزئیات» باید دقیقاً
      همان تقسیم را نشان دهد، و دو پیاده‌سازی دیر یا زود دو عدد می‌دهند.
    */
    const beneficiaryInput: BeneficiaryInvoiceInput[] = full.invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      totalAmount: invoice.totalAmount as Money,
      vendorName: invoice.vendorSnapshot?.name ?? '',
      methodKind: invoice.payment?.methodKind ?? null,
      ibanSnapshot: invoice.payment?.ibanSnapshot ?? null,
      bankTitleSnapshot: invoice.payment?.bankTitleSnapshot ?? null,
      accountTitleSnapshot: invoice.payment?.accountTitleSnapshot ?? null,
      paymentIdentifier: invoice.payment?.paymentIdentifier ?? null,
      billIdentifier: invoice.payment?.billIdentifier ?? null,
      payeeName: invoice.payment?.payeeName ?? null,
      pettyCashHolderNameSnapshot: invoice.payment?.pettyCashHolderNameSnapshot ?? null,
      pettyCashAccountHolderSnapshot: invoice.payment?.pettyCashAccountHolderSnapshot ?? null,
      pettyCashBankTitleSnapshot: invoice.payment?.pettyCashBankTitleSnapshot ?? null,
      pettyCashIbanSnapshot: invoice.payment?.pettyCashIbanSnapshot ?? null,
      beneficiaryAmount: (invoice.payment?.beneficiaryAmount ?? null) as Money | null,
      pettyCashAmount: (invoice.payment?.pettyCashAmount ?? null) as Money | null,
    }));

    const beneficiaryGrouping = groupBeneficiaries(beneficiaryInput);

    const beneficiaryRows = beneficiaryGrouping.rows.map((row, index) => ({
      index: index + 1,
      key: row.key,
      kind: row.kind,
      identifier: row.identifier,
      secondaryIdentifier: row.secondaryIdentifier,
      accountHolder: row.accountHolder,
      bankTitle: row.bankTitle,
      invoiceCount: row.shares.length,
      total: moneyToString(row.total),
    }));

    /*
      فرم ریزهزینه — یک جفت مجموعه برای هر گروه بودجه.

      ستون‌ها از فصل‌های همان گروه می‌آیند و ردیف‌ها از فاکتورهای همان گروه، به
      ترتیب قطعی گزارش. شرح هر ردیف سه منبع دارد، به ترتیب: عنوانی که کاربر برای
      همین فاکتور روی فرم ثبت کرده، بعد شرح خودِ فاکتور، و در آخر خالی — همان
      قاعدهٔ «نوع کالا» در گزارش مالیات.
    */
    const chapterRows = (category: 'CAPITAL' | 'CURRENT') =>
      chapters
        .filter((chapter) => chapter.category.key === category)
        .map((chapter) => ({
          key: chapter.id,
          title: chapter.title,
          code: chapter.code ?? '',
        }));

    const expenseRows = (category: 'CAPITAL' | 'CURRENT') =>
      full.invoices
        .filter((invoice) => invoice.chapter.category.key === category)
        .map((invoice, index) => ({
          index: index + 1,
          invoiceId: invoice.id,
          description:
            invoice.reportTitle?.productType?.title ??
            invoice.reportTitle?.customTitle ??
            invoice.description ??
            '',
          chapterKey: invoice.chapterId,
          chapterTitle: invoice.chapterTitleSnapshot,
          chapterCode: invoice.chapterCodeSnapshot ?? '',
          vendorName: invoice.vendorSnapshot?.name ?? '',
          /*
            تاریخ صورت‌حساب — روی صفحه، نه روی کاغذ.

            فرم ریزهزینه شکل قانونی ثابتی دارد و ستون تازه در آن جا نمی‌شود؛ ولی
            کسی که فرم را روی صفحه بررسی می‌کند باید بفهمد هر ردیف کدام فاکتور
            است، و شرحِ ردیف به‌تنهایی این را نمی‌گوید (دو فاکتور از یک فروشنده
            می‌توانند شرح یکسان داشته باشند). کدام خروجی ستون را دارد، در قالب
            تعیین می‌شود و نه اینجا: داده همیشه هست.
          */
          invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
          beneficiaryShare: beneficiaryShareKind(invoice.payment?.methodKind ?? null),
          /*
            «پرداخت به» — جانشین خانهٔ تیکِ ذی‌نفع.

            تیک فقط می‌توانست بگوید «به ذی‌نفع؟ بله/جزئی/نه»، و در «نه» دو مقصدِ
            متفاوت (کارپرداز و قبض) و «هنوز روش پرداخت ندارد» یکی می‌شدند. ستونی
            که باید بنویسد پول به کجا رفت، به واژه نیاز دارد و نه به علامت.
          */
          payeeTitle: paymentPayeeTitle(invoice.payment?.methodKind ?? null),
          total: invoice.totalAmount.toString(),
        }));

    /*
      ریز هزینهٔ سوخت.

      ترتیب اینجا **خودرو‌محور** است و نه تاریخ‌محور: فرم کاغذی خودروها را کنار هم
      می‌خواهد (هر خودرو یک بار بنزین و یک بار گاز)، و ترتیب تاریخِ پیش‌فرضِ
      فاکتورها آن‌ها را از هم جدا می‌کرد. مرتب‌سازی با `localeCompare` فارسی است تا
      پلاک‌ها همان‌طور بنشینند که خوانده می‌شوند، و شناسهٔ فاکتور شکنندهٔ تساوی است
      تا ترتیب در دو اجرا یکی بماند.
    */
    const fuelRows = full.invoices
      .filter((invoice) => invoice.invoiceKind === 'FUEL' && invoice.fuelDetail !== null)
      .map((invoice) => {
        const detail = invoice.fuelDetail as NonNullable<typeof invoice.fuelDetail>;
        return {
          invoiceId: invoice.id,
          vehicleTypeTitle: detail.vehicleTypeTitleSnapshot,
          plateNumber: detail.plateNumberSnapshot,
          fuelTypeTitle: detail.fuelTypeTitleSnapshot,
          jalaliYear: detail.jalaliYear,
          jalaliMonth: detail.jalaliMonth,
          total: invoice.totalAmount.toString(),
        };
      })
      .sort(
        (left, right) =>
          left.plateNumber.localeCompare(right.plateNumber, 'fa') ||
          left.fuelTypeTitle.localeCompare(right.fuelTypeTitle, 'fa') ||
          left.invoiceId.localeCompare(right.invoiceId),
      )
      .map((row, index) => ({ index: index + 1, ...row }));

    const documentDate = full.documentDate?.toISOString().slice(0, 10) ?? '';

    return {
      values: {
        organization: {
          name: organization?.name ?? '',
          economicCode: '',
          addressLine: organization?.addressLine ?? '',
          phone: organization?.phone ?? '',
        },
        /*
          آستانه، در هر اجرا از تنظیم‌ها خوانده می‌شود و در خروجی ذخیره نمی‌شود.

          رشتهٔ خالی یعنی خاموش، و شرطِ قالب خودش با `empty` همین را می‌سنجد؛
          فرستادن `null` همان معنا را داشت ولی `empty` را به حدسِ خروجی‌گیر وابسته
          می‌کرد.
        */
        settings: {
          taxHighlightAbove: reportSettings.taxHighlightAbove,
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
        'document.beneficiaries': beneficiaryRows,
        'document.invoices': invoiceRows,
        'document.capitalChapters': chapterRows('CAPITAL'),
        'document.capitalExpenses': expenseRows('CAPITAL'),
        'document.currentChapters': chapterRows('CURRENT'),
        'document.currentExpenses': expenseRows('CURRENT'),
        'document.fuelExpenses': fuelRows,
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
      /*
        دو شمارندهٔ جدا، چون دو دلیلِ جداگانه‌اند.

        فاکتوری که فروشنده ندارد از گزارش مالیات می‌افتد؛ فاکتوری که روش پرداخت
        ندارد از گزارش شبا. یکی کردنشان یعنی هشداری که به کاربر دلیل درست را
        نمی‌گوید.
      */
      skippedPaymentCount: beneficiaryGrouping.skippedInvoiceIds.length,
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
