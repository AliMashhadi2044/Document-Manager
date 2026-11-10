import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { StorageService } from './storage.service';

/**
 * فایل‌هایی که به هیچ سندی وصل نیستند.
 *
 * ذخیره‌سازی و پایگاه داده دو چیز جدا هستند و همیشه دقیقاً یکی نمی‌مانند. چهار راه
 * شناخته‌شده که شیئی بی‌ردیف جا بماند:
 *
 *  ۱. آپلودی که شیء را گذاشت و پیش از `READY` شدنِ ردیف قطع شد.
 *  ۲. حذف دائمی سند (`document:purge`) که ردیف‌های پیوست را cascade برد و شیءها را نه.
 *  ۳. بازگرداندن پشتیبانِ پایگاه داده به نقطه‌ای پیش از چند آپلود.
 *  ۴. استقرارهای قدیمی‌تر، پیش از وجود همین مسیر.
 *
 * هیچ‌کدام خطای کاربر نیست و هیچ‌کدام هم خودبه‌خود درست نمی‌شود؛ تنها نتیجه‌شان
 * فضایی است که آرام‌آرام پر می‌شود و کسی نمی‌داند چرا.
 *
 * **دورهٔ امان، قلب این سرویس است.** شیءای که همین حالا آپلود می‌شود، برای چند صد
 * میلی‌ثانیه دقیقاً شکل یک یتیم را دارد: ترتیب آپلود «ردیف PENDING ← گذاشتن شیء ←
 * به‌روزرسانی ردیف با کلید واقعی» است، پس بین گام دوم و سوم هیچ ردیفی آن کلید را
 * نمی‌شناسد. پاک‌سازیِ بی‌امان، آپلودِ در جریانِ یک کاربر دیگر را از زیر دستش پاک
 * می‌کرد. پس چیزی یتیم شمرده نمی‌شود مگر **بیست و چهار ساعت** از آخرین تغییرش
 * گذشته باشد.
 */
@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  /** دورهٔ امان؛ دلیلش در توضیح کلاس آمده و کوتاه کردنش بی‌خطر نیست. */
  static readonly GRACE_MS = 24 * 60 * 60 * 1000;

  /** سقف پیمایش یک دور — خواندن کل bucket در حافظه، سرویس را می‌خواباند. */
  static readonly SCAN_LIMIT = 5000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * یک دور پیمایش: چه چیزی در ذخیره‌سازی هست که پایگاه داده نمی‌شناسد.
   *
   * ارجاع از **همهٔ** ردیف‌ها خوانده می‌شود، نه ردیف‌های زنده: فایلِ حذف‌نرم‌شده
   * صاحب شیء خودش است و با بازگرداندن باید همان‌جا باشد. اگر شرط `deletedAt: null`
   * اینجا می‌آمد، این صفحه هر فایلِ حذف‌شده‌ای را «بی‌سند» نشان می‌داد و پاک کردنش
   * بازگرداندن را برای همیشه از کار می‌انداخت.
   */
  async scan(): Promise<{
    objects: { key: string; sizeBytes: string; lastModified: string }[];
    staleRecords: {
      id: string;
      documentId: string;
      originalFilename: string;
      sizeBytes: string;
      createdAt: string;
    }[];
    scanned: number;
    truncated: boolean;
    graceHours: number;
  }> {
    const cutoff = new Date(Date.now() - StorageCleanupService.GRACE_MS);

    const { objects, truncated } = await this.storage.listObjects(
      StorageCleanupService.SCAN_LIMIT,
    );

    const referenced = new Set(
      (await this.prisma.attachment.findMany({ select: { storageKey: true } })).map(
        (row) => row.storageKey,
      ),
    );

    const orphans = objects
      .filter((object) => !referenced.has(object.key) && object.lastModified < cutoff)
      .map((object) => ({
        key: object.key,
        sizeBytes: String(object.sizeBytes),
        lastModified: object.lastModified.toISOString(),
      }));

    /*
      ردیف‌های نیمه‌کاره، روی دیگر همین سکه‌اند: آپلودی که شیء را هرگز نگذاشت و
      ردیف `PENDING` با کلید `pending:…` را جا گذاشت. هیچ فایلی ندارند، در هیچ
      فهرستی نمی‌آیند، و تا ابد می‌مانند.
    */
    const stale = await this.prisma.attachment.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      select: {
        id: true,
        documentId: true,
        originalFilename: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    return {
      objects: orphans,
      staleRecords: stale.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        originalFilename: row.originalFilename,
        sizeBytes: row.sizeBytes.toString(),
        createdAt: row.createdAt.toISOString(),
      })),
      scanned: objects.length,
      truncated,
      graceHours: StorageCleanupService.GRACE_MS / (60 * 60 * 1000),
    };
  }

  /**
   * پاک کردن آنچه کاربر انتخاب کرده است.
   *
   * هر قلم **دوباره** سنجیده می‌شود و این تکرار بی‌دلیل نیست: بین دیدن فهرست و زدن
   * دکمه، دقیقه‌ها فاصله است و در آن فاصله ممکن است همان کلید صاحب پیدا کرده باشد
   * (آپلودی که تمام شد) — فهرستِ مرورگر، مجوز پاک کردن نیست.
   */
  async purge(
    keys: readonly string[],
    recordIds: readonly string[],
    user: AuthenticatedUser,
  ): Promise<{ removedObjects: number; removedRecords: number; skipped: string[] }> {
    const cutoff = new Date(Date.now() - StorageCleanupService.GRACE_MS);
    const skipped: string[] = [];

    const removedKeys: string[] = [];
    let removedBytes = 0;

    if (keys.length > 0) {
      const referenced = new Set(
        (
          await this.prisma.attachment.findMany({
            where: { storageKey: { in: [...keys] } },
            select: { storageKey: true },
          })
        ).map((row) => row.storageKey),
      );

      // یک پیمایش تازه، تا سن و وجود هر کلید از خودِ ذخیره‌سازی بیاید و نه از ورودی.
      const { objects } = await this.storage.listObjects(StorageCleanupService.SCAN_LIMIT);
      const live = new Map(objects.map((object) => [object.key, object]));

      for (const key of keys) {
        if (referenced.has(key)) {
          skipped.push(`${key} — اکنون به یک پیوست وصل است`);
          continue;
        }
        const object = live.get(key);
        if (!object) {
          skipped.push(`${key} — در ذخیره‌سازی نیست`);
          continue;
        }
        if (object.lastModified >= cutoff) {
          skipped.push(`${key} — تازه‌تر از دورهٔ امان است`);
          continue;
        }

        await this.storage.remove(key);
        removedKeys.push(key);
        removedBytes += object.sizeBytes;
      }
    }

    const removedRecords: string[] = [];
    if (recordIds.length > 0) {
      const rows = await this.prisma.attachment.findMany({
        where: { id: { in: [...recordIds] }, status: 'PENDING', createdAt: { lt: cutoff } },
        select: { id: true, storageKey: true, originalFilename: true },
      });
      const found = new Set(rows.map((row) => row.id));
      for (const id of recordIds) {
        if (!found.has(id)) skipped.push(`${id} — دیگر ردیفِ نیمه‌کاره نیست`);
      }

      for (const row of rows) {
        /*
          ردیف PENDING می‌تواند شیء هم داشته باشد: آپلودی که شیء را گذاشت و در گام
          سوم قطع شد، ردیفی با کلید `pending:…` جا می‌گذارد و شیئی با کلید واقعی.
          آن شیء از همان مسیرِ یتیم‌ها پیدا و پاک می‌شود، چون هیچ ردیفی کلیدش را
          ندارد. اینجا تنها همان کلیدی پاک می‌شود که ردیف ادعا می‌کند.
        */
        if (!row.storageKey.startsWith('pending:')) {
          try {
            await this.storage.remove(row.storageKey);
          } catch (error) {
            this.logger.warn(
              { err: error, storageKey: row.storageKey },
              'پاک کردن شیء ردیف نیمه‌کاره ناموفق بود؛ ردیف پاک می‌شود',
            );
          }
        }
        await this.prisma.attachment.delete({ where: { id: row.id } });
        removedRecords.push(row.id);
      }
    }

    if (removedKeys.length === 0 && removedRecords.length === 0) {
      if (skipped.length > 0) {
        throw AppError.conflict('STORAGE_CLEANUP_EMPTY', `هیچ قلمی پاک نشد: ${skipped[0] ?? ''}`);
      }
      throw AppError.validation('قلمی برای پاک کردن انتخاب نشده است');
    }

    /*
      یک ردیف حسابرسی برای کل این دور، و نه یکی برای هر کلید: آنچه بعداً می‌خواهند
      بدانند «در آن پاک‌سازی چه رفت» است، و پنجاه ردیف جدا همان را سخت‌تر می‌کند.
      فهرست کلیدها در `before` هست، پس جزئیات هم از دست نمی‌رود.
    */
    await this.audit.record({
      actorId: user.id,
      action: 'STORAGE_ORPHAN_PURGE',
      entityType: 'storageObject',
      entityId: null,
      before: {
        keys: removedKeys,
        recordIds: removedRecords,
        removedBytes: String(removedBytes),
        skipped,
      },
    });

    return {
      removedObjects: removedKeys.length,
      removedRecords: removedRecords.length,
      skipped,
    };
  }
}
