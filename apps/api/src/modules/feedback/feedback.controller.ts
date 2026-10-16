import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { listQuerySchema } from '../../common/query/list-query';
import { FeedbackService } from './feedback.service';

const createFeedbackSchema = z
  .object({
    targetKind: z.enum([
      'DOCUMENT',
      'STAD_META',
      'VENDOR',
      'INVOICE',
      'INVOICE_ITEM',
      'PAYMENT',
      'ARCHIVE',
      'TAX_REPORT',
    ]),
    invoiceId: z.string().uuid().nullable().default(null),
    invoiceItemId: z.string().uuid().nullable().default(null),
    sectionKey: z.string().trim().max(100).nullable().default(null),
    body: z.string().trim().min(1, 'متن بازخورد الزامی است').max(4000),
  })
  .superRefine((value, ctx) => {
    // همان قیدی که در دیتابیس هم هست؛ اینجا پیام فارسی بهتری می‌دهد.
    const needsInvoice = ['INVOICE', 'INVOICE_ITEM', 'PAYMENT'].includes(value.targetKind);
    if (needsInvoice && value.invoiceId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invoiceId'],
        message: 'برای این نوع بازخورد، انتخاب فاکتور الزامی است',
      });
    }
    if (value.targetKind === 'INVOICE_ITEM' && value.invoiceItemId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invoiceItemId'],
        message: 'برای بازخورد روی ردیف، انتخاب ردیف الزامی است',
      });
    }
    if (!needsInvoice && (value.invoiceId !== null || value.invoiceItemId !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invoiceId'],
        message: 'این نوع بازخورد به فاکتور یا ردیف اشاره نمی‌کند',
      });
    }
  });

const replySchema = z.object({
  body: z.string().trim().min(1, 'متن پاسخ الزامی است').max(4000),
});

const statusSchema = z.object({
  status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED', 'REJECTED']),
  note: z.string().trim().max(2000).nullable().default(null),
});

const feedbackQuerySchema = listQuerySchema.extend({
  status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED', 'REJECTED']).optional(),
  documentId: z.string().uuid().optional(),
});

/**
 * بازخورد ناظر و پاسخ کارپردازی.
 *
 * تفکیک وظایف در خود مجوزها نشسته است (ماتریس نقش‌ها، تصمیم D9):
 *  - `feedback:create` فقط نقش ناظر دارد ⇒ کارپردازی نمی‌تواند بازخورد بسازد
 *    (معیار پذیرش ۳ فاز ۵).
 *  - `feedback:reply` فقط کارپردازی دارد ⇒ ناظر به بازخورد خودش پاسخ نمی‌دهد.
 *
 * **هیچ مسیر حذفی وجود ندارد** و این یک فراموشی نیست: بازخورد حذف نمی‌شود.
 */
@ApiTags('feedback')
@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @RequirePermission('feedback:read')
  @Get('feedbacks')
  @ApiOperation({ summary: 'کارتابل بازخوردها با فیلتر وضعیت و سند' })
  async list(
    @Query(new ZodBody(feedbackQuerySchema)) query: z.infer<typeof feedbackQuerySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedback.list(query, user);
  }

  @RequirePermission('feedback:read')
  @Get('feedbacks/:id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.feedback.get(id, user);
  }

  @RequirePermission('feedback:create')
  @Post('documents/:documentId/feedbacks')
  @ApiOperation({ summary: 'ثبت بازخورد روی سند، فاکتور، ردیف یا بخش' })
  async create(
    @Param('documentId') documentId: string,
    @Body(new ZodBody(createFeedbackSchema)) body: z.infer<typeof createFeedbackSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedback.create(documentId, body, user);
  }

  @RequirePermission('feedback:reply')
  @Post('feedbacks/:id/replies')
  @ApiOperation({ summary: 'پاسخ کارپردازی به بازخورد' })
  async reply(
    @Param('id') id: string,
    @Body(new ZodBody(replySchema)) body: z.infer<typeof replySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedback.reply(id, body.body, user);
  }

  /**
   * تغییر وضعیت رسیدگی.
   *
   * دو نقش دو کار متفاوت می‌کنند: کارپردازی می‌بندد (`feedback:resolve`) و ناظر
   * بازگشایی می‌کند (`feedback:reopen`). پس دروازه مسیر «یکی از این دو» است و
   * جدول گذارها در سرویس تعیین می‌کند هر مجوز کدام گذار را باز می‌کند.
   */
  @RequireAnyPermission('feedback:resolve', 'feedback:reopen')
  @Patch('feedbacks/:id/status')
  @ApiOperation({ summary: 'تغییر وضعیت رسیدگی — با ثبت در تاریخچه' })
  async changeStatus(
    @Param('id') id: string,
    @Body(new ZodBody(statusSchema)) body: z.infer<typeof statusSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedback.changeStatus(id, body.status, body.note, user);
  }
}
