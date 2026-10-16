/**
 * خط لوله کیفیت — **یک تعریف، دو محل اجرا**.
 *
 * CI دقیقاً همین فایل را صدا می‌زند (`.github/workflows/ci.yml`) و روی ماشین توسعه
 * هم `npm run ci` همین را اجرا می‌کند. دلیلش ساده است: اگر فهرست مراحل در دو جا
 * نوشته شود، روزی که یکی عوض شود، «سبز بودن محلی» دیگر چیزی درباره CI نمی‌گوید.
 *
 * مرحله‌ها به ترتیب هزینه‌شان چیده شده‌اند: چیزی که زود و ارزان شکست می‌خورد، زودتر.
 * هیچ مرحله‌ای بی‌صدا رد نمی‌شود؛ مرحله‌های نیازمند پایگاه داده با `--with-db`
 * انتخاب می‌شوند و در غیر این صورت **صریحاً** به‌عنوان اجرانشده گزارش می‌شوند.
 *
 * اجرا:
 *   node scripts/ci.mjs              مرحله‌های بدون پایگاه داده
 *   node scripts/ci.mjs --with-db    به‌علاوه مهاجرت، داده مرجع و E2E
 */
import { spawnSync } from 'node:child_process';

const withDb = process.argv.includes('--with-db');

/** @type {Array<{ name: string, run: string, needsDb?: boolean }>} */
const STEPS = [
  { name: 'ساخت بسته‌های مشترک', run: 'npm run build' },
  { name: 'تولید کلاینت Prisma', run: 'npx prisma generate --schema apps/api/prisma/schema.prisma' },
  { name: 'بررسی نوع‌ها', run: 'npm run typecheck' },
  { name: 'lint', run: 'npm run lint' },
  { name: 'آزمون واحد', run: 'npx vitest run' },
  { name: 'ساخت API', run: 'npm run build -w @dm/api' },
  { name: 'ساخت رابط وب', run: 'npm run build -w @dm/web' },
  { name: 'مهاجرت پایگاه داده', run: 'npm run db:deploy -w @dm/api', needsDb: true },
  { name: 'داده مرجع', run: 'npm run db:seed -w @dm/api', needsDb: true },
  { name: 'کاربران آزمون', run: 'npm run db:seed:dev-users -w @dm/api', needsDb: true },
  { name: 'آزمون E2E', run: 'npx playwright test', needsDb: true },
];

const results = [];
let failed = null;

for (const step of STEPS) {
  if (step.needsDb && !withDb) {
    results.push({ step: step.name, state: 'اجرا نشد (بدون پایگاه داده)' });
    continue;
  }

  process.stdout.write(`\n▶ ${step.name}\n`);
  const started = Date.now();
  // فرمان به‌صورت **یک رشته** به shell داده می‌شود، نه نام اجرایی + آرایه آرگومان.
  // دلیلش ویندوز است: `npm` و `npx` فایل .cmd هستند و Node از نسخه ۱۸ به بعد اجرای
  // مستقیم .cmd را مسدود می‌کند؛ و شکل «آرایه آرگومان + shell» هم هشدار امنیتی
  // می‌دهد چون آرگومان‌ها escape نمی‌شوند. همه فرمان‌های این فایل ثابت و درون‌خطی‌اند.
  const run = spawnSync(step.run, { stdio: 'inherit', shell: true });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (run.status !== 0) {
    results.push({ step: step.name, state: `رد (${seconds}s)` });
    failed = step.name;
    break;
  }
  results.push({ step: step.name, state: `قبول (${seconds}s)` });
}

process.stdout.write('\n──────── خلاصه ────────\n');
for (const row of results) process.stdout.write(`  ${row.state.padEnd(22)} ${row.step}\n`);

if (failed) {
  process.stdout.write(`\n✗ خط لوله روی «${failed}» متوقف شد.\n`);
  process.exit(1);
}

const skipped = results.filter((row) => row.state.startsWith('اجرا نشد')).length;
process.stdout.write(
  skipped > 0
    ? `\n✓ ${results.length - skipped} مرحله قبول، ${skipped} مرحله اجرا نشد (برای اجرای کامل: --with-db).\n`
    : `\n✓ هر ${results.length} مرحله قبول شد.\n`,
);
