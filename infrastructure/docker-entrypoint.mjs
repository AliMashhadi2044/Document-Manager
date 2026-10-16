/**
 * نقطه ورود تصویر production.
 *
 * چرا Node و نه یک اسکریپت shell: مخزن روی ویندوز هم checkout می‌شود و یک فایل .sh
 * با پایان خط CRLF در لینوکس اصلاً اجرا نمی‌شود — خطایش هم گمراه‌کننده است
 * («no such file or directory» درباره مفسری که وجود دارد). Node به CR حساس نیست.
 *
 * دو کار اختیاری پیش از بالا آمدن سرویس:
 *  - RUN_MIGRATIONS=true  اجرای مهاجرت‌های پایگاه داده. پیش‌فرض خاموش است چون در
 *    استقرار چندنمونه‌ای، اجرای هم‌زمان مهاجرت از چند نمونه درست نیست.
 *  - RUN_SEED=true        ثبت داده مرجع (مجوز، نقش، فصل، قالب گزارش). بدون این داده
 *    سامانه قابل استفاده نیست. اسکریپت idempotent است.
 */
import { spawnSync } from 'node:child_process';

function run(label, command, args) {
  process.stdout.write(`▶ ${label}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.stderr.write(`✗ ${label} ناموفق بود\n`);
    process.exit(result.status ?? 1);
  }
}

if (process.env.RUN_MIGRATIONS === 'true') {
  run('اجرای مهاجرت‌های پایگاه داده', 'node', [
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
    '--schema',
    'apps/api/prisma/schema.prisma',
  ]);
}

if (process.env.RUN_SEED === 'true') {
  run('ثبت داده مرجع', 'node', ['apps/api/dist-seed/prisma/seed/reference.js']);
}

const [, , command, ...args] = process.argv;
if (!command) {
  process.stderr.write('فرمانی برای اجرا داده نشده است\n');
  process.exit(1);
}

const service = spawnSync(command, args, { stdio: 'inherit' });
process.exit(service.status ?? 1);
