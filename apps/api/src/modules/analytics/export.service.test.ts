import { describe, expect, it, vi } from 'vitest';
import type { Permission } from '@dm/shared';

import { AppError } from '../../common/errors/app-error';
import { ExportService } from './export.service';

/**
 * قواعد دسترسی و انقضای خروجی صف‌شده.
 *
 * چرا تست واحد و نه آزمون زنده: انقضا در ۲۴ ساعت رخ می‌دهد و یک آزمون زنده نمی‌تواند
 * ساعت را جلو ببرد. اینجا رفتار در لحظه انقضا **مستقیم** سنجیده می‌شود — و اینکه فایل
 * واقعاً از فضای ذخیره‌سازی پاک می‌شود، نه فقط ردیفش علامت می‌خورد.
 */

const OWNER = {
  id: 'owner-1',
  username: 'owner',
  fullName: 'صاحب خروجی',
  roles: ['MANAGER'],
  permissions: ['report:run', 'report:export', 'document:read'] as readonly Permission[],
  sessionId: 's-1',
};

const OTHER = { ...OWNER, id: 'intruder-1', username: 'other', sessionId: 's-2' };

function serviceWith(job: Record<string, unknown> | null) {
  const update = vi.fn().mockResolvedValue({});
  const remove = vi.fn().mockResolvedValue(undefined);
  const getStream = vi.fn().mockResolvedValue({ pipe: vi.fn() });

  const prisma = {
    exportJob: {
      findUnique: vi.fn().mockResolvedValue(job),
      findMany: vi.fn().mockResolvedValue(job === null ? [] : [job]),
      update,
    },
  };

  const analytics = {
    requireDataset: vi.fn().mockReturnValue({ key: 'documents', titleFa: 'اسناد' }),
  };

  const storage = { getStream, remove, isConfigured: true };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new ExportService(
    prisma as never,
    analytics as never,
    {} as never,
    storage as never,
    audit as never,
  );

  return { service, update, remove, getStream, audit };
}

const READY_JOB = {
  id: 'job-1',
  datasetKey: 'documents',
  status: 'SUCCEEDED',
  storageKey: 'exports/job-1.xlsx',
  requestedById: OWNER.id,
  expiresAt: new Date(Date.now() + 60_000),
  rowCount: 5,
  sizeBytes: 1234n,
  errorMessage: null,
  createdAt: new Date(),
  finishedAt: new Date(),
};

describe('دانلود خروجی صف‌شده', () => {
  it('صاحب کار فایل را می‌گیرد و دانلود در حسابرسی ثبت می‌شود', async () => {
    const { service, getStream, audit } = serviceWith(READY_JOB);

    const result = await service.download('job-1', OWNER);

    expect(getStream).toHaveBeenCalledWith('exports/job-1.xlsx');
    expect(result.filename).toContain('.xlsx');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REPORT_EXPORT_DOWNLOAD', entityId: 'job-1' }),
    );
  });

  /**
   * «لینک غیرقابل حدس» تنها دفاع نیست.
   *
   * شناسه کار یک UUID است، ولی اگر مالکیت بررسی نمی‌شد، هر کسی که لینک را می‌دید فایل
   * را داشت. و پاسخ ۴۰۴ است نه ۴۰۳: وجودِ خروجیِ کاربر دیگر هم اطلاعات است.
   */
  it('کاربر دیگر ۴۰۴ می‌گیرد، نه ۴۰۳', async () => {
    const { service, getStream } = serviceWith(READY_JOB);

    await expect(service.download('job-1', OTHER)).rejects.toMatchObject({ status: 404 });
    expect(getStream).not.toHaveBeenCalled();
  });

  it('کار ناموجود ۴۰۴ می‌گیرد', async () => {
    const { service } = serviceWith(null);
    await expect(service.download('job-x', OWNER)).rejects.toMatchObject({ status: 404 });
  });

  it('کار آماده‌نشده دانلود نمی‌شود', async () => {
    const { service, getStream } = serviceWith({ ...READY_JOB, status: 'RUNNING', storageKey: null });

    await expect(service.download('job-1', OWNER)).rejects.toMatchObject({
      code: 'EXPORT_NOT_READY',
    });
    expect(getStream).not.toHaveBeenCalled();
  });

  it('کار منقضی‌شده دانلود نمی‌شود، حتی اگر فایلش هنوز پاک نشده باشد', async () => {
    const { service, getStream } = serviceWith({
      ...READY_JOB,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await expect(service.download('job-1', OWNER)).rejects.toMatchObject({
      code: 'EXPORT_EXPIRED',
    });
    // مهم‌تر از پیام خطا: فایل حتی خوانده هم نمی‌شود.
    expect(getStream).not.toHaveBeenCalled();
  });
});

describe('پاک‌سازی خروجی‌های منقضی', () => {
  it('فایل از فضای ذخیره‌سازی پاک و ردیف منقضی علامت می‌خورد', async () => {
    const { service, remove, update } = serviceWith({
      id: 'job-old',
      storageKey: 'exports/job-old.xlsx',
    });

    const removed = await service.cleanupExpired();

    expect(removed).toBe(1);
    expect(remove).toHaveBeenCalledWith('exports/job-old.xlsx');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'job-old' },
      data: { status: 'EXPIRED', storageKey: null, sizeBytes: null },
    });
  });

  /**
   * اگر پاک کردن فایل شکست بخورد، ردیف **منقضی علامت نمی‌خورد**.
   *
   * وگرنه فایل در فضای ذخیره‌سازی می‌ماند و هیچ‌کس دیگر دنبالش نمی‌رود؛ یک فایل حاوی
   * داده مالی که برای همیشه جا می‌ماند، بدترین نتیجه این مسیر است.
   */
  it('خطای پاک کردن فایل، ردیف را منقضی علامت نمی‌زند', async () => {
    const { service, update } = serviceWith({
      id: 'job-old',
      storageKey: 'exports/job-old.xlsx',
    });
    const failing = service as unknown as {
      storage: { remove: (key: string) => Promise<void> };
    };
    failing.storage.remove = vi.fn().mockRejectedValue(new Error('storage down'));

    const removed = await service.cleanupExpired();

    expect(removed).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('آستانه صف', () => {
  it('پیکربندی‌نشده، همان پیش‌فرض ۲۰۰۰ است', async () => {
    const prisma = { exportJob: {} };
    const analytics = {
      requireDataset: vi.fn().mockReturnValue({ key: 'documents', titleFa: 'اسناد' }),
      countRows: vi.fn().mockResolvedValue(2_001),
    };

    const service = new ExportService(
      prisma as never,
      analytics as never,
      {} as never,
      { isConfigured: true } as never,
      { record: vi.fn() } as never,
    );

    const plan = await service.plan('documents', {} as never, OWNER);
    expect(plan).toEqual({ rowCount: 2_001, queued: true, syncLimit: 2_000 });
  });

  it('با پیکربندی، همان عدد پیکربندی‌شده مرز است', async () => {
    const analytics = {
      requireDataset: vi.fn().mockReturnValue({ key: 'documents', titleFa: 'اسناد' }),
      countRows: vi.fn().mockResolvedValue(11),
    };
    const config = { get: (key: string) => (key === 'EXPORT_SYNC_ROW_LIMIT' ? 10 : 24) };

    const service = new ExportService(
      { exportJob: {} } as never,
      analytics as never,
      {} as never,
      { isConfigured: true } as never,
      { record: vi.fn() } as never,
      config as never,
    );

    const plan = await service.plan('documents', {} as never, OWNER);
    expect(plan).toEqual({ rowCount: 11, queued: true, syncLimit: 10 });
  });
});

describe('خطای فضای ذخیره‌سازی', () => {
  it('بدون پیکربندی ذخیره‌سازی، کار به صف نمی‌رود', async () => {
    const analytics = {
      requireDataset: vi.fn().mockReturnValue({ key: 'documents', titleFa: 'اسناد' }),
      resolveColumns: vi.fn().mockReturnValue([{ key: 'title' }]),
      whereFor: vi.fn().mockReturnValue({}),
    };

    const service = new ExportService(
      { exportJob: { create: vi.fn() } } as never,
      analytics as never,
      {} as never,
      { isConfigured: false } as never,
      { record: vi.fn() } as never,
    );

    await expect(service.enqueue('documents', {} as never, OWNER)).rejects.toBeInstanceOf(AppError);
  });
});
