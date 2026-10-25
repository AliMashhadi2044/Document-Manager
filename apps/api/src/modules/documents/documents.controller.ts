import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { DocumentTrashService } from './document-trash.service';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { listQuerySchema } from '../../common/query/list-query';
import { DocumentsService } from './documents.service';
import { InvoicesService } from '../invoices/invoices.service';
import { createInvoiceSchema } from '../invoices/invoice.schema';
import { UtilityDuplicateService } from '../invoices/utility-duplicate.service';

/**
 * متنِ اختیاری که رشتهٔ خالی را `null` می‌کند.
 *
 * فرم برای فیلد خالی رشتهٔ خالی می‌فرستد، نه `null`؛ بدون این تبدیل، «خالی» در
 * پایگاه داده به‌صورت `''` می‌نشست و با «ثبت‌نشده» فرق می‌کرد — دو حالت برای یک
 * واقعیت.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value === null || value === '' ? null : value));

/** تاریخ میلادیِ `YYYY-MM-DD`؛ تبدیل از شمسی سمت کلاینت انجام شده است. */
const optionalIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'قالب تاریخ باید YYYY-MM-DD باشد')
  .nullable()
  .default(null);

const stadSchema = z.object({
  // سقف ۵۰ نویسه طبق §۹ پرامپت. **اختیاری**: سند ستاد ممکن است پیش از گرفتن
  // شمارهٔ نیاز ثبت شود و الزامی بودنش، کار را همان اول متوقف می‌کرد.
  needNumber: optionalText(50),
  requestNumber: z.string().trim().min(1, 'شماره درخواست الزامی است').max(100),
  requestTypeId: z.string().uuid().nullable().default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
});

const createDocumentSchema = z
  .object({
    title: z.string().trim().min(1, 'شرح سند الزامی است').max(500),
    type: z.enum(['NORMAL', 'STAD']),
    fiscalYear: z.coerce.number().int().min(1300).max(1500),
    jalaliYear: z.coerce.number().int().min(1300).max(1500),
    buyerEntityId: z.string().uuid('مجموعه خریدار را انتخاب کنید'),
    /*
      شماره و تاریخ گردش — بیرون از `stad` و برای **هر دو نوع سند**.

      گردش کاغذی به ستاد ربطی ندارد؛ جای قبلی‌اش (داخل اطلاعات ستاد) یعنی سند
      عادی اصلاً نمی‌توانست ثبتش کند.
    */
    workflowNumber: optionalText(100),
    workflowDate: optionalIsoDate,
    stad: stadSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'STAD' && value.stad === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stad'],
        message: 'برای سند سامانه ستاد، اطلاعات ستاد الزامی است',
      });
    }
  });

/**
 * ویرایش مشخصات سند، پیش از ثبت نهایی.
 *
 * همان فیلدهایی که هنگام ساخت پرسیده می‌شوند، منهای **نوع سند**: نوع، ساختار سند را
 * تعیین می‌کند (سند ستاد فقط یک فاکتور می‌گیرد و جدول اطلاعات ستاد دارد) و روی
 * فاکتورها هم denormal شده است. عوض کردنش یعنی ساختن سندی دیگر، نه ویرایش این یکی.
 */
const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1, 'شرح سند الزامی است').max(500),
    fiscalYear: z.coerce.number().int().min(1300).max(1500),
    jalaliYear: z.coerce.number().int().min(1300).max(1500),
    buyerEntityId: z.string().uuid('مجموعه خریدار را انتخاب کنید'),
    stad: stadSchema.nullable(),
  })
  .partial();

/** پارامترهای بررسی تکرار — هر دو الزامی، چون بدون هر کدام سؤال بی‌معناست. */
const utilityDuplicateQuery = z.object({
  schoolId: z.string().uuid(),
  utilityTypeId: z.string().uuid(),
});

const reasonSchema = z.object({
  reason: z.string().trim().min(1, 'ثبت دلیل الزامی است').max(2000),
});

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly invoices: InvoicesService,
    private readonly utilityDuplicates: UtilityDuplicateService,
    private readonly trashService: DocumentTrashService,
  ) {}

  @RequirePermission('document:read')
  @Get()
  @ApiOperation({ summary: 'فهرست اسناد، محدود به دامنه دسترسی نقش کاربر' })
  async list(
    @Query(new ZodBody(listQuerySchema)) query: ReturnType<typeof listQuerySchema.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.list(query, user);
  }

  @RequirePermission('document:read')
  @Get(':id')
  @ApiOperation({ summary: 'جزئیات سند با فاکتورهای مرتب‌شده بر اساس تاریخ صورتحساب' })
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.get(id, user);
  }

  @RequirePermission('document:read_history')
  @Get(':id/history')
  @ApiOperation({ summary: 'تاریخچه تغییرات سند' })
  async history(@Param('id') id: string) {
    return this.documents.history(id);
  }

  @RequirePermission('document:read_history')
  @Get(':id/revisions')
  @ApiOperation({ summary: 'نسخه‌های ثبت‌شده سند' })
  async revisions(@Param('id') id: string) {
    return this.documents.revisions(id);
  }

  @RequirePermission('document:create')
  @Post()
  @ApiOperation({ summary: 'ایجاد سند جدید' })
  async create(
    @Body(new ZodBody(createDocumentSchema)) body: z.infer<typeof createDocumentSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.create(body, user);
  }

  @RequirePermission('document:update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(updateDocumentSchema)) body: z.infer<typeof updateDocumentSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.update(id, body, user);
  }

  /**
   * انتقال به سطل زباله.
   *
   * در هیچ مرحله‌ای ردیفی پاک نمی‌شود؛ این مسیر فقط `deleted_at` را پر می‌کند و سند
   * از همه‌جا — فهرست، داشبورد، گزارش‌ها و قاعده‌های کنترلی — کنار می‌رود. برگرداندن و
   * پاک کردن واقعی، هر دو از سطل زباله انجام می‌شوند.
   */
  @RequirePermission('document:delete')
  @Post(':id/trash')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'انتقال سند به سطل زباله (حذف نرم)' })
  async trash(
    @Param('id') id: string,
    @Body(new ZodBody(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trashService.softDelete(id, body.reason, user);
  }

  @RequirePermission('document:finalize')
  @Idempotent()
  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'ثبت نهایی سند — تراکنشی، با بازمحاسبه کامل مالی. هدر Idempotency-Key الزامی است.',
  })
  async finalize(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const document = await this.documents.finalize(id, user);
    return {
      document,
      // پیشنهاد چاپ پس از ثبت (§۱۸) — مشروط، نه الزام ثابت.
      suggestedReport: { key: 'TAX_REPORT', titleFa: 'خروجی مالیات' },
    };
  }

  @RequirePermission('document:reopen')
  @Idempotent()
  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'بازگشایی سند با ثبت علت الزامی' })
  async reopen(
    @Param('id') id: string,
    @Body(new ZodBody(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.reopen(id, body.reason, user);
  }

  @RequirePermission('document:send_to_archive')
  @Idempotent()
  @Post(':id/send-to-archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ارجاع سند به بایگانی' })
  async sendToArchive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.sendToArchive(id, user);
  }

  /**
   * ارجاع برای اصلاح — اقدام ناظر.
   *
   * مجوزش `feedback:create` است (جدول `TRANSITIONS`)، یعنی همان کسی که حق دیدن ایراد
   * و ثبتش را دارد. کارپردازی این مجوز را ندارد و نمی‌تواند سند خودش را برگشت بزند.
   */
  @RequirePermission('feedback:create')
  @Idempotent()
  @Post(':id/send-back')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ارجاع سند برای اصلاح، با ثبت علت الزامی' })
  async sendBack(
    @Param('id') id: string,
    @Body(new ZodBody(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.sendBackForRevision(id, body.reason, user);
  }

  /**
   * هشدار پرداخت تکراری انشعاب، **پیش از** پر کردن بقیهٔ فرم.
   *
   * چرا یک مسیر جدا و نه فقط خطای ۴۰۹ هنگام ثبت: کاربر باید همان لحظه‌ای که مدرسه و
   * نوع انشعاب را انتخاب می‌کند بفهمد، نه بعد از وارد کردن مبلغ و روش پرداخت.
   */
  @RequirePermission('invoice:create')
  @Get(':id/utility-duplicate')
  @ApiOperation({ summary: 'بررسی پرداخت قبلی همین انشعاب برای همین مدرسه' })
  async utilityDuplicate(
    @Param('id') documentId: string,
    @Query(new ZodBody(utilityDuplicateQuery)) query: z.infer<typeof utilityDuplicateQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // از همان مسیری خوانده می‌شود که دامنهٔ دسترسی را اعمال می‌کند: سند خارج از
    // دامنهٔ کاربر ۴۰۴ می‌گیرد و سال مالی‌اش هم لو نمی‌رود.
    const document = await this.documents.get(documentId, user);

    const duplicate = await this.utilityDuplicates.find({
      schoolId: query.schoolId,
      utilityTypeId: query.utilityTypeId,
      fiscalYear: document.fiscalYear,
    });

    return {
      duplicate,
      message: duplicate === null ? null : this.utilityDuplicates.describe(duplicate),
    };
  }

  @RequirePermission('invoice:create')
  @Post(':id/invoices')
  @ApiOperation({ summary: 'افزودن فاکتور به سند' })
  async addInvoice(
    @Param('id') documentId: string,
    @Body(new ZodBody(createInvoiceSchema)) body: z.infer<typeof createInvoiceSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.create(documentId, body, user);
  }

  @RequirePermission('document:read')
  @Get('invoices/:invoiceId/draft')
  @ApiOperation({ summary: 'فاکتور به شکل ورودی ساخت، برای پر کردن فرم ویرایش' })
  async invoiceDraft(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.draft(invoiceId, user);
  }

  /**
   * ویرایش فاکتور — بدنه‌اش **همان** بدنهٔ ساخت است.
   *
   * ویرایش، بازسازی فاکتور در جای خودش است و نه وصله زدن؛ پس همان ورودی کامل
   * می‌آید و همان قاعده‌ها رویش اجرا می‌شوند. شناسهٔ فاکتور و جایگاهش در سند
   * می‌مانند، تا ارجاع‌های بیرونی نشکنند.
   */
  @RequirePermission('invoice:update')
  @Put('invoices/:invoiceId')
  @ApiOperation({ summary: 'ویرایش فاکتور، پیش از ثبت نهایی' })
  async updateInvoice(
    @Param('invoiceId') invoiceId: string,
    @Body(new ZodBody(createInvoiceSchema)) body: z.infer<typeof createInvoiceSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.update(invoiceId, body, user);
  }

  @RequirePermission('invoice:delete')
  @Delete('invoices/:invoiceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeInvoice(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.invoices.remove(invoiceId, user);
  }
}
