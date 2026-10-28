import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { reportQuerySchema } from '@dm/shared';

import {
  CurrentUser,
  ReadOnlyRoute,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { AnalyticsService } from './analytics.service';
import { DashboardService, type SettlementView } from './dashboard.service';
import { ExportService } from './export.service';
import { SharedReportsService } from './shared-reports.service';
import { ViewsService } from './views.service';

/** نماهای مجاز وضعیت پرداخت؛ ورودی ناشناخته به «همه» می‌افتد، نه خطا. */
const SETTLEMENT_VIEWS: readonly SettlementView[] = ['all', 'FULLY_PAID', 'OUTSTANDING', 'UNSET'];

const shareReportSchema = z.object({
  datasetKey: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1, 'عنوان گزارش الزامی است').max(200),
  description: z.string().trim().max(4000).optional(),
  query: z.unknown(),
});

const saveViewSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'نام نما الزامی است').max(120),
  isShared: z.boolean().default(false),
  query: z.unknown(),
});

/**
 * گزارش‌گیری عمومی (فاز ۸).
 *
 * الگوی مسیرها: اجرای گزارش یک **POST فقط-خواننده** است. بدنه لازم است چون درخواست
 * (درخت فیلتر، فهرست ستون‌ها، مرتب‌سازی) در URL جا نمی‌شود؛ ولی هیچ‌چیز نوشته
 * نمی‌شود و نشان `@ReadOnlyRoute()` همین را اعلام می‌کند — همان قاعده‌ای که تست
 * تفکیک وظایف روی مسیرهای واقعی بررسی می‌کند.
 *
 * خروجی فایل اما **می‌نویسد** (ردپای حسابرسی، و برای خروجی حجیم یک ردیف کار)، پس
 * نشان فقط-خواندنی ندارد.
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly views: ViewsService,
    private readonly exports: ExportService,
    private readonly dashboard: DashboardService,
    private readonly shared: SharedReportsService,
  ) {}

  // ───────────────────────── گزارش‌های ارسالی ─────────────────────────

  /*
    مسیرهای «گزارش‌های ارسالی» **پیش از** مسیرهای `:datasetKey` می‌آیند.

    وگرنه `GET /analytics/shared-reports` با `GET /analytics/:datasetKey/views`
    اشتباه نمی‌شد ولی `shared-reports` به‌عنوان نام یک مجموعه‌داده خوانده می‌شد و
    کاربر «این گزارش وجود ندارد» می‌گرفت.
  */
  @RequirePermission('report:share')
  @Post('shared-reports')
  @ApiOperation({ summary: 'ارسال گزارش با عنوان و شرح برای بررسی' })
  async shareReport(
    @Body(new ZodBody(shareReportSchema)) body: z.infer<typeof shareReportSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shared.send(body, user);
  }

  @RequirePermission('report:run')
  @Get('shared-reports')
  @ApiOperation({ summary: 'گزارش‌های ارسالی که این کاربر می‌بیند' })
  async listSharedReports(@CurrentUser() user: AuthenticatedUser) {
    return this.shared.list(user);
  }

  @RequirePermission('report:run')
  @Get('shared-reports/:id')
  @ApiOperation({ summary: 'تعریف کامل یک گزارش ارسالی' })
  async getSharedReport(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shared.get(id, user);
  }

  @RequirePermission('report:run')
  @Get('datasets')
  @ApiOperation({ summary: 'گزارش‌های در دسترس این کاربر و فیلدهایشان' })
  datasets(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.describeDatasets(user);
  }

  @RequirePermission('report:run')
  @ReadOnlyRoute()
  @Post(':datasetKey/query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'اجرای گزارش با فیلتر و مرتب‌سازی و صفحه‌بندی سمت سرور' })
  async query(
    @Param('datasetKey') datasetKey: string,
    @Body(new ZodBody(reportQuerySchema)) body: z.infer<typeof reportQuerySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analytics.run(datasetKey, body, user);
  }

  /**
   * تعداد ردیف و اینکه خروجی به صف می‌رود یا هم‌زمان ساخته می‌شود.
   *
   * جدا از خودِ خروجی است تا رابط کاربری بتواند **پیش از** زدن دکمه بگوید «این
   * خروجی ۱۲٬۰۰۰ ردیف دارد و به صف می‌رود» — نه اینکه کاربر دکمه بزند و منتظر چیزی
   * بماند که نمی‌داند چقدر طول می‌کشد.
   */
  @RequirePermission('report:export')
  @ReadOnlyRoute()
  @Post(':datasetKey/export/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'برآورد تعداد ردیف خروجی و مسیر ساختش' })
  async exportPlan(
    @Param('datasetKey') datasetKey: string,
    @Body(new ZodBody(reportQuerySchema)) body: z.infer<typeof reportQuerySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exports.plan(datasetKey, body, user);
  }

  @RequirePermission('report:export')
  @Post(':datasetKey/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروجی Excel هم‌زمان — همان فیلتر و مرتب‌سازی جدول' })
  async exportNow(
    @Param('datasetKey') datasetKey: string,
    @Body(new ZodBody(reportQuerySchema)) body: z.infer<typeof reportQuerySchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.exports.buildNow(datasetKey, body, user);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Row-Count', String(result.rowCount));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    response.send(result.buffer);
  }

  @RequirePermission('report:export')
  @Idempotent()
  @Post(':datasetKey/export/queue')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'ارسال خروجی حجیم به صف؛ لینک دانلود موقت می‌دهد' })
  async queueExport(
    @Param('datasetKey') datasetKey: string,
    @Body(new ZodBody(reportQuerySchema)) body: z.infer<typeof reportQuerySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exports.enqueue(datasetKey, body, user);
  }

  @RequirePermission('report:export')
  @Get('exports')
  @ApiOperation({ summary: 'کارهای خروجی خودِ کاربر' })
  async myExports(@CurrentUser() user: AuthenticatedUser) {
    return this.exports.listMine(user);
  }

  @RequirePermission('report:export')
  @Get('exports/:jobId')
  @ApiOperation({ summary: 'وضعیت یک کار خروجی' })
  async exportStatus(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.exports.status(jobId, user);
  }

  @RequirePermission('report:export')
  @Get('exports/:jobId/download')
  @ApiOperation({ summary: 'دانلود خروجی آماده — فقط درخواست‌کننده و پیش از انقضا' })
  async downloadExport(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const { stream, filename } = await this.exports.download(jobId, user);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    stream.pipe(response);
  }

  // ───────────────────────── نماهای ذخیره‌شده ─────────────────────────

  @RequirePermission('report:run')
  @Get(':datasetKey/views')
  @ApiOperation({ summary: 'نماهای ذخیره‌شده این گزارش' })
  async listViews(
    @Param('datasetKey') datasetKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.views.list(datasetKey, user);
  }

  @RequirePermission('report:run')
  @Post(':datasetKey/views')
  @ApiOperation({ summary: 'ذخیره یا به‌روزرسانی نما' })
  async saveView(
    @Param('datasetKey') datasetKey: string,
    @Body(new ZodBody(saveViewSchema)) body: z.infer<typeof saveViewSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.views.save(datasetKey, body, user);
  }

  @RequirePermission('report:run')
  @Delete('views/:viewId')
  @ApiOperation({ summary: 'حذف نمای خودِ کاربر' })
  async deleteView(@Param('viewId') viewId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.views.remove(viewId, user);
  }

  // ───────────────────────── داشبورد ─────────────────────────

  @RequirePermission('report:run')
  @Get('dashboard')
  @ApiOperation({ summary: 'خلاصه تجمیعی اسناد و مبالغ در دامنه دسترسی کاربر' })
  async dashboardSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year?: string,
    @Query('basis') basis?: string,
    @Query('settlement') settlement?: string,
  ) {
    const parsed = year === undefined || year === '' ? undefined : Number(year);
    const safeYear = parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
    // هر چیزی جز 'jalali' به مبنای پیش‌فرض می‌افتد؛ ورودی ناشناخته خطا نمی‌دهد.
    return this.dashboard.summary(
      user,
      safeYear,
      basis === 'jalali' ? 'jalali' : 'fiscal',
      SETTLEMENT_VIEWS.includes(settlement as SettlementView)
        ? (settlement as SettlementView)
        : 'all',
    );
  }

  @RequirePermission('report:run')
  @Get('dashboard/years')
  @ApiOperation({ summary: 'سال‌های مالی و شمسی موجود در دامنه دسترسی کاربر' })
  async dashboardYears(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.years(user);
  }
}
