import { describe, expect, it, vi } from 'vitest';

import { StorageCleanupService } from './storage-cleanup.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditService } from '../../common/audit/audit.service';
import type { StorageService } from './storage.service';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';

/**
 * پاک‌سازی فایل‌های بی‌سند — دو خطای مرگ‌آور که این آزمون‌ها جلویشان را می‌گیرند.
 *
 *  ۱. **پاک کردن آپلودِ در جریان.** ترتیب آپلود «ردیف PENDING ← گذاشتن شیء ←
 *     به‌روزرسانی ردیف» است، پس شیئی که همین حالا گذاشته شده، برای لحظه‌ای هیچ
 *     ردیفی ندارد. پاک‌سازیِ بی‌امان، فایل کاربر دیگر را از زیر دستش می‌برد.
 *
 *  ۲. **پاک کردن فایلِ حذف‌شده.** فایلِ حذف‌نرم‌شده صاحب شیء خودش است و باید
 *     بازگشتنی بماند. اگر ارجاع‌ها با شرط `deletedAt: null` خوانده می‌شد، این صفحه
 *     هر فایل حذف‌شده‌ای را «بی‌سند» نشان می‌داد و پاک کردنش بازگرداندن را برای
 *     همیشه از کار می‌انداخت.
 */

const USER = {
  id: '4e269289-1b8c-4245-be3f-a15b5c17c147',
  username: 'admin',
  fullName: 'مدیر سامانه',
  roles: ['SYSTEM_ADMIN'],
  permissions: [],
  sessionId: 's',
} as unknown as AuthenticatedUser;

const HOUR = 60 * 60 * 1000;
const old = (hours: number) => new Date(Date.now() - hours * HOUR);

interface Options {
  readonly objects?: { key: string; sizeBytes: number; lastModified: Date }[];
  /** کلیدهایی که یک ردیف پیوست می‌شناسدشان — زنده یا حذف‌شده، تفاوتی ندارد. */
  readonly referenced?: string[];
  readonly stalePending?: { id: string; storageKey: string }[];
  readonly truncated?: boolean;
}

function build(options: Options = {}) {
  const referenced = options.referenced ?? [];
  const stale = options.stalePending ?? [];

  const remove = vi.fn(async () => undefined);
  const record = vi.fn(async () => undefined);
  const destroy = vi.fn(async () => undefined);

  const prisma = {
    attachment: {
      findMany: vi.fn(async (args: unknown) => {
        const where = (args as { where?: Record<string, unknown> } | undefined)?.where;

        // ردیف‌های نیمه‌کاره
        if (where && 'status' in where) {
          return stale.map((row) => ({
            id: row.id,
            documentId: 'doc-1',
            originalFilename: 'نیمه‌کاره.pdf',
            sizeBytes: 10n,
            createdAt: old(48),
            storageKey: row.storageKey,
          }));
        }

        // بررسی ارجاع کلیدهای انتخاب‌شده
        if (where && 'storageKey' in where) {
          const asked = (where.storageKey as { in: string[] }).in;
          return asked
            .filter((key) => referenced.includes(key))
            .map((key) => ({ storageKey: key }));
        }

        // همهٔ ارجاع‌ها
        return referenced.map((key) => ({ storageKey: key }));
      }),
      delete: destroy,
    },
  };

  const storage = {
    listObjects: vi.fn(async () => ({
      objects: options.objects ?? [],
      truncated: options.truncated ?? false,
    })),
    remove,
  } as unknown as StorageService;

  const service = new StorageCleanupService(
    prisma as unknown as PrismaService,
    { record } as unknown as AuditService,
    storage,
  );

  return { service, remove, record, destroy };
}

describe('پیمایش فایل‌های بی‌سند', () => {
  it('شیء بی‌ردیف و کهنه، یتیم است', async () => {
    const { service } = build({
      objects: [{ key: 'documents/doc-1/a.pdf', sizeBytes: 500, lastModified: old(72) }],
    });

    const result = await service.scan();

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]?.key).toBe('documents/doc-1/a.pdf');
    expect(result.graceHours).toBe(24);
  });

  it('شیءِ تازه، یتیم شمرده نمی‌شود — آپلودِ در جریان همین شکل است', async () => {
    const { service } = build({
      objects: [{ key: 'documents/doc-1/just-now.pdf', sizeBytes: 500, lastModified: old(1) }],
    });

    const result = await service.scan();

    expect(result.objects).toEqual([]);
    // ولی پیمایش شده بود؛ «پیدا نشد» با «بررسی نشد» یکی نیست.
    expect(result.scanned).toBe(1);
  });

  it('شیءِ فایلِ حذف‌شده، یتیم نیست', async () => {
    const { service } = build({
      objects: [{ key: 'documents/doc-1/deleted.pdf', sizeBytes: 500, lastModified: old(72) }],
      referenced: ['documents/doc-1/deleted.pdf'],
    });

    const result = await service.scan();

    expect(result.objects).toEqual([]);
  });

  it('سقفِ پیمایش، صادقانه گزارش می‌شود', async () => {
    const { service } = build({ truncated: true });

    expect((await service.scan()).truncated).toBe(true);
  });
});

describe('پاک کردن انتخاب‌شده‌ها', () => {
  it('کلید معتبر را پاک می‌کند و یک ردیف حسابرسی می‌نویسد', async () => {
    const key = 'documents/doc-1/a.pdf';
    const { service, remove, record } = build({
      objects: [{ key, sizeBytes: 500, lastModified: old(72) }],
    });

    const result = await service.purge([key], [], USER);

    expect(remove).toHaveBeenCalledWith(key);
    expect(result.removedObjects).toBe(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STORAGE_ORPHAN_PURGE',
        before: expect.objectContaining({ keys: [key], removedBytes: '500' }),
      }),
    );
  });

  /*
    بین دیدن فهرست و زدن دکمه، دقیقه‌ها فاصله است. اگر در آن فاصله همان کلید صاحب
    پیدا کند، فهرستِ مرورگر دیگر درست نیست — و مجوز پاک کردن هم نیست.
  */
  it('کلیدی که در این فاصله صاحب پیدا کرده، پاک نمی‌شود', async () => {
    const key = 'documents/doc-1/a.pdf';
    const { service, remove } = build({
      objects: [{ key, sizeBytes: 500, lastModified: old(72) }],
      referenced: [key],
    });

    await expect(service.purge([key], [], USER)).rejects.toThrow(/پاک نشد/u);
    expect(remove).not.toHaveBeenCalled();
  });

  it('کلیدِ تازه‌تر از دورهٔ امان، پاک نمی‌شود', async () => {
    const key = 'documents/doc-1/fresh.pdf';
    const { service, remove } = build({
      objects: [{ key, sizeBytes: 500, lastModified: old(2) }],
    });

    await expect(service.purge([key], [], USER)).rejects.toThrow(/امان/u);
    expect(remove).not.toHaveBeenCalled();
  });

  it('ردیف نیمه‌کاره با کلید pending، سراغ ذخیره‌سازی نمی‌رود', async () => {
    const { service, remove, destroy } = build({
      stalePending: [{ id: '00000000-0000-4000-8000-000000000001', storageKey: 'pending:x' }],
    });

    const result = await service.purge(
      [],
      ['00000000-0000-4000-8000-000000000001'],
      USER,
    );

    expect(remove).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(result.removedRecords).toBe(1);
  });

  it('انتخاب خالی، خطای روشن می‌دهد و چیزی نمی‌نویسد', async () => {
    const { service, record } = build();

    await expect(service.purge([], [], USER)).rejects.toThrow(/انتخاب نشده/u);
    expect(record).not.toHaveBeenCalled();
  });
});
