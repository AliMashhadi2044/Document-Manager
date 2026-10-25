import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { listQuerySchema } from '../../common/query/list-query';
import { ArchiveService } from './archive.service';

const archiveInfoSchema = z.object({
  documentNumber: z.string().trim().min(1, 'شماره سند الزامی است').max(50),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'قالب تاریخ باید YYYY-MM-DD باشد'),
  notes: z.string().trim().max(2000).nullable().default(null),
});

/**
 * وضعیت پرداخت.
 *
 * مبالغ **رشتهٔ رقمی** هستند، نه `number` — همان قرارداد مرز API (ADR-0003).
 * در «پرداخت کامل» هیچ مبلغی گرفته نمی‌شود: سرور از مبلغ خود سند مشتقشان می‌کند.
 */
const paymentStatusSchema = z.object({
  status: z.enum(['FULLY_PAID', 'OUTSTANDING']),
  paidAmount: z
    .string()
    .regex(/^\d+$/, 'مبلغ باید عدد صحیح ریالی باشد')
    .max(30)
    .nullable()
    .default(null),
  outstandingAmount: z
    .string()
    .regex(/^\d+$/, 'مبلغ باید عدد صحیح ریالی باشد')
    .max(30)
    .nullable()
    .default(null),
});

const inboxQuerySchema = listQuerySchema.extend({
  status: z.enum(['PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION']).optional(),
  fiscalYear: z.coerce.number().int().min(1300).max(1500).optional(),
  hasOpenFeedback: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  paymentStatus: z.enum(['FULLY_PAID', 'OUTSTANDING', 'UNSET']).optional(),
});

@ApiTags('archive')
@Controller('archive')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @RequirePermission('archive:read')
  @Get('inbox')
  @ApiOperation({ summary: 'کارتابل بایگانی با فیلتر وضعیت، سال مالی و بازخورد باز' })
  async inbox(
    @Query(new ZodBody(inboxQuerySchema)) query: z.infer<typeof inboxQuerySchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.archive.inbox(query, user);
  }

  @RequirePermission('archive:read')
  @Get('documents/:documentId')
  @ApiOperation({ summary: 'اطلاعات بایگانی یک سند' })
  async detail(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.archive.detail(documentId, user);
  }

  @RequirePermission('archive:write')
  @Put('documents/:documentId/info')
  @ApiOperation({ summary: 'ثبت شماره و تاریخ سند و توضیح بایگانی' })
  async saveInfo(
    @Param('documentId') documentId: string,
    @Body(new ZodBody(archiveInfoSchema)) body: z.infer<typeof archiveInfoSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.archive.saveInfo(documentId, body, user);
  }

  @RequirePermission('archive:write')
  @Put('documents/:documentId/payment')
  @ApiOperation({ summary: 'ثبت وضعیت پرداخت سند: پرداخت کامل یا نیازمندی' })
  async paymentStatus(
    @Param('documentId') documentId: string,
    @Body(new ZodBody(paymentStatusSchema)) body: z.infer<typeof paymentStatusSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.archive.paymentStatus(documentId, body, user);
  }

  @RequirePermission('archive:write')
  @Idempotent()
  @Post('documents/:documentId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'نهایی کردن بایگانی سند. هدر Idempotency-Key الزامی است.',
  })
  async complete(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.archive.complete(documentId, user);
  }
}
