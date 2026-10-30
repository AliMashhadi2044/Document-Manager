import { describe, expect, it, vi } from 'vitest';

import { RetentionService } from './retention.service';

/**
 * نگهداشت داده.
 *
 * سه ادعا، و دوتایشان دربارهٔ چیزی است که **نباید** پاک شود:
 *
 *  ۱. اعلان خوانده‌نشده می‌ماند — کاربری که مرخصی بوده باید کارِ مانده را ببیند.
 *  ۲. ردپای حسابرسی اصلاً لمس نمی‌شود.
 *  ۳. خطای پایگاه داده، سرویس را نمی‌خواباند.
 */
const DAYS = { NOTIFICATION_RETENTION_DAYS: 180, SECURITY_EVENT_RETENTION_DAYS: 365 };

function makeService(options: { failing?: boolean } = {}) {
  const deleteMany = vi.fn(async (_args: unknown) => {
    if (options.failing) throw new Error('پایگاه داده در دسترس نیست');
    return { count: 3 };
  });

  const prisma = {
    notification: { deleteMany },
    securityEvent: { deleteMany },
    auditLog: { deleteMany: vi.fn() },
  };

  const config = { get: (key: keyof typeof DAYS) => DAYS[key] };
  return { service: new RetentionService(prisma as never, config as never), prisma, deleteMany };
}

describe('نگهداشت داده', () => {
  it('فقط اعلان‌های خوانده‌شده و قدیمی را پاک می‌کند', async () => {
    const { service, deleteMany } = makeService();

    await service.sweep();

    const where = (deleteMany.mock.calls[0]?.[0] as { where: { readAt: unknown } }).where;
    // `readAt: not null` همان شرطی است که اعلان خوانده‌نشده را نگه می‌دارد.
    expect(where.readAt).toMatchObject({ not: null });
  });

  it('ردپای حسابرسی را لمس نمی‌کند', async () => {
    const { service, prisma } = makeService();

    await service.sweep();

    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it('خطای پایگاه داده را می‌بلعد و سرویس را نمی‌خواباند', async () => {
    const { service } = makeService({ failing: true });

    await expect(service.sweep()).resolves.toEqual({ notifications: 0, securityEvents: 0 });
  });
});
