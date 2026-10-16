import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import type { LaidOutBlock, LaidOutReport } from '@dm/report-engine';

import {
  CurrentUser,
  ReadOnlyRoute,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { ReportsService } from './reports.service';
import { DatasetService } from './dataset.service';
import { ProductTypesService } from './product-types.service';
import { ExcelExporter, safeSheetName } from './excel.exporter';
import { PdfRenderer } from './pdf.renderer';

const setProductTypeSchema = z.object({
  productTypeId: z.string().uuid('نوع کالا را انتخاب کنید'),
});

/**
 * گزارش‌ها.
 *
 * نکته‌ای که در امضای همه مسیرها دیده می‌شود: هیچ‌کدام قالب را از کلاینت نمی‌گیرند.
 * قالب از دیتابیس خوانده می‌شود و کلاینت فقط می‌گوید «کدام گزارش، روی کدام سند».
 * اگر قالب از بدنه درخواست می‌آمد، هر کاربری می‌توانست قالبی بسازد که به داده‌ای
 * اشاره کند که نباید — و تنها دفاع، همان اعتبارسنجی زمان اجرا می‌شد.
 */
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly datasets: DatasetService,
    private readonly productTypes: ProductTypesService,
    private readonly excel: ExcelExporter,
    private readonly pdf: PdfRenderer,
  ) {}

  @RequirePermission('report:run')
  @Get('data-sources')
  @ApiOperation({ summary: 'فهرست منابع داده مجاز برای این کاربر' })
  dataSources(@CurrentUser() user: AuthenticatedUser) {
    return this.datasets.describeDataSources(user);
  }

  /**
   * پیش‌نمایش: سند چیدمان به‌صورت JSON.
   *
   * POST است چون **اجرای گزارش رکورد می‌سازد** (یک ردیف `report_runs` و یک ردیف
   * حسابرسی)؛ GET نباید عارضه داشته باشد.
   */
  @RequirePermission('report:run')
  @Post(':reportTypeKey/documents/:documentId/preview')
  @ApiOperation({ summary: 'اجرای گزارش و بازگرداندن چیدمان برای پیش‌نمایش' })
  async preview(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.reports.run(reportTypeKey, documentId, 'HTML', user);
    return {
      runId: result.runId,
      rowCount: result.rowCount,
      // هشدار شمارش‌شده §۸: چند فاکتور بدون فروشنده از گزارش بیرون مانده‌اند.
      skippedInvoiceCount: result.skippedInvoiceCount,
      rowVendorIds: result.rowVendorIds,
      report: serializeReport(result.report),
    };
  }

  @RequirePermission('report:export')
  @Post(':reportTypeKey/documents/:documentId/html')
  @ApiOperation({ summary: 'خروجی HTML چاپی' })
  async html(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.reports.run(reportTypeKey, documentId, 'HTML', user);

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(this.reports.renderHtml(result.report));
  }

  @RequirePermission('report:export')
  @Post(':reportTypeKey/documents/:documentId/excel')
  @ApiOperation({ summary: 'خروجی Excel با سلول عددی واقعی و ردیف جمع فرمولی' })
  async excelExport(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.reports.run(reportTypeKey, documentId, 'EXCEL', user);
    const buffer = await this.excel.build(result.report);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`${safeSheetName(result.report.titleFa)}.xlsx`)}`,
    );
    response.send(buffer);
  }

  @RequirePermission('report:export')
  @Post(':reportTypeKey/documents/:documentId/pdf')
  @ApiOperation({ summary: 'خروجی PDF با رندر Chromium بدون شبکه و بدون JavaScript' })
  async pdfExport(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.reports.run(reportTypeKey, documentId, 'PDF', user);
    const html = this.reports.renderHtml(result.report);
    const margins = result.report.page.margins;

    const buffer = await this.pdf.render(html, {
      landscape: result.report.page.orientation === 'landscape',
      marginsMm: {
        top: margins.top,
        bottom: margins.bottom,
        left: margins.inlineEnd,
        right: margins.inlineStart,
      },
    });

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`${safeSheetName(result.report.titleFa)}.pdf`)}`,
    );
    response.send(buffer);
  }

  @RequirePermission('report:read_history')
  @Get('documents/:documentId/runs')
  @ApiOperation({ summary: 'تاریخچه اجرای گزارش روی یک سند' })
  async runs(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.history(documentId, user);
  }

  /**
   * پیشنهاد نوع کالا.
   *
   * POST و با نشان «فقط خواندنی»: شناسه فروشنده و سند **در بدنه** می‌آیند چون در
   * مسیرهای بعدی هم استفاده می‌شوند و نگه داشتن قالب یکسان، خطا را کم می‌کند؛ این
   * مسیر چیزی نمی‌نویسد.
   */
  @RequirePermission('report:run')
  @ReadOnlyRoute()
  @Post('documents/:documentId/vendors/:vendorId/product-type/suggestions')
  @ApiOperation({ summary: 'پیشنهاد نوع کالا و خریدهای قبلی همان فروشنده' })
  async productTypeSuggestions(
    @Param('documentId') documentId: string,
    @Param('vendorId') vendorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productTypes.suggestions(documentId, vendorId, user);
  }

  /** جزئیات مبالغ یک ردیف گزارش — کدام فاکتورها آن را ساخته‌اند. */
  @RequirePermission('report:run')
  @ReadOnlyRoute()
  @Post('documents/:documentId/vendors/:vendorId/amount-details')
  @ApiOperation({ summary: 'فاکتورهای تشکیل‌دهنده یک ردیف گزارش' })
  async amountDetails(
    @Param('documentId') documentId: string,
    @Param('vendorId') vendorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productTypes.amountDetails(documentId, vendorId, user);
  }

  @RequirePermission('document:update')
  @Post('documents/:documentId/vendors/:vendorId/product-type')
  @ApiOperation({ summary: 'تعیین نوع کالای یک فروشنده در این سند' })
  async setProductType(
    @Param('documentId') documentId: string,
    @Param('vendorId') vendorId: string,
    @Body(new ZodBody(setProductTypeSchema)) body: z.infer<typeof setProductTypeSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productTypes.set(documentId, vendorId, body.productTypeId, user);
  }

  @RequirePermission('report:run')
  @Get('types')
  @ApiOperation({ summary: 'انواع گزارش فعال و قالب منتشرشده‌شان' })
  async types(@Query('scope') _scope: string | undefined) {
    return this.reports.activeTypes();
  }
}

/**
 * سریالایز چیدمان برای HTTP.
 *
 * `bigint` در JSON جا نمی‌شود و `JSON.stringify` رویش خطا می‌دهد. طبق ADR-0003 مقدار
 * عددی به **رشته** تبدیل می‌شود، نه به `number` — همان قراردادی که همه مرزهای این
 * سامانه دارند.
 */
function serializeReport(report: LaidOutReport): unknown {
  return {
    ...report,
    header: report.header.map(serializeBlock),
    body: report.body.map(serializeBlock),
    footer: report.footer.map(serializeBlock),
  };
}

function serializeBlock(block: LaidOutBlock): unknown {
  if (block.kind !== 'table') return block;

  return {
    ...block,
    rows: block.rows.map((row) =>
      row.map((cell) => ({ ...cell, raw: cell.raw === null ? null : String(cell.raw) })),
    ),
    totals:
      block.totals?.map((cell) => ({ ...cell, raw: cell.raw === null ? null : String(cell.raw) })) ??
      null,
  };
}
