import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

/**
 * نگهداشت داده: چه چیزی می‌ماند، چه چیزی می‌رود.
 *
 * دو جدول بی‌هیچ سقفی رشد می‌کردند و هیچ‌کدام داده‌ای نیستند که سامانه به آن
 * برگردد: **اعلان‌های خوانده‌شده** و **رویدادهای امنیتی**. چند سال بعد، همان‌ها
 * بزرگ‌ترین جدول‌های پایگاه داده می‌شدند و پشتیبان‌گیری را کُند می‌کردند.
 *
 * **حسابرسی (`audit_logs`) عمداً اینجا نیست.** آن ردپای «چه کسی چه کرد» است و
 * پاک شدنِ خودکارش، همان چیزی را از بین می‌برد که برایش ساخته شده. اگر روزی
 * حجمش مسئله شد، راهش **آرشیو** است نه حذف (docs/18-operations.md §۳).
 *
 * اعلانِ **خوانده‌نشده** هم هرگز پاک نمی‌شود: کاربری که دو ماه مرخصی بوده، باید
 * کاری را که برایش مانده ببیند.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    // روزی یک بار کافی است؛ این کار فوریتی ندارد و نباید با بار کاربر رقابت کند.
    this.timer = setInterval(() => void this.sweep(), 24 * 60 * 60 * 1000);
    this.timer.unref();

    // یک اجرا در آغاز، وگرنه سرویسی که هر شب راه‌اندازی دوباره می‌شود هرگز پاک نمی‌کند.
    void this.sweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** پاک‌سازی یک دور؛ خطا فقط لاگ می‌شود، چون این کار نباید سرویس را بخواباند. */
  async sweep(): Promise<{ notifications: number; securityEvents: number }> {
    const result = { notifications: 0, securityEvents: 0 };

    const notificationDays = this.config.get('NOTIFICATION_RETENTION_DAYS', { infer: true });
    const securityDays = this.config.get('SECURITY_EVENT_RETENTION_DAYS', { infer: true });

    try {
      const deleted = await this.prisma.notification.deleteMany({
        where: { readAt: { not: null, lt: daysAgo(notificationDays) } },
      });
      result.notifications = deleted.count;
    } catch (error) {
      this.logger.error({ err: error }, 'پاک‌سازی اعلان‌های قدیمی ناموفق بود');
    }

    try {
      const deleted = await this.prisma.securityEvent.deleteMany({
        where: { createdAt: { lt: daysAgo(securityDays) } },
      });
      result.securityEvents = deleted.count;
    } catch (error) {
      this.logger.error({ err: error }, 'پاک‌سازی رویدادهای امنیتی قدیمی ناموفق بود');
    }

    if (result.notifications > 0 || result.securityEvents > 0) {
      this.logger.log(
        `نگهداشت داده: ${result.notifications} اعلان و ${result.securityEvents} رویداد امنیتی پاک شد.`,
      );
    }

    return result;
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
