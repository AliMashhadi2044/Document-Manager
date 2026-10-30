import { describe, expect, it, vi } from 'vitest';

import { UsersService } from './users.service';
import { AppError } from '../../common/errors/app-error';

/**
 * مرزهای مدیریت کاربران.
 *
 * سه ادعا که همه‌شان دربارهٔ **قفل نشدنِ سامانه**اند — هر سه سمت سرور، نه پنهان
 * کردن یک دکمه:
 *
 *  ۱. مدیر حساب خودش را غیرفعال نمی‌کند.
 *  ۲. مدیر نقش‌های خودش را عوض نمی‌کند.
 *  ۳. هیچ تغییری سامانه را بی‌کاربرِ فعالِ دارای «مدیریت کاربران» نمی‌گذارد.
 *
 * و یک ادعای چهارم دربارهٔ رمز: پس از غیرفعال‌سازی و بازنشانی رمز، نشست‌های باز
 * **بسته** می‌شوند — نشست به رمز گره نخورده و بدون بستن، با رمز قدیمی کار می‌کرد.
 */

const ACTOR = 'actor-1';

const USER = {
  id: 'user-1',
  username: 'karpardaz',
  fullName: 'کاربر کارپردازی',
  isActive: true,
  lastLoginAt: null,
  lockedUntil: null,
  failedLoginCount: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  roles: [{ role: { key: 'PROCUREMENT', titleFa: 'کارپردازی' } }],
};

/**
 * سرویس با یک prisma ساختگی.
 *
 * `adminsAfter` همان چیزی است که شمارشِ «مدیرِ فعال» داخل تراکنش برمی‌گرداند — با
 * صفر گذاشتنش، نگهبان باید تغییر را برگرداند.
 */
function makeService(options: { adminsAfter?: number } = {}) {
  const revokeAllForUser = vi.fn(async () => 2);

  const tx = {
    user: {
      update: vi.fn(async () => USER),
      count: vi.fn(async () => options.adminsAfter ?? 1),
    },
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async () => USER),
    },
    role: {
      findMany: vi.fn(async () => [{ id: 'role-procurement' }]),
    },
    $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) => run(tx)),
  };

  const service = new UsersService(
    prisma as never,
    { record: vi.fn() } as never,
    { revokeAllForUser } as never,
  );

  return { service, prisma, tx, revokeAllForUser };
}

describe('مدیریت کاربران', () => {
  it('مدیر حساب خودش را غیرفعال نمی‌کند', async () => {
    const { service, prisma } = makeService();

    await expect(service.update(USER.id, { isActive: false }, USER.id)).rejects.toMatchObject({
      code: 'SELF_DEACTIVATE',
    });
    // و هیچ تغییری نوشته نشده است.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('مدیر نقش‌های حساب خودش را عوض نمی‌کند', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.update(USER.id, { roles: ['SYSTEM_ADMIN'] }, USER.id),
    ).rejects.toMatchObject({ code: 'SELF_ROLE_CHANGE' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  /*
    نگهبان آخر: تغییری که همهٔ مدیرها را بردارد.

    اگر هیچ کاربر فعالی مجوز `user:write` نداشته باشد، هیچ‌کس دیگر نمی‌تواند کاربری
    بسازد یا نقشی بدهد؛ تنها راه، دسترسی خط فرمان به دیتابیس است. پس بررسی **داخل
    همان تراکنش** است و تغییر برمی‌گردد.
  */
  it('تغییری که سامانه را بی‌مدیر بگذارد برمی‌گردد', async () => {
    const { service, tx } = makeService({ adminsAfter: 0 });

    await expect(
      service.update(USER.id, { roles: ['PROCUREMENT'] }, ACTOR),
    ).rejects.toMatchObject({ code: 'NO_ADMIN_LEFT' });

    // نوشتن انجام شده بود و شمارش پس از آن آمد — پس تراکنش است که برش می‌گرداند.
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.user.count).toHaveBeenCalled();
  });

  it('غیرفعال کردن کاربر، نشست‌های بازش را می‌بندد', async () => {
    const { service, revokeAllForUser } = makeService();

    await service.update(USER.id, { isActive: false }, ACTOR);

    expect(revokeAllForUser).toHaveBeenCalledWith(USER.id);
  });

  it('اصلاح نام، نشست کاربر را نمی‌بندد', async () => {
    const { service, revokeAllForUser } = makeService();

    await service.update(USER.id, { fullName: 'نام تازه' }, ACTOR);

    // بیرون انداختن کاربر از سامانه به‌خاطر اصلاح یک حرف از نامش، آزاردهنده بود.
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  it('رمز نامعتبر پیش از هر نوشتنی رد می‌شود', async () => {
    const { service, prisma } = makeService();

    await expect(service.resetPassword(USER.id, '1234', ACTOR)).rejects.toBeInstanceOf(AppError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('نقش ناشناس پیش از هر نوشتنی رد می‌شود', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.update(USER.id, { roles: ['NOT_A_ROLE' as never] }, ACTOR),
    ).rejects.toBeInstanceOf(AppError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
