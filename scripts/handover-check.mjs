/**
 * چک‌لیست تحویل — بندهایی که ماشین می‌تواند بسنجد.
 *
 * `docs/18-operations.md §۶` فهرستی است که تا امروز دستی تیک می‌خورد؛ و فهرست دستی
 * یعنی بندی که کسی یادش رفته. این اسکریپت همان بندها را **می‌سنجد**، نه اینکه
 * یادآوری کند: کلید نشست، تنظیم‌های خطرناک، کاربران آزمایشی، و تازگی پشتیبان.
 *
 * بندهایی که ماشین نمی‌تواند ببیند (TLS جلوی سرویس، زمان‌بندی پشتیبان در سامانهٔ
 * میزبان) صریحاً **دستی** علامت می‌خورند، نه سبز — سبزِ دروغ، بدتر از قرمز است.
 *
 * اجرا:
 *   npm run check:handover
 *   DATABASE_URL=… npm run check:handover
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

let pass = 0;
let fail = 0;
let manual = 0;
const lines = [];

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    lines.push(`  OK    ${name}`);
  } else {
    fail += 1;
    lines.push(`  FAIL  ${name}  >> ${detail ?? ''}`);
  }
}

function byHand(name, why) {
  manual += 1;
  lines.push(`  دستی  ${name}  >> ${why}`);
}

function section(title) {
  lines.push('', `── ${title}`);
}

/** نام‌هایی که بوی حساب آزمایشی می‌دهند. */
const TEST_USERNAME = /^(t\.|test|demo|sample|dev\.)/iu;
const BACKUP_MAX_AGE_HOURS = 48;

async function main() {
  section('۱. تنظیمات محیطی');

  const env = process.env;
  const secret = env.SESSION_SECRET ?? '';
  check('SESSION_SECRET تنظیم شده و به‌اندازه کافی بلند است', secret.length >= 32, 'کوتاه یا خالی');
  check(
    'SESSION_SECRET نمونه نیست',
    secret !== '' && !secret.includes('dev_only') && !secret.includes('CHANGE_ME'),
    'مقدار نمونه در محیط واقعی مجاز نیست',
  );
  check(
    'EXPOSE_QUERY_COUNT خاموش است',
    (env.EXPOSE_QUERY_COUNT ?? 'false') !== 'true',
    'شمارنده کوئری نباید در production روشن باشد',
  );
  check(
    'NODE_ENV روی production است',
    env.NODE_ENV === 'production',
    `اکنون: ${env.NODE_ENV ?? 'تنظیم نشده'}`,
  );

  // TRUST_PROXY هر دو حالتش می‌تواند درست باشد؛ فقط باید **آگاهانه** باشد.
  lines.push(`  نکته  TRUST_PROXY = ${env.TRUST_PROXY ?? 'false'} — اگر proxy جلوی سرویس است باید true باشد`);

  section('۲. کاربران');

  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: { username: true, isActive: true, lastLoginAt: true },
    });

    const testUsers = users.filter((user) => user.isActive && TEST_USERNAME.test(user.username));
    check(
      'هیچ کاربر آزمایشیِ فعالی نمانده است',
      testUsers.length === 0,
      testUsers.map((user) => user.username).join('، '),
    );

    const admins = await prisma.user.count({
      where: {
        isActive: true,
        roles: { some: { role: { permissions: { some: { permission: { key: 'user:write' } } } } } },
      },
    });
    check('دست‌کم یک مدیرِ فعال هست', admins > 0, 'هیچ کاربر فعالی مجوز مدیریت کاربران ندارد');

    byHand(
      'رمز اولیه مدیر عوض شده است',
      'سرور رمز را نمی‌خواند؛ از مدیر بپرسید و در مدیریت راز سازمان ثبت کنید',
    );
  } finally {
    await prisma.$disconnect();
  }

  section('۳. پشتیبان');

  const backupDir = env.BACKUP_DIR ?? join(process.cwd(), 'backups');
  const files = existsSync(backupDir)
    ? readdirSync(backupDir)
        .filter((name) => name.endsWith('.dump'))
        .map((name) => ({ name, mtime: statSync(join(backupDir, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
    : [];

  const newest = files[0];
  const ageHours = newest ? (Date.now() - newest.mtime) / 3_600_000 : Infinity;

  check(
    `پشتیبانِ تازه‌تر از ${BACKUP_MAX_AGE_HOURS} ساعت وجود دارد`,
    ageHours <= BACKUP_MAX_AGE_HOURS,
    newest ? `تازه‌ترین: ${newest.name} (${Math.round(ageHours)} ساعت پیش)` : `هیچ فایلی در ${backupDir} نیست`,
  );

  byHand('پشتیبان‌گیری زمان‌بندی‌شده فعال است', 'زمان‌بند بیرون از سرویس است — cron یا سرویس جانبی');
  byHand('فایل‌های S3 هم پشتیبان دارند', 'پشتیبان پایگاه داده به‌تنهایی سامانه را برنمی‌گرداند');
  byHand('یک بازیابی آزمایشی انجام شده', 'npm run restore:test');

  section('۴. شبکه');
  byHand('TLS جلوی سرویس برقرار است', 'کوکی نشست فقط پشت TLS نشان Secure می‌گیرد');

  console.log(lines.join('\n'));
  console.log(`\nموفق: ${pass}   ناموفق: ${fail}   دستی: ${manual}`);

  if (fail > 0) process.exitCode = 1;
}

await main();
