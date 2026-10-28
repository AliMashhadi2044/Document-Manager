import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from '@dm/shared';

import { AppError } from '../../common/errors/app-error';
import { DocumentAccessService } from '../documents/document-access.service';
import { AnalyticsService } from './analytics.service';
import { SharedReportsService } from './shared-reports.service';

/**
 * فرستادن گزارش برای بررسی.
 *
 * ادعای اصلی امنیتی: **فرستادن گزارش، دسترسی اضافه نمی‌دهد**. آنچه ذخیره می‌شود
 * تعریف گزارش است و اجرا با مجوزهای گیرنده انجام می‌شود؛ پس اگر ناظر حق دیدن یک
 * مجموعه‌داده را نداشته باشد، گزارشی از آن مجموعه‌داده هم برایش ۴۰۴ است و نه
 * جدولی که باز می‌شود.
 */

function userWith(permissions: readonly Permission[], id = 'u1') {
  return {
    id,
    username: 'kaarbord',
    fullName: 'کارپرداز',
    roles: [],
    permissions,
    sessionId: 's1',
  };
}

function serviceWith(row: unknown) {
  const prisma = {
    sharedReport: {
      findUnique: vi.fn().mockResolvedValue(row),
    },
  };

  const analytics = new AnalyticsService(
    prisma as never,
    new DocumentAccessService(null as never),
  );

  return new SharedReportsService(
    prisma as never,
    analytics,
    { notifyPermissionHolders: vi.fn() } as never,
    { record: vi.fn() } as never,
  );
}

const SENT = {
  id: 'r1',
  senderId: 'sender',
  datasetKey: 'documents',
  title: 'قبض‌های مهر',
  description: null,
  columns: ['title'],
  filter: { combine: 'and', conditions: [] },
  sort: [],
  pageSize: 25,
  createdAt: new Date(),
  sender: { id: 'sender', fullName: 'کارپرداز' },
};

describe('گزارش ارسالی', () => {
  it('ناظر گزارش فرستاده‌شده را می‌بیند', async () => {
    const service = serviceWith(SENT);
    const supervisor = userWith(DEFAULT_ROLE_PERMISSIONS.SUPERVISOR, 'nazer');

    const result = await service.get('r1', supervisor);
    expect(result.title).toBe('قبض‌های مهر');
    expect(result.isMine, 'گزارش دیگری به‌عنوان ارسالی خودِ ناظر نشان داده شد').toBe(false);
  });

  /*
    بایگانی `report:share_read` ندارد. ۴۰۴ و نه ۴۰۳: وجودِ گزارشی که کاربر حق
    دیدنش را ندارد هم اطلاعات است — همان قاعده‌ای که مجموعه‌داده‌ها دارند.
  */
  it('کسی که مجوز دیدن ندارد ۴۰۴ می‌گیرد و نه ۴۰۳', async () => {
    const service = serviceWith(SENT);
    const archivist = userWith(DEFAULT_ROLE_PERMISSIONS.ARCHIVIST, 'bayegan');

    await expect(service.get('r1', archivist)).rejects.toMatchObject({ status: 404 });
  });

  it('فرستنده همیشه فرستادهٔ خودش را می‌بیند', async () => {
    const service = serviceWith({ ...SENT, senderId: 'me' });
    // عمداً بدون `report:share_read`: مالکیت خودش کافی است.
    const sender = userWith(['report:run', 'document:read'], 'me');

    const result = await service.get('r1', sender);
    expect(result.isMine).toBe(true);
  });

  /*
    گزارشی از مجموعه‌داده‌ای که گیرنده حقش را ندارد.

    این همان حفره‌ای است که اگر ردیف‌ها snapshot می‌شدند باز می‌ماند: فرستنده
    می‌توانست با یک «ارسال»، داده‌ای را بدهد که گیرنده حق دیدنش را ندارد.
  */
  it('گزارش از مجموعه‌دادهٔ بی‌مجوز، باز نمی‌شود', async () => {
    const service = serviceWith({ ...SENT, datasetKey: 'activity' });
    const supervisor = userWith(DEFAULT_ROLE_PERMISSIONS.SUPERVISOR, 'nazer');

    await expect(service.get('r1', supervisor)).rejects.toBeInstanceOf(AppError);
  });

  it('گزارش ناموجود ۴۰۴ می‌دهد', async () => {
    const service = serviceWith(null);
    await expect(
      service.get('r1', userWith(DEFAULT_ROLE_PERMISSIONS.SUPERVISOR)),
    ).rejects.toMatchObject({ status: 404 });
  });
});
