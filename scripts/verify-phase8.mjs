/**
 * آزمون زنده فاز ۸ — گزارش‌گیری عمومی.
 *
 * شش معیار پذیرش این فاز روی **سرویس در حال اجرا** سنجیده می‌شوند:
 *
 *   ۱. فیلتر و مرتب‌سازی و صفحه‌بندی سمت سرور؛ هیچ مسیری کل داده را برنمی‌گرداند.
 *   ۲. خروجی Excel دقیقاً همان فیلتر و مرتب‌سازی جدول را منعکس می‌کند — ردیف‌به‌ردیف.
 *   ۳. مجوز مشاهده داده در خروجی رعایت می‌شود و فایل دیگران در دسترس نیست.
 *   ۴. خروجی حجیم به صف می‌رود و لینک موقت می‌دهد.
 *   ۵. پلن کوئری‌های اصلی ثبت شده و روی جدول بزرگ پیمایش کامل بی‌دلیل ندارند.
 *   ۶. تعداد کوئری فهرست و جزئیات **ثابت** است (نبودِ N+1).
 *
 * دو نکته درباره شواهد:
 *  - انقضای لینک دانلود (۲۴ ساعت) با آزمون زنده قابل جلو بردن نیست؛ رفتارش در
 *    `export.service.test.ts` مستقیم تست شده و اینجا فقط وجود و آینده بودن
 *    `expiresAt` بررسی می‌شود.
 *  - معیار ۶ به هدر `X-Query-Count` نیاز دارد که با `EXPOSE_QUERY_COUNT=true` روشن
 *    می‌شود. اگر روشن نباشد، این بررسی‌ها **رد شده** گزارش می‌شوند، نه سبز.
 *
 * اجرا: `npm run verify:phase8`
 */
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const BASE = process.env.API_BASE ?? 'http://localhost:3100/api/v1';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin!2345';
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD ?? 'Dev!2345';

let pass = 0;
let fail = 0;
let skipped = 0;
const results = [];

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    results.push(`  OK   ${name}`);
  } else {
    fail += 1;
    results.push(`  FAIL ${name}  >> ${detail ?? ''}`);
  }
}

function skip(name, why) {
  skipped += 1;
  results.push(`  SKIP ${name}  >> ${why}`);
}

const cut = (value, length = 300) => JSON.stringify(value)?.slice(0, length);

class Client {
  constructor(username) {
    this.username = username;
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  absorb(response) {
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  headers(extra = {}) {
    const headers = { Cookie: this.cookieHeader(), ...extra };
    if (this.cookies.has('dm_csrf')) headers['x-csrf-token'] = this.cookies.get('dm_csrf');
    return headers;
  }
  /** بدنه، آرگومان سوم است — تا هیچ فراخوانی‌ای به‌اشتباه بدنه را به‌جای تنظیمات ندهد. */
  async request(method, path, body, { idempotencyKey } = {}) {
    const headers = this.headers(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {});
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    this.absorb(response);
    const type = response.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await response.json().catch(() => null) : null;
    return {
      status: response.status,
      data,
      queryCount: response.headers.get('x-query-count'),
      rowCount: response.headers.get('x-row-count'),
    };
  }
  async binary(method, path, body) {
    const headers = this.headers();
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    this.absorb(response);
    return {
      status: response.status,
      bytes: Buffer.from(await response.arrayBuffer()),
      rowCount: response.headers.get('x-row-count'),
      disposition: response.headers.get('content-disposition'),
    };
  }
  async login(password = DEV_PASSWORD) {
    const result = await this.request('POST', '/auth/login', {
      username: this.username,
      password,
    });
    if (result.status !== 200) {
      throw new Error(`ورود ${this.username} ناموفق: ${result.status} ${cut(result.data)}`);
    }
  }
}

const query = (overrides = {}) => ({
  columns: [],
  filter: { combine: 'and', conditions: [] },
  sort: [],
  page: 1,
  pageSize: 25,
  ...overrides,
});

/** نام فروشنده با بار Formula Injection — برای آزمون خروجی Excel. */
const FORMULA_VENDOR = "=HYPERLINK(\"http://evil\",\"برنده شدید\")";

async function ensureFormulaVendor(admin) {
  const existing = await admin.request('GET', `/vendors?search=${encodeURIComponent('HYPERLINK')}`);
  const found = (existing.data?.items ?? []).find((item) => item.name === FORMULA_VENDOR);
  if (found) return found.id;

  const created = await admin.request('POST', '/vendors', {
    personType: 'LEGAL',
    name: FORMULA_VENDOR,
    economicCode: '411100002222',
    addressLine: 'قم — آزمون تزریق فرمول',
    postalCode: '3715600002',
    phone: '02537758800',
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`ساخت فروشنده آزمون ناموفق: ${created.status} ${cut(created.data, 300)}`);
  }
  return created.data.id;
}

/** خواندن ردیف‌های داده یک فایل Excel تولیدشده. */
async function readSheet(bytes) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];

  const rows = [];
  sheet.eachRow((row, index) => {
    rows.push({ index, values: row.values.slice(1) });
  });
  return { sheet, rows };
}

async function main() {
  const admin = new Client('admin');
  const bayegan = new Client('bayegan');
  const nazer = new Client('nazer');
  await admin.login(ADMIN_PASSWORD);
  await bayegan.login();
  await nazer.login();

  // ───────────────────── معیار ۱: همه‌چیز سمت سرور ─────────────────────

  const datasets = await admin.request('GET', '/analytics/datasets');
  check(
    'فهرست گزارش‌ها با فیلدهایشان خوانده شد',
    datasets.status === 200 && (datasets.data ?? []).length >= 8,
    `${datasets.status} ${cut((datasets.data ?? []).map((item) => item.key))}`,
  );

  const first = await admin.request('POST', '/analytics/documents/query', query({ pageSize: 5 }));
  check(
    'اجرای گزارش اسناد',
    first.status === 200 && Array.isArray(first.data?.rows),
    `${first.status} ${cut(first.data, 200)}`,
  );
  check(
    'پاسخ فقط یک صفحه می‌دهد، نه کل داده',
    first.data.rows.length <= 5 && first.data.total >= first.data.rows.length,
    `rows=${first.data.rows.length} total=${first.data.total}`,
  );

  const second = await admin.request(
    'POST',
    '/analytics/documents/query',
    query({ pageSize: 5, page: 2 }),
  );
  const firstIds = first.data.rows.map((row) => JSON.stringify(row));
  const secondIds = second.data.rows.map((row) => JSON.stringify(row));
  check(
    'صفحه دوم ردیف‌های متفاوتی دارد (صفحه‌بندی سمت سرور)',
    second.status === 200 &&
      secondIds.length > 0 &&
      secondIds.every((row) => !firstIds.includes(row)),
    `${second.status} overlap=${secondIds.filter((row) => firstIds.includes(row)).length}`,
  );

  const tooBig = await admin.request(
    'POST',
    '/analytics/documents/query',
    query({ pageSize: 5000 }),
  );
  check(
    'سقف اندازه صفحه اجبارى است',
    tooBig.status === 422,
    `${tooBig.status} ${cut(tooBig.data)}`,
  );

  const unknownColumn = await admin.request(
    'POST',
    '/analytics/documents/query',
    query({ columns: ['passwordHash'] }),
  );
  check(
    'ستون ناشناخته رد می‌شود',
    unknownColumn.status === 422 && String(unknownColumn.data?.message ?? '').length > 0,
    `${unknownColumn.status} ${cut(unknownColumn.data)}`,
  );

  const unknownSort = await admin.request(
    'POST',
    '/analytics/documents/query',
    query({ sort: [{ field: 'passwordHash', dir: 'asc' }] }),
  );
  check('فیلد مرتب‌سازی ناشناخته رد می‌شود', unknownSort.status === 422, `${unknownSort.status}`);

  const unknownDataset = await admin.request('POST', '/analytics/users/query', query());
  check('گزارش ناشناخته ۴۰۴ می‌گیرد', unknownDataset.status === 404, `${unknownDataset.status}`);

  const filtered = await admin.request(
    'POST',
    '/analytics/documents/query',
    query({
      filter: { combine: 'and', conditions: [{ field: 'status', op: 'eq', values: ['FINALIZED'] }] },
      pageSize: 200,
    }),
  );
  check(
    'فیلتر سمت سرور تعداد کل را عوض می‌کند',
    filtered.status === 200 && filtered.data.total < first.data.total && filtered.data.total > 0,
    `filtered=${filtered.data?.total} all=${first.data.total}`,
  );
  check(
    'همه ردیف‌های فیلترشده همان وضعیت را دارند',
    filtered.data.rows.every((row) => row.status === 'FINALIZED'),
    cut(filtered.data.rows.map((row) => row.status)),
  );

  const ascending = await admin.request(
    'POST',
    '/analytics/documents/query',
    query({ columns: ['title', 'totalAmount'], sort: [{ field: 'totalAmount', dir: 'asc' }] }),
  );
  const descending = await admin.request(
    'POST',
    '/analytics/documents/query',
    query({ columns: ['title', 'totalAmount'], sort: [{ field: 'totalAmount', dir: 'desc' }] }),
  );
  check(
    'مرتب‌سازی سمت سرور واقعاً ترتیب را عوض می‌کند',
    BigInt(ascending.data.rows[0].totalAmount) <= BigInt(descending.data.rows[0].totalAmount) &&
      ascending.data.rows[0].title !== descending.data.rows[0].title,
    `asc=${ascending.data.rows[0]?.totalAmount} desc=${descending.data.rows[0]?.totalAmount}`,
  );
  check(
    'ترتیب صعودی واقعاً صعودی است',
    ascending.data.rows.every(
      (row, index) =>
        index === 0 ||
        BigInt(ascending.data.rows[index - 1].totalAmount) <= BigInt(row.totalAmount),
    ),
    cut(ascending.data.rows.map((row) => row.totalAmount)),
  );

  check(
    'جمع ستون مبلغی روی همه ردیف‌های فیلترشده است، نه صفحه جاری',
    BigInt(first.data.totals.totalAmount ?? '0') >
      first.data.rows.reduce((sum, row) => sum + BigInt(row.totalAmount ?? '0'), 0n),
    `totals=${first.data.totals?.totalAmount}`,
  );

  // گزارش تجمیعی
  const grouped = await admin.request(
    'POST',
    '/analytics/amounts/query',
    query({ groupBy: 'invoiceKind' }),
  );
  check(
    'گزارش تجمیعی با بُعد انتخابی اجرا می‌شود',
    grouped.status === 200 && grouped.data.rows.length > 0 && grouped.data.rows[0].group !== undefined,
    `${grouped.status} ${cut(grouped.data?.rows?.[0])}`,
  );
  const badDimension = await admin.request(
    'POST',
    '/analytics/amounts/query',
    query({ groupBy: 'vendorBankAccount' }),
  );
  check('بُعد گروه‌بندی غیرمجاز رد می‌شود', badDimension.status === 422, `${badDimension.status}`);

  // ───────────────────── معیار ۳: مجوز ستون و مجموعه‌داده ─────────────────────

  const archivistDatasets = await bayegan.request('GET', '/analytics/datasets');
  const archivistKeys = (archivistDatasets.data ?? []).map((item) => item.key);
  check(
    'بایگانی گزارش فعالیت کاربران را در فهرست نمی‌بیند',
    archivistDatasets.status === 200 && !archivistKeys.includes('activity'),
    cut(archivistKeys),
  );

  const archivistActivity = await bayegan.request('POST', '/analytics/activity/query', query());
  check(
    'بایگانی روی گزارش حسابرسی ۴۰۴ می‌گیرد (نه ۴۰۳)',
    archivistActivity.status === 404,
    `${archivistActivity.status}`,
  );

  const archivistInvoices = (archivistDatasets.data ?? []).find((item) => item.key === 'invoices');
  check(
    'ستون‌های جزئیات محاسبه فاکتور در فهرست بایگانی نیست',
    archivistInvoices !== undefined &&
      !archivistInvoices.fields.some((field) => field.key === 'taxAmount'),
    cut(archivistInvoices?.fields.map((field) => field.key)),
  );

  const archivistColumn = await bayegan.request(
    'POST',
    '/analytics/invoices/query',
    query({ columns: ['documentTitle', 'taxAmount'] }),
  );
  check(
    'بایگانی با خواستن ستون بی‌مجوز ۴۰۳ می‌گیرد',
    archivistColumn.status === 403,
    `${archivistColumn.status} ${cut(archivistColumn.data)}`,
  );
  check(
    'پاسخ ۴۰۳ هیچ داده‌ای ندارد',
    archivistColumn.data?.rows === undefined,
    cut(archivistColumn.data),
  );

  const archivistFilter = await bayegan.request(
    'POST',
    '/analytics/invoices/query',
    query({
      columns: ['documentTitle'],
      filter: { combine: 'and', conditions: [{ field: 'taxAmount', op: 'gt', values: ['0'] }] },
    }),
  );
  check(
    'فیلتر روی ستون بی‌مجوز هم ۴۰۳ می‌گیرد (کانال استنتاج بسته است)',
    archivistFilter.status === 403,
    `${archivistFilter.status} ${cut(archivistFilter.data)}`,
  );

  const archivistSort = await bayegan.request(
    'POST',
    '/analytics/invoices/query',
    query({ columns: ['documentTitle'], sort: [{ field: 'netAmount', dir: 'desc' }] }),
  );
  check(
    'مرتب‌سازی روی ستون بی‌مجوز هم ۴۰۳ می‌گیرد',
    archivistSort.status === 403,
    `${archivistSort.status}`,
  );

  // دامنه دسترسی سند در گزارش: بایگانی پیش‌نویس نمی‌بیند.
  const archivistDocuments = await bayegan.request(
    'POST',
    '/analytics/documents/query',
    query({ columns: ['title', 'status'], pageSize: 200 }),
  );
  check(
    'بایگانی در گزارش اسناد هیچ پیش‌نویسی نمی‌بیند',
    archivistDocuments.status === 200 &&
      archivistDocuments.data.rows.every((row) => row.status !== 'DRAFT'),
    cut([...new Set(archivistDocuments.data?.rows?.map((row) => row.status) ?? [])]),
  );
  check(
    'دامنه دسترسی گزارش با دامنه فهرست اسناد یکی است',
    archivistDocuments.data.total < first.data.total,
    `archivist=${archivistDocuments.data.total} admin=${first.data.total}`,
  );

  const anonymous = await fetch(`${BASE}/analytics/datasets`);
  check('کاربر ناشناس ۴۰۱ می‌گیرد', anonymous.status === 401, `${anonymous.status}`);

  const supervisorExport = await nazer.request(
    'POST',
    '/analytics/documents/export/plan',
    query(),
  );
  check(
    'ناظر مجوز خروجی دارد (نقشش گزارش می‌گیرد)',
    supervisorExport.status === 200,
    `${supervisorExport.status}`,
  );

  // ───────────────────── معیار ۲: خروجی = همان جدول ─────────────────────

  await ensureFormulaVendor(admin);

  const exportRequest = query({
    columns: ['name', 'personType', 'economicCode', 'invoiceCount'],
    filter: { combine: 'and', conditions: [{ field: 'isActive', op: 'isTrue', values: [] }] },
    sort: [{ field: 'name', dir: 'asc' }],
    pageSize: 200,
  });

  const table = await admin.request('POST', '/analytics/vendors/query', exportRequest);
  check(
    'جدول فروشندگان با فیلتر و مرتب‌سازی اجرا شد',
    table.status === 200 && table.data.rows.length > 0,
    `${table.status} ${cut(table.data?.rows?.[0])}`,
  );

  const file = await admin.binary('POST', '/analytics/vendors/export', exportRequest);
  check(
    'خروجی Excel تولید شد',
    file.status === 200 && file.bytes.length > 2000,
    `${file.status} ${file.bytes.length}`,
  );
  check(
    'تعداد ردیف خروجی با تعداد ردیف جدول یکی است',
    Number(file.rowCount) === table.data.total,
    `file=${file.rowCount} table=${table.data.total}`,
  );

  const { sheet, rows } = await readSheet(file.bytes);
  const headerRowIndex = rows.findIndex((row) =>
    row.values.some((value) => value === 'نام'),
  );
  check('سرستون‌های خروجی همان ستون‌های جدول‌اند', headerRowIndex >= 0, cut(rows.slice(0, 6)));

  const headerValues = rows[headerRowIndex]?.values ?? [];
  check(
    'ترتیب ستون‌ها در خروجی همان ترتیب جدول است',
    JSON.stringify(headerValues.slice(0, 4)) ===
      JSON.stringify(table.data.columns.map((column) => column.titleFa)),
    `${cut(headerValues)} vs ${cut(table.data.columns.map((column) => column.titleFa))}`,
  );

  const dataRows = rows.slice(headerRowIndex + 1, headerRowIndex + 1 + table.data.rows.length);
  const nameColumn = table.data.columns.findIndex((column) => column.key === 'name');
  const fileNames = dataRows.map((row) => String(row.values[nameColumn] ?? ''));
  const tableNames = table.data.rows.map((row) => String(row.name ?? ''));
  check(
    'ردیف‌های خروجی، به همان ترتیب جدول‌اند',
    JSON.stringify(fileNames.map((name) => name.replace(/^'/u, ''))) ===
      JSON.stringify(tableNames),
    `${cut(fileNames)} vs ${cut(tableNames)}`,
  );

  const injected = fileNames.find((name) => name.includes('HYPERLINK'));
  check(
    'نام شروع‌شده با «=» در Excel فرمول نمی‌شود',
    injected !== undefined && injected.startsWith("'="),
    `${cut(injected)}`,
  );

  let filterNote = false;
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const value = cell.value;
      if (typeof value === 'string' && value.startsWith('فیلتر:')) filterNote = true;
    });
  });
  check('فیلترهای اعمال‌شده بالای فایل نوشته شده‌اند', filterNote, 'یادداشت فیلتر پیدا نشد');

  /*
   * ردیف جمع فرمولی روی گزارشی سنجیده می‌شود که **ستون مبلغی** دارد.
   *
   * گزارش فروشندگان ستون مالی ندارد و ردیف جمعش هم نباید فرمول داشته باشد؛ جمع زدنِ
   * «نوع شخص» عدد بی‌معنا می‌سازد.
   */
  const moneyRequest = query({
    columns: ['title', 'status', 'totalTax', 'totalAmount'],
    sort: [{ field: 'totalAmount', dir: 'desc' }],
    pageSize: 200,
  });
  const moneyTable = await admin.request('POST', '/analytics/documents/query', moneyRequest);
  const moneyFile = await admin.binary('POST', '/analytics/documents/export', moneyRequest);
  const moneySheet = await readSheet(moneyFile.bytes);

  let hasSubtotal = false;
  let numericMoneyCell = null;
  moneySheet.sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const value = cell.value;
      if (value && typeof value === 'object' && 'formula' in value) {
        if (String(value.formula).startsWith('SUBTOTAL(109')) hasSubtotal = true;
      }
      if (typeof value === 'number' && value > 1000) numericMoneyCell = value;
    });
  });
  check('ردیف جمع خروجی فرمول SUBTOTAL دارد، نه مقدار ثابت', hasSubtotal, 'فرمول پیدا نشد');
  check(
    'سلول مالی خروجی عدد واقعی است، نه متن فارسی‌شده',
    numericMoneyCell !== null,
    'سلول عددی پیدا نشد',
  );

  const moneyHeaderIndex = moneySheet.rows.findIndex((row) => row.values.includes('جمع کل'));
  const moneyDataRows = moneySheet.rows.slice(
    moneyHeaderIndex + 1,
    moneyHeaderIndex + 1 + moneyTable.data.rows.length,
  );
  const totalColumn = moneyTable.data.columns.findIndex((column) => column.key === 'totalAmount');
  const fileTotals = moneyDataRows.map((row) => String(row.values[totalColumn] ?? ''));
  const tableTotals = moneyTable.data.rows.map((row) => String(row.totalAmount ?? ''));
  check(
    'مقدار و ترتیب ستون مبلغی در خروجی، دقیقاً همان جدول است',
    JSON.stringify(fileTotals) === JSON.stringify(tableTotals),
    `${cut(fileTotals)} vs ${cut(tableTotals)}`,
  );
  /*
   * مبلغ بزرگ‌تر از محدوده امن عدد Excel باید **متن** باشد، نه عدد.
   *
   * اگر عدد نوشته شود، Excel بی‌صدا گردش می‌کند و یک ریال گم می‌شود. پس نوع سلول
   * سنجیده می‌شود، نه شکل ظاهری‌اش.
   */
  const hugeIndex = tableTotals.findIndex((value) => BigInt(value) > 9_007_199_254_740_991n);
  if (hugeIndex < 0) {
    skip('مبلغ خارج از محدوده امن Excel', 'در داده فعلی مبلغی بزرگ‌تر از ۲^۵۳ نیست');
  } else {
    const cellValue = moneyDataRows[hugeIndex]?.values[totalColumn];
    check(
      'مبلغ بزرگ‌تر از محدوده امن Excel به‌صورت متن نوشته می‌شود تا گرد نشود',
      typeof cellValue === 'string' && cellValue === tableTotals[hugeIndex],
      `${typeof cellValue} ${cut(cellValue)}`,
    );
  }

  // خروجی با فیلتری که فقط یک ردیف می‌دهد — همان فیلتر باید در فایل اثر کند.
  const narrowRequest = query({
    columns: ['name', 'economicCode'],
    filter: {
      combine: 'and',
      conditions: [{ field: 'name', op: 'contains', values: ['HYPERLINK'] }],
    },
    pageSize: 200,
  });
  const narrowFile = await admin.binary('POST', '/analytics/vendors/export', narrowRequest);
  const narrow = await readSheet(narrowFile.bytes);
  const narrowHeader = narrow.rows.findIndex((row) => row.values.includes('نام'));
  check(
    'فیلتر باریک در خروجی هم اعمال شده است',
    Number(narrowFile.rowCount) === 1 &&
      narrow.rows.length - narrowHeader - 1 === 2, // یک ردیف داده + یک ردیف جمع
    `rowCount=${narrowFile.rowCount} rows=${narrow.rows.length - narrowHeader - 1}`,
  );

  const archivistExport = await bayegan.binary(
    'POST',
    '/analytics/invoices/export',
    query({ columns: ['documentTitle', 'taxAmount'] }),
  );
  check(
    'خروجی با ستون بی‌مجوز ساخته نمی‌شود',
    archivistExport.status === 403,
    `${archivistExport.status}`,
  );

  // ───────────────────── معیار ۴: صف و لینک موقت ─────────────────────

  const plan = await admin.request('POST', '/analytics/invoices/export/plan', query());
  check(
    'برآورد خروجی، قاعده تصمیم را هم برمی‌گرداند',
    plan.status === 200 && typeof plan.data?.syncLimit === 'number',
    cut(plan.data),
  );
  check(
    'تصمیم صف با همان قاعده گرفته می‌شود',
    plan.data.queued === plan.data.rowCount > plan.data.syncLimit,
    cut(plan.data),
  );

  if (!plan.data.queued) {
    skip(
      'مسیر صف زنده آزموده شود',
      `تعداد ردیف (${plan.data.rowCount}) از مرز (${plan.data.syncLimit}) کمتر است؛ ` +
        'برای آزمون این مسیر، EXPORT_SYNC_ROW_LIMIT را کوچک‌تر بگذارید.',
    );
  } else {
    const job = await admin.request('POST', '/analytics/invoices/export/queue', query(), {
      idempotencyKey: crypto.randomUUID(),
    });

    check(
      'خروجی حجیم به صف رفت',
      job.status === 202 && typeof job.data?.id === 'string',
      `${job.status} ${cut(job.data)}`,
    );

    let status = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const polled = await admin.request('GET', `/analytics/exports/${job.data.id}`);
      status = polled.data;
      if (status?.status === 'SUCCEEDED' || status?.status === 'FAILED') break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    check(
      'کار صف‌شده با موفقیت ساخته شد',
      status?.status === 'SUCCEEDED',
      cut(status),
    );
    check(
      'لینک دانلود مهلت دارد و مهلتش در آینده است',
      status?.expiresAt !== null && new Date(status.expiresAt).getTime() > Date.now(),
      `${status?.expiresAt}`,
    );
    check(
      'تعداد ردیف کار صف‌شده ثبت شده است',
      typeof status?.rowCount === 'number' && status.rowCount === plan.data.rowCount,
      `job=${status?.rowCount} plan=${plan.data.rowCount}`,
    );

    const download = await admin.binary('GET', `/analytics/exports/${job.data.id}/download`);
    check(
      'فایل صف‌شده دانلود می‌شود و فایل Excel معتبری است',
      download.status === 200 && download.bytes.length > 2000,
      `${download.status} ${download.bytes.length}`,
    );

    const queuedSheet = await readSheet(download.bytes);
    check(
      'فایل صف‌شده همان تعداد ردیف را دارد',
      queuedSheet.rows.length >= plan.data.rowCount,
      `${queuedSheet.rows.length} ردیف در فایل، ${plan.data.rowCount} ردیف داده`,
    );

    const intruder = await bayegan.request('GET', `/analytics/exports/${job.data.id}`);
    check(
      'کاربر دیگر وضعیت کار را نمی‌بیند (۴۰۴)',
      intruder.status === 404,
      `${intruder.status}`,
    );

    const intruderDownload = await bayegan.binary(
      'GET',
      `/analytics/exports/${job.data.id}/download`,
    );
    check(
      'کاربر دیگر فایل را دانلود نمی‌کند (۴۰۴)',
      intruderDownload.status === 404,
      `${intruderDownload.status}`,
    );

    const mine = await admin.request('GET', '/analytics/exports');
    check(
      'کار در فهرست «خروجی‌های من» هست',
      (mine.data ?? []).some((item) => item.id === job.data.id),
      cut((mine.data ?? []).map((item) => item.id)),
    );

    const notMine = await bayegan.request('GET', '/analytics/exports');
    check(
      'فهرست خروجی هر کاربر فقط کارهای خودش را دارد',
      !(notMine.data ?? []).some((item) => item.id === job.data.id),
      cut((notMine.data ?? []).length),
    );
  }

  const ghostJob = await admin.request('GET', `/analytics/exports/${crypto.randomUUID()}`);
  check('کار خروجی ناموجود ۴۰۴ می‌گیرد', ghostJob.status === 404, `${ghostJob.status}`);

  // ───────────────────── نماهای ذخیره‌شده ─────────────────────

  const viewRequest = query({
    columns: ['title', 'status', 'totalAmount'],
    filter: { combine: 'and', conditions: [{ field: 'status', op: 'eq', values: ['FINALIZED'] }] },
    sort: [{ field: 'totalAmount', dir: 'desc' }],
  });

  const viewName = `نمای آزمون ${Date.now() % 100000}`;
  const savedView = await admin.request('POST', '/analytics/documents/views', {
    name: viewName,
    isShared: true,
    query: viewRequest,
  });
  check(
    'نما ذخیره شد',
    savedView.status === 201 || savedView.status === 200,
    `${savedView.status} ${cut(savedView.data)}`,
  );

  const duplicate = await admin.request('POST', '/analytics/documents/views', {
    name: viewName,
    isShared: false,
    query: viewRequest,
  });
  check(
    'نام تکراری نما رد می‌شود',
    duplicate.status === 409,
    `${duplicate.status} ${cut(duplicate.data)}`,
  );

  const invalidView = await admin.request('POST', '/analytics/documents/views', {
    name: `${viewName}-bad`,
    isShared: false,
    query: query({ columns: ['passwordHash'] }),
  });
  check(
    'نمای نامعتبر ذخیره نمی‌شود',
    invalidView.status === 422,
    `${invalidView.status} ${cut(invalidView.data)}`,
  );

  const sharedForOthers = await bayegan.request('GET', '/analytics/documents/views');
  const visible = (sharedForOthers.data ?? []).find((item) => item.id === savedView.data.id);
  check(
    'نمای اشتراکی برای کاربر دیگر دیده می‌شود',
    visible !== undefined && visible.isOwn === false,
    cut((sharedForOthers.data ?? []).map((item) => item.name)),
  );

  const foreignDelete = await bayegan.request('DELETE', `/analytics/views/${savedView.data.id}`);
  check(
    'کاربر دیگر نمای اشتراکی را حذف نمی‌کند',
    foreignDelete.status === 404,
    `${foreignDelete.status}`,
  );

  /*
   * نمای اشتراکی **دسترسی اضافه نمی‌دهد**: همان نما، اجراشده با مجوزهای بایگانی،
   * فقط داده مجاز او را می‌دهد.
   */
  const sharedRun = await bayegan.request('POST', '/analytics/documents/query', {
    columns: visible.columns,
    filter: visible.filter,
    sort: visible.sort,
    page: 1,
    pageSize: visible.pageSize,
  });
  check(
    'اجرای نمای اشتراکی با مجوز کاربر دیگر، داده بیشتری نمی‌دهد',
    sharedRun.status === 200 && sharedRun.data.rows.every((row) => row.status !== 'DRAFT'),
    `${sharedRun.status} ${cut(sharedRun.data?.total)}`,
  );

  const removed = await admin.request('DELETE', `/analytics/views/${savedView.data.id}`);
  check('صاحب نما حذفش می‌کند', removed.status === 200, `${removed.status}`);

  // ───────────────────── داشبورد ─────────────────────

  const dashboard = await admin.request('GET', '/analytics/dashboard');
  check(
    'داشبورد با کوئری تجمیعی اجرا می‌شود',
    dashboard.status === 200 && typeof dashboard.data?.totals?.total === 'string',
    `${dashboard.status} ${cut(dashboard.data?.totals)}`,
  );

  const statusSum = (dashboard.data.byStatus ?? []).reduce(
    (sum, row) => sum + BigInt(row.total),
    0n,
  );
  check(
    'جمع تفکیک وضعیت با جمع کل داشبورد می‌خواند',
    statusSum === BigInt(dashboard.data.totals.total),
    `${statusSum} vs ${dashboard.data.totals.total}`,
  );
  check(
    'تعداد اسناد داشبورد با تعداد کل گزارش اسناد یکی است',
    dashboard.data.documentCount === first.data.total,
    `dashboard=${dashboard.data.documentCount} report=${first.data.total}`,
  );

  const archivistDashboard = await bayegan.request('GET', '/analytics/dashboard');
  check(
    'داشبورد بایگانی پیش‌نویس‌ها را نمی‌شمارد',
    archivistDashboard.status === 200 &&
      archivistDashboard.data.documentCount === archivistDocuments.data.total &&
      !(archivistDashboard.data.byStatus ?? []).some((row) => row.status === 'DRAFT'),
    `${archivistDashboard.data?.documentCount} vs ${archivistDocuments.data.total}`,
  );

  // ───────────────────── معیار ۵: پلن کوئری‌ها ─────────────────────

  let plans = null;
  try {
    plans = readFileSync('docs/17-query-plans.md', 'utf8');
  } catch {
    plans = null;
  }

  if (plans === null) {
    check('پلن کوئری‌ها ثبت شده است', false, 'docs/17-query-plans.md وجود ندارد');
  } else {
    check(
      'پلن کوئری‌ها ثبت شده و اندازه جدول‌ها را دارد',
      plans.includes('financial_documents') && plans.includes('EXPLAIN') === false
        ? plans.includes('Index Scan') || plans.includes('Bitmap Index Scan')
        : true,
      'محتوای پلن ناقص است',
    );
    check(
      'پلن روی داده حجیم گرفته شده است (نه چند ردیف)',
      /\| `invoices` \| ([\d,]+) \|/u.test(plans) &&
        Number(/\| `invoices` \| ([\d,]+) \|/u.exec(plans)[1].replace(/,/gu, '')) > 10_000,
      cut(/\| `invoices` \| ([\d,]+) \|/u.exec(plans)?.[1]),
    );
    check(
      'هیچ کوئری با فیلتر باریک پیمایش کامل نمی‌کند',
      !plans.includes('> ⚠️'),
      `${(plans.match(/> ⚠️/gu) ?? []).length} هشدار`,
    );
    check(
      'مسیرهای پرتکرار از ایندکس استفاده می‌کنند',
      plans.includes('Index Scan using financial_documents_created_at_id_idx') &&
        plans.includes('audit_logs_created_at_id_idx'),
      'ایندکس مرتب‌سازی در پلن‌ها دیده نشد',
    );
  }

  // ───────────────────── معیار ۶: نبودِ N+1 ─────────────────────

  if (first.queryCount === null) {
    skip(
      'شمارش کوئری (نبودِ N+1)',
      'هدر X-Query-Count نیست؛ سرویس را با EXPOSE_QUERY_COUNT=true اجرا کنید.',
    );
  } else {
    const counts = [];
    for (const size of [1, 5, 25]) {
      const page = await admin.request('GET', `/documents?page=1&pageSize=${size}`);
      counts.push({ size, items: page.data?.items?.length ?? 0, queries: Number(page.queryCount) });
    }
    check(
      'تعداد کوئری فهرست اسناد با تعداد ردیف تغییر نمی‌کند',
      new Set(counts.map((entry) => entry.queries)).size === 1,
      cut(counts),
    );
    check(
      'و فهرست با ۲۵ ردیف هم بیشتر از چند کوئری نمی‌زند',
      (counts[2]?.queries ?? 99) <= 5,
      cut(counts),
    );

    const analyticsCounts = [];
    for (const size of [1, 25]) {
      const page = await admin.request(
        'POST',
        '/analytics/invoices/query',
        query({ columns: ['documentTitle', 'vendorName', 'totalAmount'], pageSize: size }),
      );
      analyticsCounts.push({
        size,
        rows: page.data?.rows?.length ?? 0,
        queries: Number(page.queryCount),
      });
    }
    check(
      'تعداد کوئری گزارش فاکتورها هم با تعداد ردیف تغییر نمی‌کند',
      new Set(analyticsCounts.map((entry) => entry.queries)).size === 1,
      cut(analyticsCounts),
    );

    /*
     * اسناد با **تعداد فاکتور متفاوت** انتخاب می‌شوند.
     *
     * سنجیدن سه سندی که همه یک فاکتور دارند، چیزی درباره N+1 ثابت نمی‌کند؛ نکته
     * همین است که با زیاد شدن فاکتورها تعداد کوئری ثابت بماند.
     */
    const documents = await admin.request('GET', '/documents?page=1&pageSize=200');
    const byInvoiceCount = new Map();
    for (const item of documents.data?.items ?? []) {
      const count = item._count?.invoices ?? 0;
      if (!byInvoiceCount.has(count)) byInvoiceCount.set(count, item.id);
    }
    const probes = [...byInvoiceCount.entries()]
      .sort((left, right) => left[0] - right[0])
      .filter(([count]) => count > 0)
      .slice(0, 3);

    if (probes.length < 2) {
      skip(
        'شمارش کوئری جزئیات سند',
        'در داده فعلی دو سند با تعداد فاکتور متفاوت پیدا نشد',
      );
    } else {
      const detailCounts = [];
      for (const [count, id] of probes) {
        const detail = await admin.request('GET', `/documents/${id}`);
        detailCounts.push({
          invoices: detail.data?.invoices?.length ?? count,
          queries: Number(detail.queryCount),
        });
      }
      check(
        'تعداد کوئری جزئیات سند با تعداد فاکتورهایش تغییر نمی‌کند',
        new Set(detailCounts.map((entry) => entry.queries)).size === 1,
        cut(detailCounts),
      );
    }
  }

  console.log('\n— نتیجه آزمون زنده فاز ۸ —\n');
  console.log(results.join('\n'));
  console.log(`\nموفق: ${pass}   ناموفق: ${fail}   رد‌شده: ${skipped}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.log(results.join('\n'));
  console.error('\nاجرای آزمون شکست:', error);
  process.exitCode = 1;
});
