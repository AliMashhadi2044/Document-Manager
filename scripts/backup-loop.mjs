/**
 * زمان‌بند پشتیبان‌گیری — یک حلقهٔ ساده، برای اجرا در کنار سرویس.
 *
 * چرا این و نه cron: تصویر production یک کانتینر Node است و گذاشتن cron داخلش
 * یعنی یک سیستمِ زمان‌بندی دیگر که باید لاگ و خطایش را جداگانه دید. یک حلقه، با
 * همان لاگِ سرویس، چیزی است که بهره‌بردار واقعاً نگاهش می‌کند.
 *
 * اگر سازمان زمان‌بند خودش را دارد (cron میزبان، Task Scheduler ویندوز)، همان
 * بهتر است؛ این برای جایی است که چیزی در کار نیست و پشتیبان‌گیری عملاً انجام
 * نمی‌شد.
 *
 * نکتهٔ مهم: پشتیبانِ پایگاه داده **کافی نیست** — فایل‌های پیوست در S3 می‌مانند و
 * جداگانه باید پشتیبان‌گیری شوند (docs/18-operations.md §۳).
 *
 * اجرا:
 *   BACKUP_EVERY_HOURS=24 BACKUP_DIR=/backups node scripts/backup-loop.mjs
 */
import { spawn } from 'node:child_process';

const everyHours = Number(process.env.BACKUP_EVERY_HOURS ?? 24);
const intervalMs = Math.max(1, everyHours) * 60 * 60 * 1000;

function runBackup() {
  return new Promise((resolve) => {
    const started = new Date().toISOString();
    console.log(`▶ پشتیبان‌گیری آغاز شد (${started})`);

    const child = spawn(process.execPath, ['scripts/backup.mjs'], { stdio: 'inherit' });

    child.on('exit', (code) => {
      // شکستِ یک دور، حلقه را نمی‌خواباند: دور بعدی باز تلاش می‌کند و خطا در لاگ
      // دیده می‌شود. حلقه‌ای که با اولین خطا می‌میرد، یعنی ماه‌ها بدون پشتیبان.
      if (code === 0) console.log('✓ پشتیبان‌گیری انجام شد');
      else console.error(`✗ پشتیبان‌گیری ناموفق بود (کد ${code})`);
      resolve(code ?? 1);
    });
  });
}

await runBackup();
setInterval(() => void runBackup(), intervalMs);

console.log(`زمان‌بند پشتیبان‌گیری فعال است: هر ${everyHours} ساعت`);
