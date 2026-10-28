import { Injectable, Logger } from '@nestjs/common';
import type { NotificationKind, Prisma } from '@prisma/client';
import {
  NOTIFICATION_CATEGORIES,
  kindsOfCategory,
  type NotificationCategory,
  type Permission,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import {
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';

export interface NotifyInput {
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body?: string | null;
  readonly documentId?: string | null;
  readonly feedbackId?: string | null;
  readonly sharedReportId?: string | null;
}

/**
 * اعلان داخلی.
 *
 * دو تصمیم:
 *  - گیرنده با **مجوز** انتخاب می‌شود، نه با نقش. اگر فردا مجوز `feedback:reply` به
 *    نقش دیگری هم داده شود، اعلان خودبه‌خود درست می‌رود؛ فهرست نقش سفت‌شده در کد
 *    همان‌جا می‌شکست.
 *  - شکست ارسال اعلان **عملیات اصلی را زمین نمی‌زند**. اعلان یک اطلاع‌رسانی جانبی
 *    است؛ اگر ثبت بازخورد به خاطر خطای اعلان برگردد، چیز مهم‌تری را از دست داده‌ایم.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListQuery,
    user: AuthenticatedUser,
    unreadOnly = false,
    category?: NotificationCategory,
  ): Promise<PageResult<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(unreadOnly ? { readAt: null } : {}),
      /*
        فیلتر دسته **سمت سرور** است و نه در رابط.

        اگر کلاینت صفحهٔ بیست‌تایی را می‌گرفت و خودش دسته را جدا می‌کرد، یک صفحه
        می‌توانست خالی دربیاید در حالی که دسته ده اعلان دارد — و شمارنده با
        محتوا نمی‌خواند.
      */
      ...(category === undefined ? {} : { kind: { in: kindsOfCategory(category) } }),
    };

    const [items, total, unread, byCategory] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
        ...paginationArgs(query),
        include: { document: { select: { id: true, title: true, status: true } } },
      }),
      this.prisma.notification.count({ where }),
      // شمارندهٔ خوانده‌نشده‌ها همیشه روی **همه** اعلان‌هاست، نه روی فیلتر جاری.
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),

      /*
        خوانده‌نشده‌های هر دسته، برای نشان کنار کلید دسته‌ها.

        روی **همهٔ** اعلان‌های کاربر حساب می‌شود و نه روی دستهٔ انتخاب‌شده، وگرنه
        کاربری که در «پیگیری پرداخت» است، هرگز نمی‌دید که در «بازخوردها» چیزی
        منتظرش است.
      */
      this.prisma.notification.groupBy({
        by: ['kind'],
        where: { userId: user.id, readAt: null },
        _count: { _all: true },
      }),
    ]);

    const unreadByCategory = Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((name) => {
        const kinds = new Set<string>(kindsOfCategory(name));
        return [
          name,
          byCategory
            .filter((row) => kinds.has(row.kind))
            .reduce((sum, row) => sum + row._count._all, 0),
        ];
      }),
    ) as Record<NotificationCategory, number>;

    return { ...toPageResult(items, total, query), unread, unreadByCategory } as PageResult<unknown> & {
      unread: number;
      unreadByCategory: Record<NotificationCategory, number>;
    };
  }

  async unreadCount(user: AuthenticatedUser): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });
    return { unread };
  }

  /** علامت خوانده‌شدن — فقط اعلان **خودِ کاربر**. */
  async markRead(id: string, user: AuthenticatedUser): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      // یا وجود ندارد، یا مال کاربر دیگری است — در هر دو حالت ۴۰۴، نه ۴۰۳.
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });
      if (!exists) throw AppError.notFound('اعلان یافت نشد');
    }
  }

  async markAllRead(user: AuthenticatedUser): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** ارسال به کاربران مشخص، به‌جز خود انجام‌دهنده عملیات. */
  async notifyUsers(
    userIds: readonly string[],
    input: NotifyInput,
    options: { readonly exceptUserId?: string } = {},
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const recipients = [...new Set(userIds)].filter((id) => id !== options.exceptUserId);
    if (recipients.length === 0) return;

    const client = tx ?? this.prisma;

    try {
      await client.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          kind: input.kind,
          title: input.title.slice(0, 200),
          body: input.body ?? null,
          documentId: input.documentId ?? null,
          feedbackId: input.feedbackId ?? null,
          sharedReportId: input.sharedReportId ?? null,
        })),
      });
    } catch (error) {
      this.logger.warn(
        `ثبت اعلان ناموفق بود (${input.kind}): ${error instanceof Error ? error.message : 'نامشخص'}`,
      );
    }
  }

  /** ارسال به همه کاربران فعالی که یک مجوز مشخص دارند. */
  async notifyPermissionHolders(
    permission: Permission,
    input: NotifyInput,
    options: { readonly exceptUserId?: string } = {},
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const users = await client.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { permissions: { some: { permission: { key: permission } } } } } },
      },
      select: { id: true },
    });

    await this.notifyUsers(
      users.map((user) => user.id),
      input,
      options,
      tx,
    );
  }
}
