/**
 * آزمون **واقعی** بازیابی پشتیبان.
 *
 * چرا این اسکریپت وجود دارد: پشتیبانی که هرگز بازیابی نشده، پشتیبان نیست — فقط یک
 * فایل است. اینجا پشتیبان در یک پایگاه داده‌ی موقت بازیابی می‌شود و نتیجه با مبدأ
 * مقایسه می‌شود: هم تعداد ردیف‌ها و هم **جمع مبالغ** جدول‌های مالی.
 *
 * جمع مبالغ عمدی است و تعداد ردیف کافی نیست: بازیابی ناقصِ یک ستون BIGINT می‌تواند
 * تعداد ردیف درست و مبلغ غلط بدهد، و این بدترین حالت ممکن برای یک سامانه مالی است.
 *
 * پایگاه داده موقت در پایان **همیشه** حذف می‌شود، حتی اگر آزمون رد شود.
 *
 * اجرا: npm run restore:test
 */
import { unlinkSync } from 'node:fs';

import { backup, parseDatabaseUrl, runPgTool } from './backup.mjs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL تنظیم نشده است');
  process.exit(1);
}

const connection = parseDatabaseUrl(DATABASE_URL);
const scratch = `restore_check_${Date.now().toString().slice(-9)}`;

/** جدول‌هایی که سلامتشان معنا دارد، همراه ستون مبلغی که باید جمعش برابر بماند. */
const TABLES = [
  ['financial_documents', null],
  ['invoices', 'total_amount'],
  ['invoice_items', 'total_amount'],
  ['vendors', null],
  ['users', null],
  ['permissions', null],
  ['report_definitions', null],
  ['audit_logs', null],
];

function sql(database, statement) {
  const output = runPgTool(
    'psql',
    [
      '-h',
      connection.host,
      '-p',
      connection.port,
      '-U',
      connection.user,
      '-d',
      database,
      '-t',
      '-A',
      '-c',
      statement,
    ],
    connection,
    { encoding: 'utf8' },
  );
  return output.trim();
}

function fingerprint(database) {
  const rows = {};
  for (const [table, moneyColumn] of TABLES) {
    const exists = sql(database, `SELECT to_regclass('public.${table}') IS NOT NULL`);
    if (exists !== 't') {
      rows[table] = 'جدول وجود ندارد';
      continue;
    }
    const count = sql(database, `SELECT count(*) FROM "${table}"`);
    const sum = moneyColumn
      ? sql(database, `SELECT COALESCE(SUM("${moneyColumn}"), 0) FROM "${table}"`)
      : null;
    rows[table] = sum === null ? count : `${count} ردیف / جمع ${sum}`;
  }
  return rows;
}

let created = false;
let dumpPath = null;
let failures = 0;

try {
  console.log('▶ گرفتن پشتیبان از پایگاه داده مبدأ');
  const result = backup({ databaseUrl: DATABASE_URL, outputDir: process.env.BACKUP_DIR ?? 'backups' });
  dumpPath = result.path;
  console.log(`  ${(result.size / 1024 / 1024).toFixed(2)} مگابایت — ${result.path}`);

  console.log('▶ اثر انگشت مبدأ');
  const before = fingerprint(connection.database);
  for (const [table, value] of Object.entries(before)) console.log(`  ${table}: ${value}`);

  console.log(`▶ ساخت پایگاه داده موقت ${scratch}`);
  sql('postgres', `CREATE DATABASE "${scratch}"`);
  created = true;

  console.log('▶ بازیابی پشتیبان در پایگاه داده موقت');
  // ‎--exit-on-error عمدی است: بازیابی «با چند خطا ولی تمام‌شده» همان چیزی است که
  // در روز حادثه، آدم را به اشتباه مطمئن می‌کند.
  runPgTool(
    'pg_restore',
    [
      '-h',
      connection.host,
      '-p',
      connection.port,
      '-U',
      connection.user,
      '-d',
      scratch,
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
    ],
    connection,
    { input: await import('node:fs').then((fs) => fs.readFileSync(dumpPath)), stdin: true },
  );

  console.log('▶ اثر انگشت نسخه بازیابی‌شده');
  const after = fingerprint(scratch);
  for (const [table, value] of Object.entries(after)) console.log(`  ${table}: ${value}`);

  console.log('\n──────── مقایسه ────────');
  for (const [table] of TABLES) {
    const same = before[table] === after[table];
    if (!same) failures += 1;
    console.log(`  ${same ? 'OK  ' : 'FAIL'} ${table.padEnd(22)} ${before[table]}  →  ${after[table]}`);
  }

  // یک بررسی مستقل از فهرست بالا: هیچ جدولی نباید جا افتاده باشد.
  const sourceTables = sql(
    connection.database,
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
  );
  const restoredTables = sql(
    scratch,
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
  );
  const sameTableCount = sourceTables === restoredTables;
  if (!sameTableCount) failures += 1;
  console.log(
    `  ${sameTableCount ? 'OK  ' : 'FAIL'} ${'تعداد جدول‌ها'.padEnd(22)} ${sourceTables}  →  ${restoredTables}`,
  );
} finally {
  if (created) {
    try {
      sql('postgres', `DROP DATABASE "${scratch}" WITH (FORCE)`);
      console.log(`\n✓ پایگاه داده موقت ${scratch} حذف شد`);
    } catch (error) {
      console.error(`⚠ حذف پایگاه داده موقت ${scratch} ناموفق بود:`, String(error).slice(0, 200));
    }
  }
  if (dumpPath && process.env.KEEP_BACKUP !== 'true') {
    try {
      unlinkSync(dumpPath);
      console.log('✓ فایل پشتیبان آزمونی حذف شد (برای نگه داشتن: KEEP_BACKUP=true)');
    } catch {
      /* فایل قبلاً نبوده */
    }
  }
}

console.log(
  failures === 0
    ? '\n✓ بازیابی کامل و سالم بود: تعداد ردیف‌ها و جمع مبالغ یکسان‌اند.'
    : `\n✗ بازیابی ${failures} ناهمخوانی داشت.`,
);
process.exit(failures === 0 ? 0 : 1);
