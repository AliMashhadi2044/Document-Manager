import { describe, expect, it, vi } from 'vitest';

import { TemplatesService } from './templates.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditService } from '../../common/audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';

/**
 * قالب سیستمی، نسخهٔ **مرجع** است و از هیچ مسیر کاربری عوض نمی‌شود.
 *
 * چرا این آزمون لازم شد: سه مسیرِ نوشتن این نگهبان را داشتند و یکی — انتشار —
 * نداشت. در عمل قالب سیستمی پیش‌نویسی ندارد که منتشر شود، ولی «در عمل» تضمین
 * نیست: یک اجرای نیمه‌کارهٔ seed کافی بود تا پیش‌نویسی جا بماند و انتشارش
 * محتوای مرجع را عوض کند. مرجعی که عوض می‌شود دیگر مرجع نیست.
 *
 * هر مسیرِ تازه‌ای که روی قالب می‌نویسد، باید اینجا یک ردیف اضافه کند.
 */

const USER = {
  id: '4e269289-1b8c-4245-be3f-a15b5c17c147',
  username: 'admin',
  fullName: 'مدیر',
  roles: ['SYSTEM_ADMIN'],
  permissions: [],
  sessionId: 's',
} as unknown as AuthenticatedUser;

const SYSTEM_DEFINITION = {
  id: 'def-system',
  name: 'گزارش مالیات (سیستمی)',
  isSystem: true,
  status: 'PUBLISHED',
  reportTypeId: 'rt-1',
  currentVersionId: 'ver-1',
};

/**
 * Prisma جعلی: فقط همان خواندنی‌هایی که نگهبان‌ها پیش از رد کردن انجام می‌دهند.
 *
 * هر نوشتنی اینجا یک `vi.fn()` است که اگر صدا زده شود، آزمون را می‌شکند —
 * «رد شد» یعنی **هیچ‌چیز نوشته نشد**، نه اینکه فقط خطا برگشت.
 */
type Writes = ReturnType<typeof noWrites>;

function serviceWith(writes: Writes): TemplatesService {
  const prisma: Record<string, unknown> = {
    reportDefinition: {
      findUnique: vi.fn().mockResolvedValue(SYSTEM_DEFINITION),
      findFirst: vi.fn().mockResolvedValue(null),
      update: writes.definitionUpdate,
      create: writes.definitionCreate,
    },
    reportVersion: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'ver-draft',
        status: 'DRAFT',
        definitionId: SYSTEM_DEFINITION.id,
        template: { schemaVersion: 1 },
        definition: SYSTEM_DEFINITION,
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: writes.versionCreate,
      update: writes.versionUpdate,
    },
    reportType: { findUniqueOrThrow: vi.fn(), update: writes.typeUpdate },
  };

  // تراکنش، همان کلاینت را می‌دهد: سرویس درون تراکنش با `tx` می‌نویسد.
  prisma.$transaction = vi.fn(async (fn: unknown) =>
    typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : undefined,
  );

  const audit = { record: vi.fn() } as unknown as AuditService;
  return new TemplatesService(prisma as unknown as PrismaService, audit);
}

function noWrites() {
  return {
    definitionUpdate: vi.fn(),
    definitionCreate: vi.fn(),
    versionCreate: vi.fn(),
    versionUpdate: vi.fn(),
    typeUpdate: vi.fn(),
  };
}

describe('قالب سیستمی عوض نمی‌شود', () => {
  const cases: readonly {
    readonly name: string;
    readonly run: (service: TemplatesService) => Promise<unknown>;
  }[] = [
    {
      name: 'ذخیرهٔ پیش‌نویس',
      run: (service) => service.saveDraft(SYSTEM_DEFINITION.id, { schemaVersion: 1 }, USER),
    },
    {
      name: 'انتشار نسخه',
      run: (service) => service.publish('ver-draft', USER),
    },
    {
      name: 'انتشار با اعمالِ هم‌زمان',
      run: (service) => service.publish('ver-draft', USER, true),
    },
    {
      name: 'تغییر نام',
      run: (service) => service.rename(SYSTEM_DEFINITION.id, 'نام تازه', USER),
    },
    {
      name: 'بایگانی',
      run: (service) => service.archive(SYSTEM_DEFINITION.id, USER),
    },
  ];

  it.each(cases)('$name رد می‌شود و چیزی نمی‌نویسد', async ({ run }) => {
    const writes = noWrites();
    const service = serviceWith(writes);

    await expect(run(service)).rejects.toThrow(/سیستمی/u);

    for (const [path, write] of Object.entries(writes)) {
      expect(write, `${path} نباید صدا زده شود`).not.toHaveBeenCalled();
    }
  });

  /*
    و کپی گرفتن **ممنوع نیست** — همان راهی است که برای عوض کردن گزارش باز
    گذاشته‌ایم. اگر این هم بسته شود، قالب سیستمی نه محافظت‌شده که بی‌مصرف است.
  */
  it('کپی گرفتن از قالب سیستمی همچنان ممکن است', async () => {
    const writes = noWrites();
    writes.definitionCreate.mockResolvedValue({ id: 'def-copy', name: 'کپی' });
    writes.versionCreate.mockResolvedValue({ id: 'ver-copy' });

    const service = serviceWith(writes);
    const prisma = (service as unknown as { prisma: PrismaService }).prisma;
    (
      prisma.reportDefinition.findUnique as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ...SYSTEM_DEFINITION,
      currentVersion: { id: 'ver-1', templateSchemaVersion: 1, template: { schemaVersion: 1 } },
      versions: [],
    });

    await service.copy(SYSTEM_DEFINITION.id, 'کپی من', USER);

    expect(writes.definitionCreate).toHaveBeenCalledTimes(1);
    // و قالب سیستمی خودش دست‌نخورده ماند.
    expect(writes.definitionUpdate).not.toHaveBeenCalled();
  });
});
