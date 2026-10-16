import { Injectable } from '@nestjs/common';
import {
  collectConditionPaths,
  collectVariablePaths,
  layoutReport,
  renderReportHtml,
  templateV1Schema,
  textPlaceholders,
  validateTemplate,
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
import { allowedCollectionKeys, allowedValuePaths } from './data-dictionary';

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

  /** قالب منتشرشده یک نوع گزارش. */
  async publishedTemplate(reportTypeKey: string): Promise<{
    definitionId: string;
    versionId: string;
    template: TemplateV1;
  }> {
    const definition = await this.prisma.reportDefinition.findFirst({
      where: {
        reportType: { key: reportTypeKey, isActive: true },
        status: 'PUBLISHED',
        currentVersionId: { not: null },
      },
      include: { currentVersion: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!definition?.currentVersion) {
      throw AppError.notFound('قالب منتشرشده‌ای برای این گزارش وجود ندارد');
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

  /** همه مسیرهای داده‌ای که یک قالب لمس می‌کند. */
  templatePaths(template: TemplateV1): Set<string> {
    const paths = new Set<string>();

    for (const block of allBlocks(template)) {
      if (block.visibleWhen) collectConditionPaths(block.visibleWhen, paths);

      switch (block.type) {
        case 'text':
          for (const placeholder of textPlaceholders(block.text)) paths.add(placeholder);
          break;
        case 'variable':
          collectVariablePaths(block.value, paths);
          break;
        case 'table':
          paths.add(block.dataSource);
          for (const column of block.columns) {
            collectVariablePaths(column.value, paths);
            for (const line of column.multiline?.lines ?? []) {
              collectVariablePaths(line.value, paths);
            }
            if (column.visibleWhen) collectConditionPaths(column.visibleWhen, paths);
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
    const started = Date.now();
    const { definitionId, versionId, template } = await this.publishedTemplate(reportTypeKey);

    // اعتبارسنجی ساختاری دوباره، این‌بار در برابر Data Dictionary امروز.
    const problems = validateTemplate(template, {
      allowedValuePaths: allowedValuePaths(),
      allowedCollections: allowedCollectionKeys(),
    });
    if (problems.length > 0) {
      throw new AppError('REPORT_TEMPLATE_INVALID', 'قالب این گزارش معتبر نیست', 500, problems);
    }

    const paths = this.templatePaths(template);
    this.datasets.assertPathsAllowed(paths, user);

    const dataset = await this.datasets.buildDocumentDataset(documentId, user, generatedAt);
    const report = layoutReport(template, dataset);

    const aggregateRows = dataset.collections['document.vendorAggregates'] ?? [];
    const rowCount = aggregateRows.length;
    const rowVendorIds = aggregateRows.map((row) => String(row['vendorId'] ?? ''));

    const run = await this.prisma.reportRun.create({
      data: {
        definitionId,
        versionId,
        documentId,
        params: { reportTypeKey },
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
      after: { reportTypeKey, outputFormat, rowCount, versionId },
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
    return renderReportHtml(report);
  }

  /** انواع گزارش فعال که قالب منتشرشده دارند. */
  async activeTypes() {
    const types = await this.prisma.reportType.findMany({
      where: { isActive: true },
      orderBy: { titleFa: 'asc' },
      include: {
        definitions: {
          where: { status: 'PUBLISHED', currentVersionId: { not: null } },
          select: { id: true, name: true, currentVersion: { select: { versionNo: true } } },
        },
      },
    });

    return types
      .filter((type) => type.definitions.length > 0)
      .map((type) => ({
        key: type.key,
        titleFa: type.titleFa,
        dataScopeKey: type.dataScopeKey,
        definitionId: type.definitions[0]?.id,
        versionNo: type.definitions[0]?.currentVersion?.versionNo ?? null,
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
