/**
 * داده مرجع — داده‌ای که برای **کارکرد** سامانه لازم است.
 *
 * این فایل در production هم اجرا می‌شود. داده آزمایشی اینجا نیست؛ آن در `demo.ts`
 * است و هرگز در production اجرا نمی‌شود (الزام §۳۶ پرامپت).
 *
 * idempotent است: اجرای چندباره بی‌خطر است.
 */

import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_KEYS,
  type Permission,
  type RoleKey,
} from '@dm/shared';
import * as argon2 from 'argon2';

import {
  seedBanks,
  seedBudgetStructure,
  seedFiscalYearsAndTaxRates,
  seedInvoiceTypes,
  seedLookups,
  seedOrganization,
  seedPaymentMethods,
} from './base-data';
import { seedProductTypesAndSignatories, seedReports } from './reports';

const prisma = new PrismaClient();

/** گروه مجوز از پیشوند کلید آن مشتق می‌شود. */
function groupOf(permission: Permission): string {
  return permission.split(':')[0] ?? 'other';
}

async function seedPermissions(): Promise<Map<Permission, string>> {
  const ids = new Map<Permission, string>();

  for (const key of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key },
      update: { titleFa: PERMISSION_LABELS[key], groupKey: groupOf(key) },
      create: { key, titleFa: PERMISSION_LABELS[key], groupKey: groupOf(key) },
    });
    ids.set(key, record.id);
  }

  console.log(`✓ ${PERMISSIONS.length} مجوز ثبت شد`);
  return ids;
}

async function seedRoles(permissionIds: Map<Permission, string>): Promise<Map<RoleKey, string>> {
  const ids = new Map<RoleKey, string>();

  for (const key of ROLE_KEYS) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { titleFa: ROLE_LABELS[key] },
      create: { key, titleFa: ROLE_LABELS[key], isSystem: true },
    });
    ids.set(key, role.id);

    const permissions = DEFAULT_ROLE_PERMISSIONS[key];

    // تخصیص‌ها را با فهرست مرجع هم‌راستا می‌کنیم: افزودن تازه‌ها و حذف حذف‌شده‌ها.
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { key: { notIn: [...permissions] } },
      },
    });

    for (const permission of permissions) {
      const permissionId = permissionIds.get(permission);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }

    console.log(`✓ نقش ${ROLE_LABELS[key]} با ${permissions.length} مجوز`);
  }

  return ids;
}

/**
 * تنظیمات پیش‌فرض سازمان.
 * نرخ مالیات ۱۰٪ (تصمیم Q4) به‌صورت **داده** ثبت می‌شود، نه ثابت در کد.
 */
async function seedSettings(): Promise<void> {
  const settings: Array<{ key: string; value: unknown }> = [
    // ADR-0012: پیش‌فرض سازمان؛ هر سند در لحظه ایجاد از این snapshot می‌گیرد.
    { key: 'rounding_policy', value: { scope: 'LINE', mode: 'HALF_UP' } },
    { key: 'default_tax_rate_bp', value: 1000 },
    { key: 'allow_discount_over_gross', value: false },
    { key: 'document_number_unique_scope', value: 'FISCAL_YEAR' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as never },
    });
  }

  console.log(`✓ ${settings.length} تنظیم پایه ثبت شد`);
}

/**
 * کاربر مدیر اولیه.
 *
 * رمز عبور از متغیر محیطی خوانده می‌شود. اگر تعیین نشده باشد، در محیط توسعه یک مقدار
 * شناخته‌شده استفاده می‌شود و هشدار صریح چاپ می‌گردد؛ در production **خطا** می‌دهد تا
 * هرگز حساب با رمز قابل حدس ساخته نشود.
 *
 * ترتیب دو بررسی زیر مهم است و یک‌بار اشتباه بود: بررسیِ رمز **پس از** بررسیِ وجودِ
 * کاربر می‌آید. وقتی حساب از قبل هست، هیچ رمزی ساخته نمی‌شود، پس خواستنِ
 * `SEED_ADMIN_PASSWORD` بی‌معناست — و با ترتیب برعکس، seedِ یک استقرارِ جاافتاده در
 * production همیشه خطا می‌داد و (با `RUN_SEED=true`) کانتینر را در حلقهٔ restart
 * می‌انداخت، درست در میانهٔ ارتقا.
 */
async function seedInitialUser(roleIds: Map<RoleKey, string>): Promise<void> {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const isProduction = process.env.NODE_ENV === 'production';
  const password = process.env.SEED_ADMIN_PASSWORD;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`• کاربر ${username} از قبل وجود دارد؛ رمز عبور تغییر نکرد`);
    return;
  }

  if (!password && isProduction) {
    throw new Error('SEED_ADMIN_PASSWORD در محیط production الزامی است');
  }

  const effectivePassword = password ?? 'Admin!2345';
  const passwordHash = await argon2.hash(effectivePassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.create({
    data: {
      username,
      fullName: 'مدیر سامانه',
      passwordHash,
      preferences: { create: {} },
    },
  });

  // کاربر اولیه هر دو نقش کارپردازی و مدیر سامانه را می‌گیرد تا راه‌اندازی ممکن باشد.
  for (const roleKey of ['PROCUREMENT', 'SYSTEM_ADMIN'] as const) {
    const roleId = roleIds.get(roleKey);
    if (roleId) {
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
    }
  }

  console.log(`✓ کاربر اولیه «${username}» ساخته شد`);
  if (!password) {
    console.warn(
      `⚠ رمز عبور پیش‌فرض «${effectivePassword}» استفاده شد. فقط برای توسعه؛ حتماً تغییرش دهید.`,
    );
  }
}

async function main(): Promise<void> {
  console.log('— ثبت داده مرجع —');
  const permissionIds = await seedPermissions();
  const roleIds = await seedRoles(permissionIds);
  await seedSettings();

  // فاز ۲ — اطلاعات پایه ساختاری. ترتیب مهم است: روش پرداخت پیش از نوع فاکتور،
  // و نوع فاکتور پیش از فصل‌ها (چون فصل به آن‌ها متصل می‌شود).
  await seedOrganization(prisma);
  await seedBanks(prisma);
  await seedPaymentMethods(prisma);
  await seedInvoiceTypes(prisma);
  await seedBudgetStructure(prisma);
  await seedLookups(prisma);
  await seedFiscalYearsAndTaxRates(prisma);

  // فاز ۶ — گزارش مالیات به‌صورت داده: نوع گزارش، قالب منتشرشده، انواع کالا و امضاکنندگان.
  await seedProductTypesAndSignatories(prisma);
  await seedReports(prisma);

  await seedInitialUser(roleIds);
  console.log('— پایان —');
}

main()
  .catch((error: unknown) => {
    console.error('ثبت داده مرجع ناموفق بود:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
