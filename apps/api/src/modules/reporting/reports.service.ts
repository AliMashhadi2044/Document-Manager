import { Injectable } from '@nestjs/common';

import { reportFontFaceCss } from './report-font';
import {
  layoutReport,
  renderReportHtml,
  templateV1Schema,
  textPlaceholders,
  validateTemplate,
  walkConditionPaths,
  walkExpressionPaths,
  allBlocks,
  type LaidOutReport,
  type TemplateV1,
} from '@dm/report-engine';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DatasetService } from './dataset.service';
import { DocumentAccessService } from '../documents/document-access.service';
import { allowedValuePaths, collectionFields } from './data-dictionary';

export interface ReportRunResult {
  readonly runId: string;
  readonly report: LaidOutReport;
  readonly skippedInvoiceCount: number;
  readonly rowCount: number;
  /**
   * شناسه فروشنده هر ردیف، به همان ترتیب ردیف‌های جدول.
   *
   * شناسه **ستون گزارش نیست** و نباید باشد؛ ولی رابط کاربری برای اقدام‌های خودش
   * («تعیین نوع کالا»، «جزئیات مبالغ») باید بداند هر ردیف به کدام فروشنده است. پس
   * جدا از چیدمان و کنار آن فرستاده می‌شود، نه داخل سلول‌ها.
   */
  readonly rowVendorIds: readonly string[];
}

/**
 * اجرای گزارش.
 *
 * ترتیب کار عمدی است و هر مرحله یک دروازه است:
 *  ۱. قالب منتشرشده خوانده و با schema **دوباره** اعتبارسنجی می‌شود.
 *  ۲. مسیرهای داده‌ای قالب در برابر Data Dictionary و مجوز کاربر **اجراکننده** سنجیده
 *     می‌شوند — نه مجوز سازنده قالب.
 *  ۳. داده با همان هویت حل می‌شود (دامنه دسترسی نقش در کوئری است).
 *  ۴. موتور رندر، که هیچ دسترسی به دیتابیس ندارد، چیدمان را می‌سازد.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly datasets: DatasetService,
    private readonly access: DocumentAccessService,
  ) {}

  /**
   * قالب فعالِ یک نوع گزارش.
   *
   * قالب از `report_types.active_definition_id` خوانده می‌شود، یعنی از یک **انتخاب
   * صریح**. نسخه اول این متد `findFirst` با ترتیب `createdAt` بود و این یک نقص واقعی
   * داشت: کاربری که قالب سیستمی را کپی، ویرایش و منتشر می‌کرد، همچنان خروجی قالب
   * قدیمی را می‌گرفت و هیچ پیامی هم نمی‌دید — کل کار طراح بی‌اثر و بی‌صدا.
   */
  async publishedTemplate(reportTypeKey: string): Promise<{
    definitionId: string;
    versionId: string;
    template: TemplateV1;
  }> {
    const reportType = await this.prisma.reportType.findFirst({
      where: { key: reportTypeKey, isActive: true },
      include: { activeDefinition: { include: { currentVersion: true } } },
    });

    if (!reportType) throw AppError.notFound('این نوع گزارش فعال نیست');

    const definition = reportType.activeDefinition;
    if (!definition) {
      throw AppError.notFound('برای این نوع گزارش هیچ قالب فعالی انتخاب نشده است');
    }
    if (definition.status !== 'PUBLISHED' || !definition.currentVersion) {
      throw AppError.conflict(
        'REPORT_TEMPLATE_NOT_PUBLISHED',
        'قالب فعال این گزارش نسخه منتشرشده‌ای ندارد',
      );
    }

    const parsed = templateV1Schema.safeParse(definition.currentVersion.template);
    if (!parsed.success) {
      // قالب خرابِ ذخیره‌شده نباید نیمه‌رندر شود؛ خطای صریح بهتر از خروجی غلط است.
      throw new AppError(
        'REPORT_TEMPLATE_INVALID',
        'قالب ذخیره‌شده این گزارش معتبر نیست',
        500,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    return {
      definitionId: definition.id,
      versionId: definition.currentVersion.id,
      template: parsed.data,
    };
  }

  /**
   * همه مسیرهای داده‌ای که یک قالب لمس می‌کند.
   *
   * مسیرهای `row.*` **کامل** می‌شوند: ستونی از جدولی با منبع `document.invoices` که
   * `row.taxAmount` را می‌خواند، به `document.invoices.taxAmount` تبدیل می‌شود. بدون
   * این کامل‌سازی نمی‌شد فهمید `row.taxAmount` به کدام مجموعه است، و مجوزِ **فیلد**
   * (مثل «جزئیات محاسبه فاکتور») هیچ‌وقت سنجیده نمی‌شد.
   */
  templatePaths(template: TemplateV1): Set<string> {
    const paths = new Set<string>();

    /** مسیر ردیف با کلید مجموعه‌اش کامل می‌شود؛ بقیه همان‌طور می‌مانند. */
    const add = (path: string, rowSource: string | null): void => {
      if (!path.startsWith('row.')) {
        paths.add(path);
        return;
      }
      // بدون دامنه ردیف، مسیر نامعتبر است و همان‌طور خام ثبت می‌شود تا
      // `assertPathsAllowed` آن را به‌عنوان مسیر ناشناخته رد کند (fail-closed).
      paths.add(rowSource === null ? path : `${rowSource}.${path.slice('row.'.length)}`);
    };

    for (const block of allBlocks(template)) {
      if (block.visibleWhen) walkConditionPaths(block.visibleWhen, null, add);

      switch (block.type) {
        case 'text':
          for (const placeholder of textPlaceholders(block.text)) paths.add(placeholder);
          break;
        case 'variable':
          walkExpressionPaths(block.value, null, add);
          break;
        case 'table':
          paths.add(block.dataSource);
          for (const column of block.columns) {
            walkExpressionPaths(column.value, block.dataSource, add);
            for (const line of column.multiline?.lines ?? []) {
              walkExpressionPaths(line.value, block.dataSource, add);
            }
            if (column.visibleWhen) {
              walkConditionPaths(column.visibleWhen, block.dataSource, add);
            }
          }
          break;
        default:
          break;
      }
    }

    return paths;
  }

  /**
   * اجرای گزارش روی یک سند و ثبت رکورد اجرا.
   *
   * `generatedAt` ورودی است تا دو خروجی از یک اجرا (پیش‌نمایش و Excel) تاریخ یکسان
   * داشته باشند و تست هم به ساعت سیستم گره نخورد.
   */
  async run(
    reportTypeKey: string,
    documentId: string,
    outputFormat: 'HTML' | 'EXCEL' | 'PDF',
    user: AuthenticatedUser,
    generatedAt = new Date(),
  ): Promise<ReportRunResult> {
    const { definitionId, versionId, template } = await this.publishedTemplate(reportTypeKey);
    return this.execute(
      { definitionId, versionId, template, label: reportTypeKey },
      documentId,
      outputFormat,
      user,
      generatedAt,
    );
  }

  /**
   * اجرای یک **نسخه مشخص** قالب — پیش‌نویس یا منتشرشده.
   *
   * دو کاربرد دارد و هر دو در فاز ۷ لازم شدند:
   *  - پیش‌نمایش طراح روی نسخه پیش‌نویس، پیش از انتشار.
   *  - بازتولید یک خروجی تاریخی با **همان نسخه‌ای** که آن روز اجرا شده بود.
   *
   * قالب همچنان از دیتابیس می‌آید، نه از بدنه درخواست: طراح اول پیش‌نویس را ذخیره
   * می‌کند و بعد با شناسه‌اش پیش‌نمایش می‌گیرد. پس قاعده «قالب هرگز از بدنه درخواست
   * نمی‌آید» دست‌نخورده می‌ماند.
   */
  async runVersion(
    versionId: string,
    documentId: string,
    outputFormat: 'HTML' | 'EXCEL' | 'PDF',
    user: AuthenticatedUser,
    generatedAt = new Date(),
  ): Promise<ReportRunResult> {
    const version = await this.prisma.reportVersion.findUnique({
      where: { id: versionId },
      include: { definition: { select: { id: true, reportType: { select: { key: true } } } } },
    });
    if (!version) throw AppError.notFound('نسخه قالب یافت نشد');

    const parsed = templateV1Schema.safeParse(version.template);
    if (!parsed.success) {
      throw new AppError(
        'REPORT_TEMPLATE_INVALID',
        'قالب این نسخه معتبر نیست',
        422,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    return this.execute(
      {
        definitionId: version.definitionId,
        versionId: version.id,
        template: parsed.data,
        label: version.definition.reportType.key,
      },
      documentId,
      outputFormat,
      user,
      generatedAt,
    );
  }

  /**
   * بازتولید یک خروجی تاریخی.
   *
   * همان نسخه قالبی که آن اجرا استفاده کرده بود دوباره اجرا می‌شود — نه نسخه جاری.
   * پس انتشار نسخه تازه، خروجی تاریخی را عوض نمی‌کند (معیار پذیرش ۵ فاز ۷).
   *
   * محدودیت صادقانه: **داده سند** از امروز خوانده می‌شود، نه از نسخه ثبت‌شده سند.
   * `report_runs.document_revision_id` برای همین در مدل هست ولی بازپخش نسخه سند هنوز
   * ساخته نشده است؛ پس بازتولید، «همان قالب» را تضمین می‌کند، نه «همان داده».
   */
  async reproduce(runId: string, user: AuthenticatedUser): Promise<ReportRunResult> {
    const run = await this.prisma.reportRun.findUnique({ where: { id: runId } });
    if (!run) throw AppError.notFound('اجرای گزارش یافت نشد');

    return this.runVersion(run.versionId, run.documentId, run.outputFormat, user);
  }

  private async execute(
    source: { definitionId: string; versionId: string; template: TemplateV1; label: string },
    documentId: string,
    outputFormat: 'HTML' | 'EXCEL' | 'PDF',
    user: AuthenticatedUser,
    generatedAt: Date,
  ): Promise<ReportRunResult> {
    const started = Date.now();

    // اعتبارسنجی ساختاری دوباره، این‌بار در برابر Data Dictionary امروز.
    const problems = validateTemplate(source.template, {
      allowedValuePaths: allowedValuePaths(),
      collections: collectionFields(),
    });
    if (problems.length > 0) {
      throw new AppError('REPORT_TEMPLATE_INVALID', 'قالب این گزارش معتبر نیست', 422, problems);
    }

    const paths = this.templatePaths(source.template);
    this.datasets.assertPathsAllowed(paths, user);

    const dataset = await this.datasets.buildDocumentDataset(documentId, user, generatedAt);
    const report = layoutReport(source.template, dataset);

    const aggregateRows = dataset.collections['document.vendorAggregates'] ?? [];
    const rowCount = aggregateRows.length;
    const rowVendorIds = aggregateRows.map((row) => String(row['vendorId'] ?? ''));

    const run = await this.prisma.reportRun.create({
      data: {
        definitionId: source.definitionId,
        versionId: source.versionId,
        documentId,
        params: { reportTypeKey: source.label },
        status: 'SUCCEEDED',
        outputFormat,
        rowCount,
        durationMs: Date.now() - started,
        requestedById: user.id,
      },
    });

    // اجرای گزارش یک عملیات حساس است: چه کسی، چه سندی، با کدام نسخه قالب.
    await this.audit.record({
      actorId: user.id,
      action: 'REPORT_RUN',
      entityType: 'reportRun',
      entityId: run.id,
      documentId,
      after: {
        reportTypeKey: source.label,
        outputFormat,
        rowCount,
        versionId: source.versionId,
      },
    });

    return {
      runId: run.id,
      report,
      skippedInvoiceCount: dataset.skippedInvoiceCount,
      rowCount,
      rowVendorIds,
    };
  }

  /** HTML چاپی همان اجرا. */
  renderHtml(report: LaidOutReport): string {
    // قلم همراه خود سند می‌رود؛ خروجی نباید به قلم‌های نصب‌شده روی ماشین وابسته باشد.
    return renderReportHtml(report, { fontFaceCss: reportFontFaceCss() });
  }

  /**
   * انواع گزارش فعال که قالب فعالِ منتشرشده دارند.
   *
   * همان قالبی گزارش می‌شود که `publishedTemplate` اجرا می‌کند — نه «اولین قالب
   * منتشرشده». فهرستی که با اجرا نخواند، بدتر از نبودن فهرست است.
   */
  async activeTypes() {
    const types = await this.prisma.reportType.findMany({
      where: { isActive: true },
      orderBy: { titleFa: 'asc' },
      include: {
        activeDefinition: {
          select: {
            id: true,
            name: true,
            status: true,
            currentVersion: { select: { versionNo: true } },
          },
        },
      },
    });

    return types
      .filter(
        (type) =>
          type.activeDefinition?.status === 'PUBLISHED' &&
          type.activeDefinition.currentVersion !== null,
      )
      .map((type) => ({
        key: type.key,
        titleFa: type.titleFa,
        dataScopeKey: type.dataScopeKey,
        definitionId: type.activeDefinition?.id,
        definitionName: type.activeDefinition?.name ?? null,
        versionNo: type.activeDefinition?.currentVersion?.versionNo ?? null,
      }));
  }

  async history(documentId: string, user: AuthenticatedUser) {
    // دامنه دسترسی سند، دامنه دیدن تاریخچه اجرا هم هست: سند نامرئی ⇒ ۴۰۴.
    await this.access.assertDocumentVisible(documentId, user);

    return this.prisma.reportRun.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        outputFormat: true,
        status: true,
        rowCount: true,
        durationMs: true,
        createdAt: true,
        requestedBy: { select: { id: true, fullName: true } },
        version: { select: { versionNo: true } },
      },
    });
  }
}
