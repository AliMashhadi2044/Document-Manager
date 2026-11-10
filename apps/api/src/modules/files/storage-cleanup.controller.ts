import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { StorageCleanupService } from './storage-cleanup.service';

/**
 * کلید شیء از **خودِ ذخیره‌سازی** می‌آید و برمی‌گردد؛ ولی چیزی که از مرورگر
 * می‌رسد، همیشه ورودی کاربر است.
 *
 * الگو عمداً تنگ است: کلیدهای این سامانه شکل `documents/<uuid>/<uuid>.<ext>` دارند
 * و هیچ‌کدام نقطه‌نقطه یا اسلش ابتدایی ندارند. سقف تعداد هم هست تا یک درخواست،
 * هزار حذف پشت سر هم راه نیندازد.
 */
const purgeSchema = z.object({
  keys: z
    .array(
      z
        .string()
        .min(1)
        .max(500)
        .regex(/^[A-Za-z0-9][A-Za-z0-9/._-]*$/u, 'کلید شیء بدشکل است')
        .refine((value) => !value.includes('..'), 'کلید شیء بدشکل است'),
    )
    .max(200)
    .default([]),
  recordIds: z.array(z.string().uuid()).max(200).default([]),
});

@ApiTags('storage-cleanup')
@Controller('files/storage')
export class StorageCleanupController {
  constructor(private readonly cleanup: StorageCleanupService) {}

  @RequirePermission('attachment:purge')
  @Get('orphans')
  @ApiOperation({ summary: 'فایل‌هایی که در ذخیره‌سازی هستند و به هیچ پیوستی وصل نیستند' })
  async orphans() {
    return this.cleanup.scan();
  }

  @RequirePermission('attachment:purge')
  @Post('orphans/purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'پاک کردن دائمی فایل‌های بی‌سندِ انتخاب‌شده' })
  async purge(
    @Body(new ZodBody(purgeSchema)) body: z.infer<typeof purgeSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cleanup.purge(body.keys, body.recordIds, user);
  }
}
