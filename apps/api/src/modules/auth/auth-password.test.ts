import { describe, expect, it, vi } from 'vitest';
import * as argon2 from 'argon2';

import { AuthService } from './auth.service';

/**
 * تغییر رمز توسط خودِ کاربر.
 *
 * چهار ادعا که هر کدام یک راهِ در رفتن را می‌بندند:
 *
 *  ۱. بدون رمز فعلی نمی‌شود — نشستِ باز روی رایانهٔ رهاشده نباید برای قفل کردنِ
 *     حساب صاحبش کافی باشد.
 *  ۲. رمز ضعیف **پیش از هر نوشتنی** رد می‌شود.
 *  ۳. پس از تغییر، همهٔ نشست‌ها بسته و برای همین دستگاه نشست تازه صادر می‌شود.
 *  ۴. رمز تکراری پذیرفته نمی‌شود.
 */

const CONTEXT = { ip: '127.0.0.1', userAgent: 'test' };
const CURRENT = 'Tehran-1404-Karpardaz';

async function makeService() {
  const passwordHash = await AuthService.hashPassword(CURRENT);

  const update = vi.fn(async (_args: unknown) => ({}));
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({ id: 'user-1', username: 'ali', passwordHash })),
    },
    securityEvent: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) =>
      run({ user: { update } }),
    ),
  };

  const sessions = {
    revokeAllForUser: vi.fn(async () => 3),
    issue: vi.fn(async () => ({
      sessionToken: 'new-token',
      csrfToken: 'new-csrf',
      expiresAt: new Date(),
    })),
  };

  const service = new AuthService(
    prisma as never,
    sessions as never,
    { get: () => 5 } as never,
    { record: vi.fn() } as never,
  );

  return { service, prisma, sessions, update };
}

describe('تغییر رمز توسط کاربر', () => {
  it('با رمز فعلیِ نادرست انجام نمی‌شود', async () => {
    const { service, prisma } = await makeService();

    await expect(
      service.changeOwnPassword('user-1', 'رمز اشتباه', 'Shiraz-1405-Karpardaz', CONTEXT),
    ).rejects.toMatchObject({ status: 401 });

    expect(prisma.$transaction, 'با رمز اشتباه چیزی نوشته شد').not.toHaveBeenCalled();
    // و تلاش ناموفق ثبت می‌شود؛ وگرنه حمله روی نشستِ دزدیده‌شده بی‌صدا می‌ماند.
    expect(prisma.securityEvent.create).toHaveBeenCalled();
  });

  it('رمز ضعیف پیش از هر نوشتنی رد می‌شود', async () => {
    const { service, prisma } = await makeService();

    await expect(service.changeOwnPassword('user-1', CURRENT, '1234', CONTEXT)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // آن‌قدر زود که حتی رمز فعلی هم خوانده نشده است.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('رمز تازه نمی‌تواند همان رمز فعلی باشد', async () => {
    const { service, prisma } = await makeService();

    await expect(
      service.changeOwnPassword('user-1', CURRENT, CURRENT, CONTEXT),
    ).rejects.toMatchObject({ code: 'SAME_PASSWORD' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('رمز را عوض می‌کند، نشست‌ها را می‌بندد و نشست تازه می‌دهد', async () => {
    const { service, sessions, update } = await makeService();

    const issued = await service.changeOwnPassword(
      'user-1',
      CURRENT,
      'Shiraz-1405-Karpardaz',
      CONTEXT,
    );

    const data = update.mock.calls[0]?.[0] as unknown as {
      data: { passwordHash: string; failedLoginCount: number };
    };
    // هشِ تازه نوشته شده و واقعاً رمز تازه را می‌پذیرد.
    await expect(argon2.verify(data.data.passwordHash, 'Shiraz-1405-Karpardaz')).resolves.toBe(
      true,
    );
    expect(data.data.failedLoginCount).toBe(0);

    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(sessions.issue).toHaveBeenCalled();
    expect(issued.sessionToken).toBe('new-token');
  });
});
