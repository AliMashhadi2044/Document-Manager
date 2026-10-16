/**
 * سنجش کارایی روی داده حجیم — با عدد ثبت‌شده، نه حس.
 *
 * اهداف از `docs/11-testing-plan.md §۶`:
 *   - فهرست اسناد با فیلتر ترکیبی  < ۳۰۰ms
 *   - گزارش مالیات یک سند          < ۱s
 *
 * سه نکته روش‌شناسی که نتیجه بدون آن‌ها بی‌معنا می‌شود:
 *
 *  ۱. داده حجیم موقت ساخته می‌شود (پیش‌فرض ۲۰٬۰۰۰ سند و ۶۰٬۰۰۰ فاکتور) و در پایان
 *     **همیشه** پاک می‌شود. اندازه‌گیری روی ۵۰ ردیف چیزی ثابت نمی‌کند.
 *  ۲. چند اجرای گرم‌کننده کنار گذاشته می‌شود؛ اولین درخواست شامل اتصال و کامپایل
 *     پلن است و نماینده بار واقعی نیست.
 *  ۳. میانه و صدک ۹۵ گزارش می‌شود، نه میانگین: میانگین یک درخواست کند را پنهان
 *     می‌کند، و کاربر دقیقاً همان را حس می‌کند.
 *
 * اجرا: npm run perf:phase9
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE ?? 'http://localhost:3100/api/v1';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin!2345';
const MARKER = 'PERF_PHASE9';
const DOCUMENT_COUNT = Number(process.env.PERF_DOCUMENTS ?? 20_000);
const INVOICE_PER_DOCUMENT = Number(process.env.PERF_INVOICES_PER_DOCUMENT ?? 3);
const WARMUP = 3;
const RUNS = Number(process.env.PERF_RUNS ?? 20);

const prisma = new PrismaClient();
const cookies = new Map();

function cookieHeader() {
  return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function call(method, path, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      cookie: cookieHeader(),
      'x-csrf-token': cookies.get('dm_csrf') ?? '',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}

async function measure(label, target, run) {
  for (let i = 0; i < WARMUP; i += 1) await run();

  const samples = [];
  for (let i = 0; i < RUNS; i += 1) {
    const started = performance.now();
    const response = await run();
    samples.push(performance.now() - started);
    if (!response.ok) {
      return { label, target, failed: `پاسخ ${response.status}` };
    }
  }

  samples.sort((a, b) => a - b);
  const at = (q) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))];
  return {
    label,
    target,
    min: samples[0],
    p50: at(0.5),
    p95: at(0.95),
    max: samples[samples.length - 1],
  };
}

async function seedVolume() {
  const template = await prisma.financialDocument.findFirst({
    where: { invoices: { some: {} } },
    include: { invoices: { take: 1 } },
  });
  if (!template || template.invoices.length === 0) {
    throw new Error('برای ساخت داده حجیم، دست‌کم یک سند با فاکتور لازم است.');
  }
  const invoice = template.invoices[0];

  console.log(`• ساخت ${DOCUMENT_COUNT.toLocaleString('en-US')} سند موقت…`);
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO financial_documents (
      id, title, type, fiscal_year, jalali_year, status,
      buyer_entity_id, buyer_snapshot_id, rounding_policy,
      total_gross, total_discount, total_net, total_tax, total_amount,
      open_feedback_count, created_by_id, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      '${MARKER} ' || n,
      'NORMAL'::"document_type",
      1400 + (n % 6),
      1400 + (n % 6),
      (ARRAY['DRAFT','FINALIZED','PENDING_ARCHIVE']::"document_status"[])[1 + (n % 3)],
      $1::uuid, $2::uuid, $3::jsonb,
      1000000 + n, 0, 1000000 + n, 100000, 1100000 + n,
      0, $4::uuid,
      NOW() - (n || ' minutes')::interval,
      NOW()
    FROM generate_series(1, ${DOCUMENT_COUNT}) AS n
    `,
    template.buyerEntityId,
    template.buyerSnapshotId,
    JSON.stringify(template.roundingPolicy),
    template.createdById,
  );

  console.log(
    `• ساخت ${(DOCUMENT_COUNT * INVOICE_PER_DOCUMENT).toLocaleString('en-US')} فاکتور موقت…`,
  );
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO invoices (
      id, document_id, document_type, invoice_type_id, invoice_kind,
      chapter_id, chapter_title_snapshot, chapter_code_snapshot,
      vendor_id, vendor_snapshot_id, buyer_snapshot_id,
      invoice_number, invoice_date, tax_mode, tax_rate_bp,
      gross_amount, discount_amount, net_amount, tax_amount, total_amount,
      custom_fields_schema_version, sort_index, created_by_id, created_at, updated_at
    )
    SELECT
      gen_random_uuid(), d.id, 'NORMAL'::"document_type", $1::uuid, 'NORMAL'::"invoice_kind",
      $2::uuid, $3, $4,
      $5::uuid, $6::uuid, $7::uuid,
      'PERF-' || k || '-' || substr(d.id::text, 1, 8),
      (CURRENT_DATE - (k * 7))::date,
      'PERCENT'::"tax_mode", 1000,
      1000000 + k, 0, 1000000 + k, 100000, 1100000 + k,
      1, k, $8::uuid,
      NOW(), NOW()
    FROM financial_documents d
    CROSS JOIN generate_series(1, ${INVOICE_PER_DOCUMENT}) AS k
    WHERE d.title LIKE '${MARKER} %'
    `,
    invoice.invoiceTypeId,
    invoice.chapterId,
    invoice.chapterTitleSnapshot,
    invoice.chapterCodeSnapshot,
    invoice.vendorId,
    invoice.vendorSnapshotId,
    invoice.buyerSnapshotId,
    invoice.createdById,
  );

  // بدون ANALYZE، آماره‌های جدول قدیمی‌اند و برنامه‌ریز کوئری پلن نامربوط می‌سازد.
  console.log('• به‌روزرسانی آماره‌ها (ANALYZE)…');
  await prisma.$executeRawUnsafe('ANALYZE financial_documents, invoices');
}

async function cleanupVolume() {
  console.log('• پاک کردن داده موقت…');
  const removed = await prisma.$executeRawUnsafe(
    `DELETE FROM financial_documents WHERE title LIKE '${MARKER} %'`,
  );
  console.log(`  ${removed.toLocaleString('en-US')} سند موقت پاک شد.`);
}

const results = [];

try {
  await call('POST', '/auth/login', { username: 'admin', password: ADMIN_PASSWORD });

  const before = await (await call('GET', '/documents?pageSize=1')).json();
  const realDocument = before.items?.[0];

  await seedVolume();

  const counts = await prisma.$queryRawUnsafe(
    'SELECT (SELECT count(*) FROM financial_documents) AS documents, (SELECT count(*) FROM invoices) AS invoices',
  );
  const volume = {
    documents: Number(counts[0].documents),
    invoices: Number(counts[0].invoices),
  };
  console.log(`• حجم داده هنگام سنجش: ${volume.documents} سند، ${volume.invoices} فاکتور\n`);

  results.push(
    await measure('فهرست اسناد، صفحه اول', 300, () => call('GET', '/documents?page=1&pageSize=25')),
  );
  results.push(
    await measure('فهرست اسناد با فیلتر ترکیبی', 300, () =>
      call('GET', '/documents?page=1&pageSize=25&status=FINALIZED&fiscalYear=1403&search=PERF'),
    ),
  );
  results.push(
    await measure('فهرست اسناد، صفحه عمیق (۲۰۰)', 300, () =>
      call('GET', '/documents?page=200&pageSize=25'),
    ),
  );

  // گزارش‌گیری عمومی روی همان حجم.
  results.push(
    await measure('گزارش فاکتورها با فیلتر و مرتب‌سازی', 300, () =>
      call('POST', '/analytics/invoices/query', {
        columns: ['invoiceNumber', 'invoiceDate', 'totalAmount'],
        sort: [{ field: 'invoiceDate', dir: 'desc' }],
        page: 1,
        pageSize: 25,
      }),
    ),
  );

  if (realDocument) {
    results.push(
      await measure('جزئیات سند با همه فاکتورها', 300, () =>
        call('GET', `/documents/${realDocument.id}`),
      ),
    );

    const types = await (await call('GET', '/reports/types')).json();
    const typeKey = (Array.isArray(types) ? types : (types?.items ?? []))[0]?.key;
    if (typeKey) {
      results.push(
        await measure('گزارش مالیات یک سند (HTML)', 1000, () =>
          call('POST', `/reports/${typeKey}/documents/${realDocument.id}/html`, {}),
        ),
      );
      results.push(
        await measure('گزارش مالیات یک سند (PDF)', 5000, () =>
          call('POST', `/reports/${typeKey}/documents/${realDocument.id}/pdf`, {}),
        ),
      );
    }
  }

  const rows = results.map((result) =>
    result.failed
      ? `| ${result.label} | — | — | — | — | ${result.target} | ✗ ${result.failed} |`
      : `| ${result.label} | ${result.min.toFixed(0)} | ${result.p50.toFixed(0)} | ${result.p95.toFixed(0)} | ${result.max.toFixed(0)} | ${result.target} | ${result.p95 <= result.target ? '✅' : '❌'} |`,
  );

  const document = [
    '<!-- این فایل با `npm run perf:phase9` تولید می‌شود؛ دستی ویرایش نکنید. -->',
    '',
    '# ۱۹ — اندازه‌گیری کارایی (فاز ۹)',
    '',
    `تاریخ اجرا: ${new Date().toISOString()}`,
    '',
    `حجم داده هنگام سنجش: **${volume.documents.toLocaleString('en-US')} سند** و ` +
      `**${volume.invoices.toLocaleString('en-US')} فاکتور**.`,
    '',
    `هر مسیر ${WARMUP} بار گرم و ${RUNS} بار اندازه‌گیری شد. اعداد بر حسب میلی‌ثانیه و`,
    'شامل رفت‌وبرگشت HTTP روی لوپ‌بک هستند (یعنی کمی بیشتر از زمان خالص سرور).',
    '',
    'معیار پذیرش روی **صدک ۹۵** سنجیده می‌شود، نه میانه: کاربر کندترین درخواست‌ها را',
    'به یاد می‌آورد، نه متوسط را.',
    '',
    '| مسیر | کمینه | میانه | صدک ۹۵ | بیشینه | هدف | نتیجه |',
    '| --- | ---: | ---: | ---: | ---: | ---: | :---: |',
    ...rows,
    '',
    '## روش',
    '',
    '- داده حجیم موقت ساخته و پس از اندازه‌گیری پاک می‌شود؛ `ANALYZE` پیش از سنجش اجرا',
    '  می‌شود تا برنامه‌ریز کوئری با آماره واقعی کار کند.',
    '- «صفحه عمیق» عمدی است: مشکل صفحه‌بندی مبتنی بر OFFSET در صفحه اول دیده نمی‌شود.',
    '- خروجی PDF هدف جداگانه دارد چون رندر مرورگر واقعی است، نه کوئری؛ معیار §۶ برای',
    '  آن تعیین نشده و عدد ۵ ثانیه، سقف عملی این پروژه است.',
    '',
  ].join('\n');

  writeFileSync('docs/19-performance.md', document);

  console.log('\n──────── نتیجه ────────');
  for (const result of results) {
    if (result.failed) {
      console.log(`  ✗ ${result.label}: ${result.failed}`);
      continue;
    }
    const ok = result.p95 <= result.target;
    console.log(
      `  ${ok ? '✅' : '❌'} ${result.label.padEnd(38)} میانه ${result.p50.toFixed(0)}ms، صدک۹۵ ${result.p95.toFixed(0)}ms (هدف ${result.target}ms)`,
    );
  }
  console.log('\nنتیجه در docs/19-performance.md ثبت شد.');
} finally {
  await cleanupVolume();
  await prisma.$disconnect();
}

const missed = results.filter((result) => result.failed || result.p95 > result.target);
process.exit(missed.length === 0 ? 0 : 1);
