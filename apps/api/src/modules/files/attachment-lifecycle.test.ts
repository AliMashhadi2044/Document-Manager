import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

import { AttachmentsService } from './attachments.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditService } from '../../common/audit/audit.service';
import type { StorageService } from './storage.service';
import type { DocumentAccessService } from '../documents/document-access.service';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';

/**
 * چرخهٔ عمر پیوست: حذف نرم ← بازگرداندن، یا حذف دائمی.
 *
 * آنچه این آزمون‌ها نگه می‌دارند، قاعده‌هایی است که نبودنشان تا مدت‌ها دیده نمی‌شود:
 * بازگرداندنی که سقف سند را می‌شکند، بازگرداندنی که فایلش در ذخیره‌سازی نیست، و
 * حذف دائمی‌ای که ردپای حسابرسی‌اش را پس از پاک کردن می‌نویسد (یعنی اگر پاک کردن
 * نیمه‌کاره بماند، هیچ‌وقت نمی‌نویسد).
 */

const USER = {
  id: '4e269289-1b8c-4245-be3f-a15b5c17c147',
  username: 'archivist',
  fullName: 'بایگان',
  roles: ['ARCHIVIST'],
  permissions: [],
  sessionId: 's',
} as unknown as AuthenticatedUser;

const DELETED = {
  id: 'b5e2a1d4-0000-4000-8000-000000000001',
  documentId: 'doc-1',
  status: 'READY' as const,
  storageKey: 'documents/doc-1/att-1.pdf',
  originalFilename: 'فاکتور.pdf',
  typeKey: 'PDF',
  sizeBytes: 1000n,
  checksumSha256: 'a'.repeat(64),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: new Date('2026-02-01T00:00:00Z'),
  uploadedBy: { fullName: 'کارپرداز' },
  deletedBy: { fullName: 'بایگان' },
  document: { status: 'PENDING_ARCHIVE' as const },
};

interface Options {
  readonly attachment?: Record<string, unknown> | null;
  /** مجموع فایل‌های زندهٔ سند — برای سنجیدن سقف‌ها. */
  readonly liveCount?: number;
  readonly liveBytes?: bigint;
  readonly duplicate?: { originalFilename: string } | null;
  readonly objectExists?: boolean;
}

function build(options: Options = {}) {
  const calls: string[] = [];

  const update = vi.fn(async (args: unknown) => {
    calls.push('attachment.update');
    return { ...DELETED, ...(args as { data: object }).data };
  });
  const remove = vi.fn(async () => {
    calls.push('storage.remove');
  });
  const destroy = vi.fn(async () => {
    calls.push('attachment.delete');
  });
  const record = vi.fn(async () => {
    calls.push('audit.record');
  });

  const prisma: Record<string, unknown> = {
    attachment: {
      findFirst: vi.fn().mockResolvedValue(
        options.attachment === undefined ? DELETED : options.attachment,
      ),
      aggregate: vi.fn().mockResolvedValue({
        _count: { _all: options.liveCount ?? 0 },
        _sum: { sizeBytes: options.liveBytes ?? 0n },
      }),
      update,
      delete: destroy,
    },
  };
  // تراکنش، همان کلاینت را می‌دهد.
  prisma.$transaction = vi.fn(async (fn: unknown) =>
    typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : undefined,
  );

  /*
    `findFirst` دو کار جدا می‌کند: پیدا کردن خودِ پیوست، و پیدا کردن فایل تکراری.
    پس فراخوان دوم جداگانه پاسخ می‌گیرد.
  */
  const findFirst = (prisma.attachment as { findFirst: ReturnType<typeof vi.fn> }).findFirst;
  findFirst.mockImplementation(async (args: unknown) => {
    const where = (args as { where: Record<string, unknown> }).where;
    if ('checksumSha256' in where) return options.duplicate ?? null;
    return options.attachment === undefined ? DELETED : options.attachment;
  });

  const storage = {
    remove,
    getStream: vi.fn(async () => {
      if (options.objectExists === false) throw new Error('NoSuchKey');
      return Readable.from([Buffer.from('x')]);
    }),
  } as unknown as StorageService;

  const access = {
    assertDocumentVisible: vi.fn().mockResolvedValue({ status: DELETED.document.status }),
  } as unknown as DocumentAccessService;

  const service = new AttachmentsService(
    prisma as unknown as PrismaService,
    { record } as unknown as AuditService,
    storage,
    access,
  );

  return { service, calls, update, remove, destroy, record };
}

describe('بازگرداندن فایل حذف‌شده', () => {
  it('ردیف را زنده می‌کند و رویداد می‌نویسد', async () => {
    const { service, update, record } = build();

    const restored = await service.restore(DELETED.id, USER);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: null, deletedById: null } }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTACHMENT_RESTORE' }),
      expect.anything(),
    );
    expect(restored.deletedAt).toBeNull();
  });

  it('سند بایگانی‌شده نمی‌پذیرد و چیزی نمی‌نویسد', async () => {
    const { service, update } = build({
      attachment: { ...DELETED, document: { status: 'ARCHIVED' } },
    });

    await expect(service.restore(DELETED.id, USER)).rejects.toThrow(/بایگانی/u);
    expect(update).not.toHaveBeenCalled();
  });

  it('ردیف نیمه‌کاره فایلی برای بازگرداندن ندارد', async () => {
    const { service, update } = build({
      attachment: { ...DELETED, status: 'PENDING', storageKey: 'pending:x' },
    });

    await expect(service.restore(DELETED.id, USER)).rejects.toThrow(/کامل آپلود نشده/u);
    expect(update).not.toHaveBeenCalled();
  });

  it('سندی که تا سقف تعداد پر است، فایل را پس نمی‌گیرد', async () => {
    // سقف پیش‌فرض `maxFilesPerDocument` است؛ عددی بالاتر از هر سقف معقول.
    const { service, update } = build({ liveCount: 1_000 });

    await expect(service.restore(DELETED.id, USER)).rejects.toThrow(/سقف/u);
    expect(update).not.toHaveBeenCalled();
  });

  it('اگر همان محتوا دوباره آپلود شده باشد، فایل تکراری نمی‌سازد', async () => {
    const { service, update } = build({ duplicate: { originalFilename: 'همان.pdf' } });

    await expect(service.restore(DELETED.id, USER)).rejects.toThrow(/تکراری/u);
    expect(update).not.toHaveBeenCalled();
  });

  /*
    مهم‌ترین آزمون این دسته: ردیفی که شیئش در ذخیره‌سازی نیست، «برگرداندن»ش دروغ
    است — کاربر فایل را در فهرست می‌بیند و دانلودش خطا می‌دهد.
  */
  it('ردیفی که فایلش در ذخیره‌سازی نیست، برنمی‌گردد', async () => {
    const { service, update } = build({ objectExists: false });

    await expect(service.restore(DELETED.id, USER)).rejects.toThrow(/ذخیره‌سازی/u);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('حذف دائمی فایل', () => {
  it('فایلی که حذف نشده باشد، پاک نمی‌شود', async () => {
    const { service, remove, destroy } = build({
      attachment: { ...DELETED, deletedAt: null },
    });

    await expect(service.purge(DELETED.id, USER)).rejects.toThrow(/ابتدا فایل را حذف کنید/u);
    expect(remove).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  /*
    ترتیب، خودِ قاعده است:
     - حسابرسی **پیش از** پاک کردن، وگرنه پاک‌کردنِ نیمه‌کاره ردپایی نمی‌گذارد.
     - شیء **پیش از** ردیف، وگرنه بدترین حالت یک یتیمِ ناپیدا می‌شود.
  */
  it('ترتیب: حسابرسی، بعد شیء، بعد ردیف', async () => {
    const { service, calls } = build();

    await service.purge(DELETED.id, USER);

    expect(calls).toEqual(['audit.record', 'storage.remove', 'attachment.delete']);
  });

  it('ردپای حسابرسی، فراداده کامل فایل را نگه می‌دارد', async () => {
    const { service, record } = build();

    await service.purge(DELETED.id, USER);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ATTACHMENT_PURGE',
        before: expect.objectContaining({
          originalFilename: DELETED.originalFilename,
          checksumSha256: DELETED.checksumSha256,
          storageKey: DELETED.storageKey,
          sizeBytes: '1000',
        }),
      }),
    );
  });

  it('ردیف نیمه‌کاره شیئی ندارد، پس سراغ ذخیره‌سازی نمی‌رود', async () => {
    const { service, remove, destroy } = build({
      attachment: { ...DELETED, status: 'PENDING', storageKey: 'pending:abc' },
    });

    await service.purge(DELETED.id, USER);

    expect(remove).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
