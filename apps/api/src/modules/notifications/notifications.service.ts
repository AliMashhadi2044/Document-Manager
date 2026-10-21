import { Injectable, Logger } from '@nestjs/common';
import type { NotificationKind, Prisma } from '@prisma/client';
import type { Permission } from '@dm/shared';

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
  ): Promise<PageResult<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
        ...paginationArgs(query),
        include: { document: { select: { id: true, title: true, status: true } } },
      }),
      this.prisma.notification.count({ where }),
      // شمارندهٔ خوانده‌نشده‌ها همیشه روی **همه** اعلان‌هاست، نه روی فیلتر جاری.
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    return { ...toPageResult(items, total, query), unread } as PageResult<unknown> & {
      unread: number;
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
