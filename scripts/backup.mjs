/**
 * پشتیبان‌گیری از پایگاه داده.
 *
 * قالب `custom` (‎-Fc) عمدی است، نه SQL ساده: فشرده است، بازیابی **گزینشی** جدول‌ها
 * را ممکن می‌کند و `pg_restore` می‌تواند موازی بازیابی کند.
 *
 * یک نکته مهم درباره شمول: فایل‌های پیوست در پایگاه داده نیستند؛ در فضای ذخیره‌سازی
 * S3 می‌مانند و **جداگانه** باید پشتیبان‌گیری شوند (docs/18-operations.md §۳).
 * پشتیبانِ تنهای پایگاه داده، سامانه را کامل برنمی‌گرداند.
 *
 * اجرا:
 *   npm run backup                      خروجی در backups/
 *   BACKUP_DIR=/mnt/backup npm run backup
 *
 * اتصال از `DATABASE_URL` خوانده می‌شود. اگر `PG_CONTAINER` تنظیم باشد، ابزارهای
 * postgres داخل همان کانتینر اجرا می‌شوند — روی ماشین توسعه که کلاینت postgres نصب
 * نیست، تنها راه عملی همین است.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function parseDatabaseUrl(raw) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  };
}

/**
 * اجرای یک ابزار postgres — روی میزبان یا داخل کانتینر.
 *
 * رمز عبور از راه متغیر محیطی `PGPASSWORD` می‌رود، نه در خط فرمان: خط فرمان در
 * فهرست پردازه‌های سیستم برای همه قابل دیدن است.
 */
export function runPgTool(tool, args, connection, options = {}) {
  const container = process.env.PG_CONTAINER;

  if (container) {
    // داخل کانتینر، میزبان و پورتِ میزبان معنا ندارند: سرور همان‌جاست و روی پورت
    // داخلی ۵۴۳۲ گوش می‌دهد، نه پورت نگاشت‌شده روی میزبان.
    const inside = [...args];
    const replace = (flag, value) => {
      const index = inside.indexOf(flag);
      if (index !== -1) inside[index + 1] = value;
    };
    replace('-h', process.env.PG_CONTAINER_HOST ?? 'localhost');
    replace('-p', process.env.PG_CONTAINER_PORT ?? '5432');

    const docker = [
      'exec',
      '-e',
      `PGPASSWORD=${connection.password}`,
      ...(options.stdin ? ['-i'] : []),
      container,
      tool,
      ...inside,
    ];
    return execFileSync('docker', docker, {
      maxBuffer: 1024 * 1024 * 1024,
      input: options.input,
      encoding: options.encoding,
    });
  }

  return execFileSync(tool, args, {
    env: { ...process.env, PGPASSWORD: connection.password },
    maxBuffer: 1024 * 1024 * 1024,
    input: options.input,
    encoding: options.encoding,
  });
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

export function backup({ databaseUrl, outputDir }) {
  const connection = parseDatabaseUrl(databaseUrl);
  mkdirSync(outputDir, { recursive: true });

  const name = `${connection.database}-${timestamp()}.dump`;
  const hostPath = join(outputDir, name);
  const container = process.env.PG_CONTAINER;

  // داخل کانتینر مسیر میزبان وجود ندارد؛ خروجی روی stdout می‌آید و اینجا نوشته می‌شود.
  const args = [
    '-h',
    connection.host,
    '-p',
    connection.port,
    '-U',
    connection.user,
    '-d',
    connection.database,
    '--format=custom',
    '--compress=6',
    '--no-owner',
    '--no-privileges',
  ];

  const data = runPgTool('pg_dump', args, connection, { encoding: 'buffer' });
  writeFileSync(hostPath, data);

  const size = statSync(hostPath).size;
  return { path: hostPath, size, container: container ?? null };
}

if (process.argv[1] && process.argv[1].endsWith('backup.mjs')) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL تنظیم نشده است');
    process.exit(1);
  }

  const result = backup({
    databaseUrl,
    outputDir: process.env.BACKUP_DIR ?? 'backups',
  });

  console.log(`✓ پشتیبان ساخته شد: ${result.path}`);
  console.log(`  اندازه: ${(result.size / 1024 / 1024).toFixed(2)} مگابایت`);
  console.log('  توجه: فایل‌های پیوست در این پشتیبان نیستند و جداگانه باید گرفته شوند.');
}
