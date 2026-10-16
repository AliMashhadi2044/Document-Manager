/**
 * ثبت پلن اجرای کوئری‌های اصلی گزارش‌گیری (معیار پذیرش ۵ فاز ۸).
 *
 * روش کار، و دلیل هر انتخاب:
 *
 *  ۱. **SQL واقعی از خودِ Prisma گرفته می‌شود**، نه SQL دست‌نویسی که «شبیه» آن باشد.
 *     کوئری‌ها با همان سرویس‌ها و همان درخواست‌هایی که رابط کاربری می‌فرستد اجرا
 *     می‌شوند و SQL از رویداد `query` کلاینت خوانده می‌شود. پلنِ یک SQL تقریبی،
 *     چیزی درباره برنامه واقعی ثابت نمی‌کند.
 *
 *  ۲. **داده حجیم موقت ساخته می‌شود.** روی پایگاه داده توسعه با چند ده ردیف،
 *     Postgres درست‌ترین کار را می‌کند و Seq Scan را انتخاب می‌کند؛ پلنی که روی
 *     ۳۰ ردیف گرفته شده باشد، هیچ‌چیز درباره جدول بزرگ نمی‌گوید. پس این اسکریپت
 *     ۲۰٬۰۰۰ سند و ۶۰٬۰۰۰ فاکتور **نشان‌دار** می‌سازد، پلن‌ها را می‌گیرد، و در
 *     پایان همان ردیف‌ها را پاک می‌کند (`finally`، تا با خطا هم پاک شوند).
 *
 *  ۳. خروجی در `docs/17-query-plans.md` نوشته می‌شود — «ثبت‌شده» یعنی قابل بازبینی،
 *     نه یک خط «بررسی شد».
 *
 * اجرا: `npm run explain:phase8`
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const MARKER = 'VOLUME_PLAN_TEST';
const DOCUMENT_COUNT = Number(process.env.PLAN_DOCUMENTS ?? 20_000);
const INVOICE_PER_DOCUMENT = Number(process.env.PLAN_INVOICES_PER_DOCUMENT ?? 3);

const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });

/** آخرین کوئری‌های اجراشده، به‌ترتیب. */
const captured = [];
prisma.$on('query', (event) => {
  // کوئری‌های خودِ اسکریپت (ساخت داده و EXPLAIN) ثبت نمی‌شوند.
  if (/^(INSERT|DELETE|EXPLAIN|BEGIN|COMMIT|SET|ANALYZE)/iu.test(event.query.trim())) return;
  captured.push({ sql: event.query, params: event.params });
});

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
      -- وضعیت ARCHIVED شماره و تاریخ سند لازم دارد (قید
      -- financial_documents_archived_number_ck)؛ داده موقت سه وضعیت دیگر را
      -- می‌گیرد تا قید واقعی دیتابیس دور زده نشود.
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

  console.log(`• ساخت ${(DOCUMENT_COUNT * INVOICE_PER_DOCUMENT).toLocaleString('en-US')} فاکتور موقت…`);
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
      'VOL-' || k || '-' || substr(d.id::text, 1, 8),
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

  // بدون ANALYZE، آماره‌های جدول قدیمی‌اند و پلن به داده تازه ربطی ندارد.
  console.log('• به‌روزرسانی آماره‌ها (ANALYZE)…');
  await prisma.$executeRawUnsafe('ANALYZE financial_documents, invoices');
}

async function cleanupVolume() {
  console.log('• پاک کردن داده موقت…');
  // فاکتورها با آبشار حذف سند پاک می‌شوند.
  const removed = await prisma.$executeRawUnsafe(
    `DELETE FROM financial_documents WHERE title LIKE '${MARKER} %'`,
  );
  await prisma.$executeRawUnsafe('ANALYZE financial_documents, invoices');
  console.log(`  ${removed} سند موقت پاک شد.`);
}

async function tableSizes() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT relname AS table, n_live_tup AS rows
    FROM pg_stat_user_tables
    WHERE relname IN ('financial_documents','invoices','audit_logs','vendors','review_feedbacks','archive_metadata')
    ORDER BY n_live_tup DESC
  `);
  return rows.map((row) => ({ table: row.table, rows: Number(row.rows) }));
}

/** اجرای یک سناریو و برگرداندن SQLهایی که Prisma برایش زد. */
async function capture(title, run) {
  captured.length = 0;
  await run();
  return { title, statements: [...captured] };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function explain(sql, rawParams) {
  let params = [];
  try {
    params = JSON.parse(rawParams ?? '[]');
  } catch {
    params = [];
  }

  /*
   * پارامتر UUID باید صریح cast شود.
   *
   * Prisma مقدار را با نوع درست می‌فرستد، ولی وقتی همان SQL را دستی با پارامتر
   * رشته‌ای اجرا می‌کنیم، Postgres می‌گوید «operator does not exist: uuid = text».
   * پس در متن EXPLAIN، جایگاه‌های پارامترِ UUID با cast نوشته می‌شوند.
   */
  let explained = sql;
  params.forEach((value, index) => {
    if (typeof value === 'string' && UUID_PATTERN.test(value)) {
      explained = explained.replaceAll(`$${index + 1}`, `$${index + 1}::uuid`);
    }
  });

  // پارامترهای تاریخ به‌صورت رشته ISO می‌آیند؛ Postgres خودش تبدیل می‌کند.
  try {
    const plan = await prisma.$queryRawUnsafe(
      `EXPLAIN (ANALYZE, COSTS, TIMING OFF, SUMMARY OFF) ${explained}`,
      ...params,
    );
    return plan.map((row) => row['QUERY PLAN']).join('\n');
  } catch (error) {
    return `(پلن گرفته نشد: ${error instanceof Error ? error.message.split('\n')[0] : 'خطای نامشخص'})`;
  }
}

/**
 * داوری پلن.
 *
 * «پیمایش کامل» به‌خودیِ‌خود نقص نیست: کوئریِ تجمیعی که دو‌سوم جدول را جمع می‌زند با
 * ایندکس **کندتر** می‌شود و planner درست انتخاب می‌کند. آنچه نقص است، پیمایش کامل
 * برای خواندن **بخش کوچکی** از جدول است. پس نسبت ردیف‌های پیمایش‌شده به کل جدول
 * سنجیده می‌شود، نه وجود عبارت «Seq Scan».
 */
const SELECTIVE_RATIO = 0.25;

function judge(plan, sizes) {
  if (plan.startsWith('PLAN_FAILED')) {
    return {
      warn: true,
      text: `⚠️ **پلن این کوئری گرفته نشد** — پس چیزی درباره‌اش اثبات نشده است. ${plan}`,
    };
  }

  const match =
    /Seq Scan on (financial_documents|invoices|audit_logs)\b[^\n]*actual rows=(\d+)/u.exec(plan);
  if (!match) return { warn: false, text: '✅ بدون پیمایش کامل روی جدول بزرگ.' };

  const table = match[1];
  const scanned = Number(match[2]);
  const total = sizes.find((size) => size.table === table)?.rows ?? 0;
  const ratio = total === 0 ? 1 : scanned / total;
  const percent = Math.round(ratio * 100);
  const scope = `${scanned.toLocaleString('en-US')} از ${total.toLocaleString('en-US')} ردیف (${percent}٪)`;

  if (ratio >= SELECTIVE_RATIO) {
    return {
      warn: false,
      text:
        `✅ پیمایش کامل \`${table}\` روی ${scope}. این کوئری **تجمیعی** است و بخش بزرگی ` +
        'از جدول را می‌خواند؛ در این نسبت، خواندن ترتیبی از خواندن با ایندکس ارزان‌تر است ' +
        'و انتخاب planner درست است.',
    };
  }

  return {
    warn: true,
    text:
      `⚠️ **پیمایش کامل \`${table}\`** برای تنها ${scope} — فیلتر باریک است و باید از ایندکس ` +
      'استفاده کند. این یک نقص است.',
  };
}

async function main() {
  const user = await prisma.user.findFirst({ where: { username: 'admin' } });
  if (!user) throw new Error('کاربر admin پیدا نشد.');

  await seedVolume();

  try {
    const sizes = await tableSizes();
    console.log('• اندازه جدول‌ها:', sizes.map((s) => `${s.table}=${s.rows}`).join(' '));

    const scenarios = [];

    // ۱. فهرست اسناد (همان کوئری مسیر /documents و گزارش «اسناد»)
    scenarios.push(
      await capture('فهرست اسناد — دامنه دسترسی + مرتب‌سازی پیش‌فرض + صفحه‌بندی', async () => {
        await prisma.financialDocument.findMany({
          where: { status: { not: 'DRAFT' } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true, title: true, status: true, totalAmount: true },
          skip: 0,
          take: 25,
        });
        await prisma.financialDocument.count({ where: { status: { not: 'DRAFT' } } });
      }),
    );

    // ۲. گزارش فاکتورها با فیلتر مبلغ و مرتب‌سازی تاریخ
    scenarios.push(
      await capture('گزارش فاکتورها — فیلتر مبلغ + مرتب‌سازی تاریخ صورتحساب', async () => {
        await prisma.invoice.findMany({
          where: {
            AND: [{ document: { status: { not: 'DRAFT' } } }, { totalAmount: { gt: 1_000_000n } }],
          },
          orderBy: [{ invoiceDate: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            totalAmount: true,
            document: { select: { title: true } },
          },
          skip: 0,
          take: 25,
        });
      }),
    );

    // ۳. جمع ستون مبلغی روی همه ردیف‌های فیلترشده
    scenarios.push(
      await capture('جمع مبالغ روی همه ردیف‌های فیلترشده', async () => {
        await prisma.invoice.aggregate({
          where: { document: { status: { not: 'DRAFT' } } },
          _sum: { totalAmount: true, taxAmount: true },
        });
      }),
    );

    // ۴. داشبورد — تجمیع و گروه‌بندی
    scenarios.push(
      await capture('داشبورد — گروه‌بندی اسناد بر اساس وضعیت', async () => {
        await prisma.financialDocument.groupBy({
          by: ['status'],
          where: { status: { not: 'DRAFT' } },
          _count: { _all: true },
          _sum: { totalAmount: true },
        });
      }),
    );

    scenarios.push(
      await capture('داشبورد — ده فروشنده با بیشترین مبلغ', async () => {
        await prisma.invoice.groupBy({
          by: ['vendorId'],
          where: { document: { status: { not: 'DRAFT' } }, vendorId: { not: null } },
          _sum: { totalAmount: true },
          _count: { _all: true },
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: 10,
        });
      }),
    );

    // ۵. جزئیات یک سند (آزمون N+1 همین مسیر را می‌سنجد)
    const sample = await prisma.financialDocument.findFirst({
      where: { title: { startsWith: MARKER } },
      select: { id: true },
    });
    scenarios.push(
      await capture('جزئیات یک سند با فاکتورهایش', async () => {
        await prisma.financialDocument.findFirst({
          where: { id: sample.id },
          include: { invoices: { include: { items: true } } },
        });
      }),
    );

    // ۶. ردپای حسابرسی — مرتب‌سازی زمانی سراسری
    scenarios.push(
      await capture('گزارش فعالیت کاربران — مرتب‌سازی زمانی سراسری', async () => {
        await prisma.auditLog.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true, action: true, entityType: true, createdAt: true },
          take: 25,
        });
      }),
    );

    /*
     * ۷. همان تجمیع، این‌بار با فیلتر **باریک**.
     *
     * پیمایش کامل برای تجمیعِ دو‌سومِ جدول انتخاب درست planner است؛ چیزی که باید
     * اثبات شود این است که ایندکس‌ها **قابل استفاده‌اند** و فیلتر باریک به پیمایش
     * کامل نمی‌افتد — وگرنه «ایندکس داریم» یک ادعای بی‌شاهد می‌ماند.
     */
    scenarios.push(
      await capture('تجمیع با فیلتر باریک — یک سال مالی و یک وضعیت', async () => {
        // ترکیب سال و وضعیت از یک ردیف **واقعی** گرفته می‌شود؛ فیلتری که به صفر ردیف
        // بخورد، پلنش هم چیز زیادی ثابت نمی‌کند.
        const probe = await prisma.financialDocument.findFirst({
          where: { title: { startsWith: MARKER } },
          select: { fiscalYear: true, status: true },
        });
        captured.length = 0;
        await prisma.financialDocument.aggregate({
          where: { fiscalYear: probe.fiscalYear, status: probe.status },
          _sum: { totalAmount: true },
        });
      }),
    );

    scenarios.push(
      await capture('فهرست فاکتورهای یک سند — مسیر پرتکرار جزئیات سند', async () => {
        await prisma.invoice.findMany({
          where: { documentId: sample.id },
          orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
          select: { id: true, invoiceNumber: true, totalAmount: true },
        });
      }),
    );

    const lines = [];
    lines.push('');
    lines.push('# ۱۷ — پلن اجرای کوئری‌های گزارش‌گیری');
    lines.push('');
    lines.push(
      'این سند **خروجی خودکار** `npm run explain:phase8` است و دستی نوشته نشده. اسکریپت',
      'داده حجیم موقت می‌سازد، SQL واقعیِ تولیدشده توسط Prisma را از رویداد `query`',
      'می‌گیرد، روی هر کدام `EXPLAIN (ANALYZE)` اجرا می‌کند و در پایان داده موقت را پاک',
      'می‌کند.',
    );
    lines.push('');
    lines.push(`تاریخ ثبت: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## اندازه جدول‌ها در لحظه ثبت');
    lines.push('');
    lines.push('| جدول | تعداد ردیف تخمینی |');
    lines.push('|---|---|');
    for (const size of sizes) {
      lines.push(`| \`${size.table}\` | ${size.rows.toLocaleString('en-US')} |`);
    }
    lines.push('');

    let seqScanWarnings = 0;

    for (const scenario of scenarios) {
      lines.push(`## ${scenario.title}`);
      lines.push('');

      for (const [index, statement] of scenario.statements.entries()) {
        const plan = await explain(statement.sql, statement.params);
        const verdict = judge(plan, sizes);
        if (verdict.warn) seqScanWarnings += 1;

        lines.push(`### کوئری ${index + 1}`);
        lines.push('');
        lines.push('```sql');
        lines.push(statement.sql);
        lines.push('```');
        lines.push('');
        lines.push('```');
        lines.push(plan);
        lines.push('```');
        lines.push('');
        lines.push(`> ${verdict.text}`);
        lines.push('');
      }
    }

    lines.push('## جمع‌بندی');
    lines.push('');
    lines.push(
      seqScanWarnings === 0
        ? 'هیچ کوئری‌ای برای خواندن بخش کوچکی از یک جدول بزرگ، پیمایش کامل نمی‌کند. ' +
            'کوئری‌های تجمیعی که بخش بزرگی از جدول را می‌خوانند عمداً — و درست — ترتیبی ' +
            'خوانده می‌شوند؛ مرز تفکیک در این سند ۲۵٪ جدول است.'
        : `**${seqScanWarnings}** کوئری با فیلتر باریک پیمایش کامل می‌کند؛ بالا با ⚠️ علامت خورده‌اند.`,
    );
    lines.push('');

    writeFileSync('docs/17-query-plans.md', lines.join('\n'), 'utf8');
    console.log(
      `\n✓ پلن‌ها در docs/17-query-plans.md نوشته شد. هشدار Seq Scan: ${seqScanWarnings}`,
    );

    if (seqScanWarnings > 0) process.exitCode = 1;
  } finally {
    await cleanupVolume();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error('اجرای ثبت پلن شکست:', error);
  process.exitCode = 1;
  await prisma.$disconnect().catch(() => undefined);
});
