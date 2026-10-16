import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { isQueryCountEnabled, recordQuery } from './query-counter';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    /*
     * شمارش کوئری با میان‌افزار Prisma، نه با رویداد `query`.
     *
     * نسخه اول با `$on('query')` نوشته شد و **صفر** می‌شمرد: آن رویداد از زنجیره
     * async خودِ درخواست بیرون emit می‌شود، پس `AsyncLocalStorage` درخواست را
     * نمی‌بیند. میان‌افزار در همان زمینه‌ای اجرا می‌شود که کوئری را صدا زده، و
     * شمارنده کار می‌کند.
     *
     * دو نکته صادقانه: `$use` در Prisma به‌نفع client extensions منسوخ شده (ولی
     * موجود است)، و تنها عملیات **مدل** را می‌شمارد، نه `$queryRaw`. برای چیزی که
     * این شمارنده برایش هست — اثبات ثابت بودن تعداد کوئری فهرست و جزئیات — همین
     * دقیقاً همان چیزی است که باید شمرده شود.
     */
    if (isQueryCountEnabled()) {
      this.$use(async (params, next) => {
        recordQuery();
        return next(params);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('اتصال به پایگاه داده برقرار شد');
    if (isQueryCountEnabled()) {
      this.logger.warn('شمارنده کوئری روشن است (EXPOSE_QUERY_COUNT) — فقط برای تشخیص.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** بررسی سلامت اتصال برای endpoint آمادگی. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
