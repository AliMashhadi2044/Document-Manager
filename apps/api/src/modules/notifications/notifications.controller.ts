import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { listQuerySchema } from '../../common/query/list-query';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@dm/shared';
import { NotificationsService } from './notifications.service';

/**
 * اعلان‌های کاربر.
 *
 * هیچ مسیری اعلان کاربر دیگری را برنمی‌گرداند؛ فیلتر `userId` در خود کوئری است، نه
 * بررسی بعد از خواندن. مجوز لازم همان `document:read` است، چون اعلان‌ها درباره
 * اسنادند و هر کسی که سند می‌بیند، اعلان خودش را هم می‌بیند.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @RequirePermission('document:read')
  @Get()
  @ApiOperation({ summary: 'اعلان‌های کاربر جاری؛ خوانده‌نشده‌ها اول' })
  async list(
    @Query(new ZodBody(listQuerySchema)) query: ReturnType<typeof listQuerySchema.parse>,
    @CurrentUser() user: AuthenticatedUser,
    @Query('unread') unread?: string,
    @Query('category') category?: string,
  ) {
    // هر چیزی جز 'true' یعنی همه اعلان‌ها؛ ورودی ناشناخته خطا نمی‌دهد.
    return this.notifications.list(
      query,
      user,
      unread === 'true',
      NOTIFICATION_CATEGORIES.includes(category as NotificationCategory)
        ? (category as NotificationCategory)
        : undefined,
    );
  }

  @RequirePermission('document:read')
  @Get('unread-count')
  @ApiOperation({ summary: 'تعداد اعلان خوانده‌نشده — برای نشان کنار آیکن' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user);
  }

  @RequirePermission('document:read')
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.notifications.markRead(id, user);
  }

  @RequirePermission('document:read')
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user);
  }
}
