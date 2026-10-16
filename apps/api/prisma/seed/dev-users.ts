/**
 * کاربران آزمون نقش‌ها — **فقط محیط توسعه**.
 *
 * چرا لازم شد: داده مرجع تنها یک کاربر می‌سازد (`admin` با نقش کارپردازی و مدیر
 * سامانه). تفکیک وظایف فاز ۵ در سطح تست واحد از روی گراف مسیرها بررسی می‌شود، ولی
 * آزمون زنده‌ی «بایگان این کار را می‌تواند و آن یکی را نمی‌تواند» بدون کاربرِ آن نقش
 * ممکن نیست.
 *
 * دو محافظ: در `NODE_ENV=production` با خطا متوقف می‌شود، و رمز عبور از متغیر محیطی
 * خوانده می‌شود؛ مقدار پیش‌فرض فقط در توسعه و با هشدار صریح استفاده می‌شود.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import type { RoleKey } from '@dm/shared';

const prisma = new PrismaClient();

interface DevUser {
  readonly username: string;
  readonly fullName: string;
  readonly roles: readonly RoleKey[];
}

const DEV_USERS: readonly DevUser[] = [
  { username: 'bayegan', fullName: 'کاربر بایگانی', roles: ['ARCHIVIST'] },
  { username: 'nazer', fullName: 'کاربر ناظر', roles: ['SUPERVISOR'] },
  { username: 'karpardaz', fullName: 'کاربر کارپردازی', roles: ['PROCUREMENT'] },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('این اسکریپت فقط برای محیط توسعه است');
  }

  const fromEnv = process.env.DEV_USER_PASSWORD;
  const password = fromEnv ?? 'Dev!2345';

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  for (const devUser of DEV_USERS) {
    const existing = await prisma.user.findUnique({ where: { username: devUser.username } });
    if (existing) {
      console.log(`• کاربر ${devUser.username} از قبل وجود دارد؛ رمز عبور تغییر نکرد`);
      continue;
    }

    const roles = await prisma.role.findMany({ where: { key: { in: [...devUser.roles] } } });
    if (roles.length !== devUser.roles.length) {
      throw new Error(
        `نقش‌های ${devUser.roles.join('، ')} یافت نشد؛ ابتدا داده مرجع را ثبت کنید (npm run db:seed)`,
      );
    }

    const user = await prisma.user.create({
      data: {
        username: devUser.username,
        fullName: devUser.fullName,
        passwordHash,
        preferences: { create: {} },
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
      },
    });

    console.log(`✓ ${devUser.username} (${devUser.roles.join('، ')}) ساخته شد — ${user.id}`);
  }

  if (!fromEnv) {
    console.warn(`⚠ رمز عبور پیش‌فرض «${password}» استفاده شد. فقط برای توسعه.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('ساخت کاربران آزمون ناموفق بود:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
