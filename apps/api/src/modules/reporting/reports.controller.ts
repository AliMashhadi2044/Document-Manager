import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { pageNumberTemplateOf, type LaidOutBlock, type LaidOutReport } from '@dm/report-engine';

import type { PdfPaperSize } from './pdf.renderer';

/** نام کاغذ در قالب ← نامی که چاپگر بی‌سر می‌فهمد. */
const PDF_PAPER_SIZE: Record<'A3' | 'A4' | 'A5' | 'LETTER', PdfPaperSize> = {
  A3: 'A3',
  A4: 'A4',
  A5: 'A5',
  LETTER: 'Letter',
};

import {
  CurrentUser,
  ReadOnlyRoute,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { ReportsService } from './reports.service';
import { DatasetService } from './dataset.service';
import { ProductTypesService } from './product-types.service';
import { ReportLinesService } from './report-lines.service';
import { BeneficiariesService } from './beneficiaries.service';
import { ExcelExporter, safeSheetName } from './excel.exporter';
import { PdfRenderer } from './pdf.renderer';
import { TemplatesService } from './templates.service';

/**
 * شرح یک ردیفِ فرم ریزهزینه: از فهرست، یا متن آزاد، یا **هیچ‌کدام**.
 *
 * برخلاف «نوع کالا»، هیچ‌کدام هم مجاز است و معنایش روشن است: «برگرد به پیش‌فرض»،
 * یعنی شرح خودِ فاکتور. بدون این حالت، کاربری که یک بار عبارتی نوشته هیچ راهی
 * برای پس گرفتنش نداشت.
 */
const setLineTitleSchema = z
  .object({
    productTypeId: z.string().uuid().nullable().default(null),
    customTitle: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.productTypeId !== null && value.customTitle !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productTypeId'],
        message: 'یا از فهرست انتخاب کنید یا متن بنویسید، نه هر دو',
      });
    }
  });

/**
 * نوع کالا: یا از فهرست، یا متن آزاد — دقیقاً یکی.
 *
 * متن آزاد لازم است چون «نوع کالا» در عمل همان شرح فاکتور است و بستنش به فهرست،
 * کاربر را وادار می‌کرد برای هر عبارت تازه یک نوع کالای تازه بسازد.
 */
const setProductTypeSchema = z
  .object({
    productTypeId: z.string().uuid().nullable().default(null),
    customTitle: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    const fromList = value.productTypeId !== null;
    const fromText = value.customTitle !== null;

    if (fromList === fromText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productTypeId'],
        message: fromList
          ? 'یا نوع کالا را از فهرست انتخاب کنید یا متن بنویسید، نه هر دو'
          : 'نوع کالا را انتخاب کنید یا متنی بنویسید',
      });
    }
  });

/**
 * متن‌های سربرگ که کاربر برای **همین خروجی** عوض کرده است.
 *
 * کلید، شناسهٔ بلوک متنی قالب است و مقدار، متن نهایی. سقف‌ها سخاوتمندانه ولی
 * بسته‌اند: این یک کانال ورودی کاربر به خروجی چاپی است و باید اندازه داشته باشد.
 */
const textOverridesSchema = z
  .record(z.string().min(1).max(60), z.string().max(500))
  .refine((value) => Object.keys(value).length <= 40, {
    message: 'تعداد متن‌های جایگزین بیش از حد مجاز است',
  })
  .optional();

const reportRunBodySchema = z.object({ textOverrides: textOverridesSchema });

/**
 * کلید یک مقصد پرداخت.
 *
 * رشتهٔ مات است و ساختارش قرارداد داخلی گزارش؛ سرور آن را در فهرست مقصدهای **همان
 * سند** می‌جوید و نه در جای دیگر، پس کلیدِ ساختگی فقط ۴۰۴ می‌گیرد.
 */
const beneficiaryKeySchema = z.object({ key: z.string().min(1).max(200) });

const copyTemplateSchema = z.object({
  name: z.string().trim().min(1, 'نام قالب الزامی است').max(200),
});

/**
 * بدنه ذخیره پیش‌نویس، عمداً `unknown` است.
 *
 * اعتبارسنجی واقعی با `templateV1Schema` در سرویس انجام می‌شود تا **یک** تعریف از
 * ساختار قالب وجود داشته باشد، نه یکی اینجا و یکی آنجا که روزی از هم جدا بیفتند.
 */
const saveDraftSchema = z.object({ template: z.unknown() });

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
    private readonly reportLines: ReportLinesService,
    private readonly beneficiaries: BeneficiariesService,
    private readonly excel: ExcelExporter,
    private readonly pdf: PdfRenderer,
    private readonly templates: TemplatesService,
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
  /*
   * `200` و نه `201`: این مسیرها یک **نمایش** برمی‌گردانند (چیدمان، فایل Excel، فایل
   * PDF)، نه ارجاع به منبعی که تازه ساخته شده. ردیف `report_runs` یک عارضه ثبت‌کننده
   * است، نه چیزی که کلاینت نشانی‌اش را بگیرد؛ پاسخ `201 Created` بدون هدر `Location`
   * فقط ابزارها را گمراه می‌کند.
   */
  @RequirePermission('report:run')
  @Post(':reportTypeKey/documents/:documentId/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'اجرای گزارش و بازگرداندن چیدمان برای پیش‌نمایش' })
  async preview(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @Body(new ZodBody(reportRunBodySchema)) body: z.infer<typeof reportRunBodySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.reports.run(
      reportTypeKey,
      documentId,
      'HTML',
      user,
      new Date(),
      body.textOverrides,
    );
    return {
      runId: result.runId,
      rowCount: result.rowCount,
      // هشدار شمارش‌شده §۸: چند فاکتور بدون فروشنده از گزارش بیرون مانده‌اند.
      skippedInvoiceCount: result.skippedInvoiceCount,
      // و چند فاکتور بدون روش پرداخت از گزارش شبا — دو دلیل جدا، دو شمارنده.
      skippedPaymentCount: result.skippedPaymentCount,
      rowVendorIds: result.rowVendorIds,
      rowKeys: result.rowKeys,
      report: serializeReport(result.report),
    };
  }

  @RequirePermission('report:export')
  @Post(':reportTypeKey/documents/:documentId/html')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروجی HTML چاپی' })
  async html(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @Body(new ZodBody(reportRunBodySchema)) body: z.infer<typeof reportRunBodySchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.reports.run(
      reportTypeKey,
      documentId,
      'HTML',
      user,
      new Date(),
      body.textOverrides,
      // کاغذ: ستون‌های «فقط صفحه» در این خروجی ساخته نمی‌شوند.
      'print',
    );

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(this.reports.renderHtml(result.report));
  }

  @RequirePermission('report:export')
  @Post(':reportTypeKey/documents/:documentId/excel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروجی Excel با سلول عددی واقعی و ردیف جمع فرمولی' })
  async excelExport(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @Body(new ZodBody(reportRunBodySchema)) body: z.infer<typeof reportRunBodySchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.reports.run(
      reportTypeKey,
      documentId,
      'EXCEL',
      user,
      new Date(),
      body.textOverrides,
    );
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروجی PDF با رندر Chromium بدون شبکه و بدون JavaScript' })
  async pdfExport(
    @Param('reportTypeKey') reportTypeKey: string,
    @Param('documentId') documentId: string,
    @Body(new ZodBody(reportRunBodySchema)) body: z.infer<typeof reportRunBodySchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.reports.run(
      reportTypeKey,
      documentId,
      'PDF',
      user,
      new Date(),
      body.textOverrides,
      // PDF از همان HTML چاپی ساخته می‌شود؛ پس همان چیدمان کاغذ.
      'print',
    );
    const html = this.reports.renderHtml(result.report);
    const margins = result.report.page.margins;

    const buffer = await this.pdf.render(html, {
      // اندازهٔ کاغذِ قالب، نه یک A4 ثابت.
      pageSize: PDF_PAPER_SIZE[result.report.page.size],
      landscape: result.report.page.orientation === 'landscape',
      marginsMm: {
        top: margins.top,
        bottom: margins.bottom,
        left: margins.inlineEnd,
        right: margins.inlineStart,
      },
      // شمارهٔ صفحه را فقط چاپگر می‌داند؛ HTML این بلوک را رندر نمی‌کند.
      pageNumberTemplate: pageNumberTemplateOf(result.report),
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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'فاکتورهای تشکیل‌دهنده یک ردیف گزارش' })
  async amountDetails(
    @Param('documentId') documentId: string,
    @Param('vendorId') vendorId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productTypes.amountDetails(documentId, vendorId, user);
  }

  /**
   * جزئیات یک مقصد پرداخت در گزارش شبای ذینفعان.
   *
   * کلید مقصد در **بدنه** می‌رود و نه در مسیر: شبا و شناسهٔ قبض در آن هستند و
   * نشانی صفحه جای داده‌ای نیست که در لاگ و تاریخچهٔ مرورگر بماند (docs/10).
   */
  @RequirePermission('report:run')
  @ReadOnlyRoute()
  @Post('documents/:documentId/beneficiaries/details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'فاکتورهای تشکیل‌دهنده یک ردیف شبای ذینفعان' })
  async beneficiaryDetails(
    @Param('documentId') documentId: string,
    @Body(new ZodBody(beneficiaryKeySchema)) body: z.infer<typeof beneficiaryKeySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.beneficiaries.details(documentId, body.key, user);
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
    return this.productTypes.set(documentId, vendorId, body, user);
  }

  /** گزینه‌های شرح یک ردیفِ فرم ریزهزینه. */
  @RequirePermission('report:run')
  @ReadOnlyRoute()
  @Post('documents/:documentId/invoices/:invoiceId/line-title/suggestions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'شرح پیش‌فرض و انواع کالا برای یک ردیف فرم ریزهزینه' })
  async lineTitleSuggestions(
    @Param('documentId') documentId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportLines.suggestions(documentId, invoiceId, user);
  }

  /**
   * تعیین شرح یک ردیفِ فرم ریزهزینه.
   *
   * مجوزش `document:update` است و نه `report:run`: عوض کردن عبارتی که روی فرم
   * چاپی می‌نشیند، نوشتن روی سند است و نه گرفتن گزارش — همان مرزی که «نوع کالا»
   * در گزارش مالیات دارد.
   */
  @RequirePermission('document:update')
  @Post('documents/:documentId/invoices/:invoiceId/line-title')
  @ApiOperation({ summary: 'تعیین شرح یک ردیف فرم ریزهزینه' })
  async setLineTitle(
    @Param('documentId') documentId: string,
    @Param('invoiceId') invoiceId: string,
    @Body(new ZodBody(setLineTitleSchema)) body: z.infer<typeof setLineTitleSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportLines.set(documentId, invoiceId, body, user);
  }

  // ───────────────────────── طراح گزارش (فاز ۷) ─────────────────────────

  @RequirePermission('report_template:read')
  @Get('definitions')
  @ApiOperation({ summary: 'فهرست قالب‌های گزارش' })
  async definitions(@Query('includeArchived') includeArchived?: string) {
    return this.templates.list(includeArchived === 'true');
  }

  @RequirePermission('report_template:read')
  @Get('definitions/:definitionId')
  @ApiOperation({ summary: 'جزئیات یک قالب و نسخه‌هایش' })
  async definitionDetail(@Param('definitionId') definitionId: string) {
    return this.templates.detail(definitionId);
  }

  @RequirePermission('report_template:read')
  @Get('signatories')
  @ApiOperation({ summary: 'نقش‌های امضاکننده فعال، برای تنظیم بلوک امضا' })
  async signatories() {
    return this.templates.signatories();
  }

  @RequirePermission('report_template:read')
  @Get('versions/:versionId')
  @ApiOperation({ summary: 'محتوای JSON یک نسخه قالب' })
  async templateVersion(@Param('versionId') versionId: string) {
    return this.templates.version(versionId);
  }

  @RequirePermission('report_template:write')
  @Post('definitions/:definitionId/copy')
  @ApiOperation({ summary: 'کپی یک قالب (قالب سیستمی فقط از این راه ویرایش می‌شود)' })
  async copyTemplate(
    @Param('definitionId') definitionId: string,
    @Body(new ZodBody(copyTemplateSchema)) body: z.infer<typeof copyTemplateSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.copy(definitionId, body.name, user);
  }

  @RequirePermission('report_template:write')
  @Post('definitions/:definitionId/draft')
  @ApiOperation({ summary: 'ذخیره پیش‌نویس قالب — نسخه منتشرشده دست‌نخورده می‌ماند' })
  async saveDraft(
    @Param('definitionId') definitionId: string,
    @Body(new ZodBody(saveDraftSchema)) body: { template: unknown },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.saveDraft(definitionId, body.template, user);
  }

  /** اعتبارسنجی بدون ذخیره — تا طراح همان لحظه خطا را نشان دهد. */
  @RequirePermission('report_template:write')
  @ReadOnlyRoute()
  @Post('templates/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'اعتبارسنجی ساختار قالب بدون ذخیره' })
  async checkTemplate(@Body(new ZodBody(saveDraftSchema)) body: { template: unknown }) {
    return this.templates.check(body.template);
  }

  @RequirePermission('report_template:write')
  @Patch('definitions/:definitionId')
  @ApiOperation({ summary: 'تغییر نام قالب' })
  async renameTemplate(
    @Param('definitionId') definitionId: string,
    @Body(new ZodBody(copyTemplateSchema)) body: z.infer<typeof copyTemplateSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.rename(definitionId, body.name, user);
  }

  /**
   * فعال‌کردن یک قالب برای نوع گزارشش.
   *
   * مسیر جداگانه و با مجوز انتشار: این اقدام تعیین می‌کند خروجی **رسمی** سازمان از
   * کدام قالب ساخته شود، پس نباید عارضه جانبی ذخیره یا انتشار باشد.
   */
  @RequirePermission('report_template:write')
  @Post('definitions/:definitionId/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'بایگانی قالب — از فهرست پیش‌فرض بیرون می‌رود، پاک نمی‌شود' })
  async archiveTemplate(
    @Param('definitionId') definitionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.archive(definitionId, user);
  }

  @RequirePermission('report_template:publish')
  @Idempotent()
  @Post('definitions/:definitionId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'انتخاب این قالب به‌عنوان قالب فعال نوع گزارش' })
  async activateTemplate(
    @Param('definitionId') definitionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.activate(definitionId, user);
  }

  @RequirePermission('report_template:publish')
  @Idempotent()
  @Post('versions/:versionId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'انتشار نسخه؛ پس از آن تغییرناپذیر است' })
  async publishVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templates.publish(versionId, user);
  }

  /** پیش‌نمایش طراح روی یک نسخه مشخص (پیش‌نویس یا منتشرشده) با داده واقعی. */
  @RequirePermission('report:run', 'report_template:read')
  @Post('versions/:versionId/documents/:documentId/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'اجرای یک نسخه مشخص قالب روی یک سند' })
  async previewVersion(
    @Param('versionId') versionId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.reports.runVersion(versionId, documentId, 'HTML', user);
    return {
      runId: result.runId,
      rowCount: result.rowCount,
      skippedInvoiceCount: result.skippedInvoiceCount,
      // و چند فاکتور بدون روش پرداخت از گزارش شبا — دو دلیل جدا، دو شمارنده.
      skippedPaymentCount: result.skippedPaymentCount,
      rowVendorIds: result.rowVendorIds,
      rowKeys: result.rowKeys,
      report: serializeReport(result.report),
    };
  }

  /**
   * بازتولید یک خروجی تاریخی با همان نسخه قالبِ آن اجرا.
   *
   * این مسیر چیزی است که ادعای «انتشار نسخه ۲ خروجی نسخه ۱ را عوض نمی‌کند» را قابل
   * **اثبات** می‌کند، نه فقط قابل ادعا.
   */
  @RequirePermission('report:run', 'report:read_history')
  @Post('runs/:runId/reproduce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'بازتولید خروجی یک اجرای قبلی با همان نسخه قالب' })
  async reproduceRun(
    @Param('runId') runId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.reports.reproduce(runId, user);
    return {
      runId: result.runId,
      rowCount: result.rowCount,
      skippedInvoiceCount: result.skippedInvoiceCount,
      // و چند فاکتور بدون روش پرداخت از گزارش شبا — دو دلیل جدا، دو شمارنده.
      skippedPaymentCount: result.skippedPaymentCount,
      rowVendorIds: result.rowVendorIds,
      rowKeys: result.rowKeys,
      report: serializeReport(result.report),
    };
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
