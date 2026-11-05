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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { listQuerySchema } from '../../common/query/list-query';
import { DocumentTrashService } from './document-trash.service';

/**
 * تأیید صریح حذف دائمی.
 *
 * یک کلیک، برای کاری که برگشت ندارد کافی نیست: بدنهٔ درخواست باید عبارت تأیید را
 * داشته باشد، پس یک تماس تصادفی یا یک دکمهٔ اشتباه‌کلیک‌شده کاری نمی‌کند.
 */
const confirmSchema = z.object({
  confirm: z.literal('DELETE', { error: () => 'برای حذف دائمی، تأیید صریح لازم است' }),
});

/**
 * سطل زباله سند.
 *
 * **چرا پیشوند جداست و نه `documents/trash`**: مسیر `documents/:id` هر چیزی را که
 * بعد از `documents/` بیاید می‌بلعد و درستی مسیرها به ترتیب ثبت کنترلرها وابسته
 * می‌شد — همان وابستگی شکننده‌ای که یک‌بار برای `base-data/lookups` هزینه داد.
 */
@ApiTags('documents')
@Controller('document-trash')
export class DocumentTrashController {
  constructor(private readonly trash: DocumentTrashService) {}

  @RequirePermission('document:read')
  @Get()
  @ApiOperation({ summary: 'فهرست اسناد حذف‌شده، در دامنه دسترسی نقش کاربر' })
  async list(
    @Query(new ZodBody(listQuerySchema)) query: ReturnType<typeof listQuerySchema.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trash.list(query, user);
  }

  @RequirePermission('document:read')
  @Get(':id')
  @ApiOperation({ summary: 'جزئیات کامل یک سند حذف‌شده، با فاکتورهایش' })
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trash.get(id, user);
  }

  /**
   * تداخل‌های بازگرداندن، **پیش از** عمل.
   *
   * رابط با همین، دکمهٔ بازگرداندن را غیرفعال می‌کند و می‌گوید با کدام سند تداخل
   * دارد؛ خودِ بازگرداندن هم دوباره می‌سنجد.
   */
  @RequirePermission('document:read')
  @Get(':id/restore-conflicts')
  @ApiOperation({ summary: 'تداخل‌های احتمالی بازگرداندن، بدون تغییر دادن چیزی' })
  async conflicts(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { conflicts: await this.trash.restoreConflicts(id, user) };
  }

  @RequirePermission('document:restore')
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'بازگرداندن سند از سطل زباله' })
  async restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.trash.restore(id, user);
  }

  /**
   * حذف دائمی.
   *
   * تنها جایی که داده واقعاً از بین می‌رود، با مجوز جدا (`document:purge`) و فقط
   * روی سندی که از قبل در سطل زباله است.
   */
  @RequirePermission('document:purge')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'حذف دائمی سند از سطل زباله — برگشت‌ناپذیر' })
  async purge(
    @Param('id') id: string,
    @Body(new ZodBody(confirmSchema)) body: z.infer<typeof confirmSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    // `body` فقط برای اعتبارسنجی عبارت تأیید است؛ مقدارش جای دیگری به کار نمی‌آید.
    void body;
    await this.trash.purge(id, user);
  }
}
