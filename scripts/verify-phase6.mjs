/**
 * آزمون زنده فاز ۶ — گزارش مالیات.
 *
 * این اسکریپت یک سند آزمون **تازه** با اعداد معلوم می‌سازد و سپس هر ستون گزارش را با
 * محاسبه دستی می‌سنجد. ساختن داده به‌جای تکیه بر داده موجود عمدی است: معیار پذیرش ۱
 * فاز ۶ «با داده آزمایشی معلوم، هر ستون عدد به عدد با محاسبه دستی می‌خواند» است، و
 * «معلوم» یعنی اعدادش را همین‌جا بتوان خواند.
 *
 * سناریوی داده:
 *   فروشنده الف — دو فاکتور ⇒ ستون شماره صورتحساب باید **خالی** بماند و تاریخ،
 *                  تاریخ قدیمی‌ترین فاکتور باشد (قواعد §۲۲.۴ و §۲۲.۵).
 *   فروشنده ب  — یک فاکتور با تخفیف ⇒ شماره صورتحساب پر، و خالص = کالا − تخفیف.
 *   یک فاکتور  — بدون فروشنده ⇒ از گزارش بیرون می‌ماند و هشدار شمارش‌شده می‌دهد.
 *
 * پیش‌نیاز: سرویس بالا، داده مرجع ثبت‌شده، و کاربران آزمون ساخته‌شده.
 * اجرا: `npm run verify:phase6`
 */
import ExcelJS from 'exceljs';

const BASE = process.env.API_BASE ?? 'http://localhost:3100/api/v1';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin!2345';
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD ?? 'Dev!2345';

let pass = 0;
let fail = 0;
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
  async request(method, path, { body, idempotent = false, raw = false } = {}) {
    const headers = { Cookie: this.cookieHeader() };
    if (this.cookies.has('dm_csrf')) headers['x-csrf-token'] = this.cookies.get('dm_csrf');
    if (idempotent) headers['idempotency-key'] = crypto.randomUUID();
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    this.absorb(response);
    if (raw) return { status: response.status, response };
    const type = response.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await response.json().catch(() => null) : null;
    return { status: response.status, data, response };
  }
  async login(password = DEV_PASSWORD) {
    const result = await this.request('POST', '/auth/login', {
      body: { username: this.username, password },
    });
    if (result.status !== 200) {
      throw new Error(`ورود ${this.username} ناموفق: ${result.status} ${cut(result.data)}`);
    }
  }
}

/** نمونه داده آزمون — اعداد عمداً «گرد» نیستند تا خطای گرد کردن پنهان نماند. */
const DATA = {
  vendorA: {
    name: 'شرکت توزیع برق آزمون',
    economicCode: '411134858916',
    addressLine: 'قم — نیروگاه — میدان امینی بیات',
    postalCode: '3715698541',
    phone: '02537758881',
  },
  vendorB: {
    name: 'مهندسی آرمان بهسازان رها',
    economicCode: '411199887766',
    addressLine: 'قم — خیابان آذر',
    postalCode: '3716000000',
    phone: '02537758882',
  },
  // فاکتور ۱ فروشنده الف: ۱۲٬۳۴۵٬۶۷۸ با مالیات ۱۰٪
  a1: { gross: 12_345_678n, discount: 0n, rateBp: 1000, date: '2026-10-04', number: 'A-1001' },
  // فاکتور ۲ فروشنده الف: ۷٬۷۷۷٬۷۷۷ با مالیات ۱۰٪ (تاریخ جلوتر)
  a2: { gross: 7_777_777n, discount: 0n, rateBp: 1000, date: '2026-10-12', number: 'A-1002' },
  // فاکتور فروشنده ب: ۵۰٬۰۰۰٬۰۰۰ با تخفیف ۳٬۳۳۳٬۳۳۳ و مالیات ۱۰٪
  b1: { gross: 50_000_000n, discount: 3_333_333n, rateBp: 1000, date: '2026-10-08', number: 'B-77' },
  // فاکتور بدون فروشنده — نباید در گزارش بیاید
  orphan: { gross: 1_000_000n, discount: 0n, rateBp: 0, date: '2026-10-09', number: 'X-1' },
};

/** همان گرد کردن سرور: نصف به بالا روی عدد صحیح. */
function taxOf(net, rateBp) {
  const numerator = net * BigInt(rateBp);
  const denominator = 10_000n;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

async function ensureVendor(client, spec) {
  const existing = await client.request('GET', `/vendors?search=${encodeURIComponent(spec.name)}`);
  const found = (existing.data?.items ?? []).find((item) => item.name === spec.name);
  if (found) return found.id;

  const created = await client.request('POST', '/vendors', {
    body: {
      personType: 'LEGAL',
      name: spec.name,
      economicCode: spec.economicCode,
      addressLine: spec.addressLine,
      postalCode: spec.postalCode,
      phone: spec.phone,
    },
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`ساخت فروشنده ناموفق: ${created.status} ${cut(created.data, 400)}`);
  }
  return created.data.id;
}

/**
 * آزمون مستقل ضد Formula Injection.
 *
 * به‌جای تکیه بر اینکه داده آزمون تصادفاً با «=» شروع شود، یک فروشنده با نام مهاجم
 * ساخته و همان مسیر نوشتن سلول آزموده می‌شود.
 */
async function buildInjectionProbe() {
  const { ExcelExporter } = await import('../apps/api/dist/modules/reporting/excel.exporter.js');
  const exporter = new ExcelExporter();
  const report = {
    titleFa: 'آزمون تزریق فرمول',
    page: { size: 'A4', orientation: 'landscape', margins: { top: 10, bottom: 10, inlineStart: 10, inlineEnd: 10 }, direction: 'rtl' },
    styles: { fontFamily: 'Vazirmatn', baseFontSizePt: 9, headingFontSizePt: 12, tableFontSizePt: 8, borderWidthPx: 1, borderColor: '#333333', textColor: '#000000', mutedTextColor: '#555555' },
    header: [],
    repeatHeader: false,
    body: [
      {
        kind: 'table',
        id: 't',
        columns: [{ key: 'name', titleFa: 'نام', width: { unit: 'auto' }, align: 'start', isNumeric: false }],
        rows: [[{ text: '=HYPERLINK("http://evil","برنده شدید")', raw: null, align: 'start', extraLines: [] }]],
        fildlerRowCount: 0,
        totals: null,
        totalsLabel: null,
        repeatHeaderOnNewPage: true,
        avoidRowBreak: true,
      },
    ],
    footer: [],
    repeatFooter: false,
    generatedAt: '2026-10-16',
  };

  const buffer = await exporter.build(report);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // سلول داده با جست‌وجو پیدا می‌شود، نه با آدرس ثابت: شماره ردیف به تعداد بلوک‌های
  // سربرگ بستگی دارد و آدرس ثابت، تست را شکننده می‌کند.
  let found = null;
  workbook.worksheets[0].eachRow((row) => {
    row.eachCell((cell) => {
      const value = cell.value;
      if (typeof value === 'string' && value.includes('HYPERLINK')) found = value;
      if (value && typeof value === 'object' && 'formula' in value && String(value.formula).includes('HYPERLINK')) {
        found = { formula: value.formula };
      }
    });
  });

  return {
    value: typeof found === 'string' ? found : JSON.stringify(found),
    startsWithQuote: typeof found === 'string' && found.startsWith("'="),
    isFormula: Boolean(found && typeof found === 'object'),
  };
}

/**
 * رندر یک گزارش ۴۰ ردیفی به PDF، بدون نیاز به ساختن ۴۰ فروشنده در پایگاه داده.
 *
 * موتور همان است که سرویس استفاده می‌کند و قالب هم همان فایل seed؛ تنها چیزی که
 * ساختگی است، ردیف‌های داده‌اند.
 */
async function renderMultipagePdf() {
  const [{ chromium }, engine, { readFileSync }] = await Promise.all([
    import('playwright-core'),
    import('@dm/report-engine'),
    import('node:fs'),
  ]);

  const template = engine.templateV1Schema.parse(
    JSON.parse(readFileSync('apps/api/prisma/seed/templates/tax-report.json', 'utf8')),
  );

  const rows = Array.from({ length: 40 }, (_, index) => ({
    index: index + 1,
    vendorId: `v-${index}`,
    vendorName: `شرکت آزمون شماره ${index + 1}`,
    vendorIdentifier: '411134858916',
    representativeName: 'نماینده آزمون',
    address: `قم — خیابان آزمون — پلاک ${index + 1}`,
    phone: '02537758881',
    postalCode: '3715698541',
    invoiceNumber: `INV-${index + 1}`,
    invoiceDate: '2026-10-04',
    invoiceCount: 1,
    productTypeTitle: 'انشعاب برق',
    goodsAmount: String(10_000_000 + index * 111_111),
    discount: '0',
    net: String(10_000_000 + index * 111_111),
    tax: String(1_000_000 + index * 11_111),
    total: String(11_000_000 + index * 122_222),
  }));

  const report = engine.layoutReport(template, {
    values: {
      organization: { name: 'سازمان آزمون', economicCode: '', addressLine: '', phone: '' },
      document: {
        title: 'سند آزمون چندصفحه‌ای',
        fiscalYear: 1405,
        documentNumber: '',
        documentDateJalali: '',
      },
    },
    collections: { 'document.vendorAggregates': rows },
    signatories: [],
    roundingMode: 'HALF_UP',
    generatedAt: '2026-10-16',
  });

  const html = engine.renderReportHtml(report);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });

    const text = Buffer.from(pdf).toString('latin1');
    const match = /\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/u.exec(text);

    const tableBlock = template.body.find((block) => block.type === 'table');
    return {
      html,
      pages: match ? Number(match[1]) : 0,
      widthMm: engine.tableWidthMm(tableBlock),
      printableMm: engine.printableWidthMm(template.page),
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const admin = new Client('admin');
  const nazer = new Client('nazer');
  await admin.login(ADMIN_PASSWORD);
  await nazer.login();

  // ── آماده‌سازی: اطلاعات پایه لازم
  const [buyers, categories, bootstrap] = await Promise.all([
    admin.request('GET', '/buyers?pageSize=50'),
    admin.request('GET', '/base-data/chapters/categories'),
    admin.request('GET', '/base-data/bootstrap'),
  ]);

  // روش «کارپرداز / تنخواه» انتخاب می‌شود چون فیلد وابسته‌ای (شبا، شناسه قبض) نمی‌خواهد
  // و تمرکز این آزمون روی گزارش است، نه روی پرداخت.
  const paymentMethod = (bootstrap.data?.paymentMethods ?? []).find(
    (method) => method.kind === 'PETTY_CASH',
  );
  if (!paymentMethod) throw new Error('روش پرداخت تنخواه ثبت نشده است');
  const paymentMethodId = paymentMethod.id;

  const buyerId = buyers.data?.items?.[0]?.id;
  if (!buyerId) throw new Error('هیچ مجموعه خریداری ثبت نشده است');

  // فصلی که نوع فاکتور عادی دارد.
  let chapter = null;
  for (const category of categories.data ?? []) {
    for (const candidate of category.chapters ?? []) {
      const link = (candidate.invoiceTypes ?? []).find(
        (item) => item.invoiceType?.kind === 'NORMAL' && item.invoiceType?.isActive !== false,
      );
      if (link) {
        chapter = { id: candidate.id, invoiceTypeId: link.invoiceType.id };
        break;
      }
    }
    if (chapter) break;
  }
  if (!chapter) throw new Error('فصلی با نوع فاکتور عادی پیدا نشد');

  const vendorAId = await ensureVendor(admin, DATA.vendorA);
  const vendorBId = await ensureVendor(admin, DATA.vendorB);

  // ── ساخت سند آزمون
  const stamp = Date.now() % 100000;
  const createdDocument = await admin.request('POST', '/documents', {
    body: {
      title: `سند آزمون گزارش مالیات ${stamp}`,
      type: 'NORMAL',
      fiscalYear: 1405,
      jalaliYear: 1405,
      buyerEntityId: buyerId,
      stad: null,
    },
  });
  if (createdDocument.status !== 201 && createdDocument.status !== 200) {
    throw new Error(`ساخت سند ناموفق: ${createdDocument.status} ${cut(createdDocument.data, 400)}`);
  }
  const documentId = createdDocument.data.id;
  results.push(`— سند آزمون ساخته شد: ${documentId} —`);

  async function addInvoice(spec, vendorId) {
    const result = await admin.request('POST', `/documents/${documentId}/invoices`, {
      body: {
        chapterId: chapter.id,
        invoiceTypeId: chapter.invoiceTypeId,
        vendorId,
        invoiceNumber: spec.number,
        invoiceDate: spec.date,
        notes: null,
        payment: { paymentMethodId },
        details: {
          kind: 'NORMAL',
          taxMode: 'PERCENT',
          taxRateBp: spec.rateBp,
          taxAmount: null,
          items: [
            {
              rowNo: 1,
              description: 'ردیف آزمون',
              productCode: null,
              quantity: '1',
              unitId: null,
              unitPrice: spec.gross.toString(),
              discountAmount: spec.discount.toString(),
              taxMode: 'PERCENT',
              taxRateBp: spec.rateBp,
              taxAmount: null,
            },
          ],
        },
      },
    });
    if (result.status !== 201 && result.status !== 200) {
      throw new Error(`ثبت فاکتور ناموفق: ${result.status} ${cut(result.data, 500)}`);
    }
    return result.data;
  }

  await addInvoice(DATA.a1, vendorAId);
  await addInvoice(DATA.a2, vendorAId);
  await addInvoice(DATA.b1, vendorBId);
  await addInvoice(DATA.orphan, null);

  // ── تعیین نوع کالا
  const suggestions = await admin.request(
    'POST',
    `/reports/documents/${documentId}/vendors/${vendorAId}/product-type/suggestions`,
  );
  check(
    'پیشنهاد نوع کالا همراه خریدهای قبلی برمی‌گردد',
    suggestions.status === 200 || suggestions.status === 201,
    `${suggestions.status} ${cut(suggestions.data)}`,
  );
  const electricityType = (suggestions.data?.allTypes ?? []).find(
    (item) => item.title === 'انشعاب برق',
  );
  const earthType = (suggestions.data?.allTypes ?? []).find((item) => item.title === 'چاه ارت');
  check('انواع کالا در فهرست هستند', Boolean(electricityType && earthType), cut(suggestions.data?.allTypes));

  const setA = await admin.request(
    'POST',
    `/reports/documents/${documentId}/vendors/${vendorAId}/product-type`,
    { body: { productTypeId: electricityType.id } },
  );
  const setB = await admin.request(
    'POST',
    `/reports/documents/${documentId}/vendors/${vendorBId}/product-type`,
    { body: { productTypeId: earthType.id } },
  );
  check(
    'نوع کالا برای هر دو فروشنده ثبت شد',
    (setA.status === 200 || setA.status === 201) && (setB.status === 200 || setB.status === 201),
    `${setA.status}/${setB.status} ${cut(setA.data)}`,
  );

  // فروشنده‌ای که در این سند فاکتور ندارد، نباید نوع کالا بگیرد (ضد IDOR).
  const ghostVendor = crypto.randomUUID();
  const setGhost = await admin.request(
    'POST',
    `/reports/documents/${documentId}/vendors/${ghostVendor}/product-type`,
    { body: { productTypeId: electricityType.id } },
  );
  check('فروشنده بدون فاکتور در این سند ۴۰۴ می‌گیرد', setGhost.status === 404, `${setGhost.status}`);

  // ── ثبت نهایی
  const finalize = await admin.request('POST', `/documents/${documentId}/finalize`, {
    idempotent: true,
  });
  check('سند آزمون ثبت نهایی شد', finalize.status === 200, `${finalize.status} ${cut(finalize.data, 400)}`);

  // ── محاسبه دستی
  const netA1 = DATA.a1.gross - DATA.a1.discount;
  const netA2 = DATA.a2.gross - DATA.a2.discount;
  const netB = DATA.b1.gross - DATA.b1.discount;
  const taxA1 = taxOf(netA1, DATA.a1.rateBp);
  const taxA2 = taxOf(netA2, DATA.a2.rateBp);
  const taxB = taxOf(netB, DATA.b1.rateBp);

  const expectedA = {
    goodsAmount: DATA.a1.gross + DATA.a2.gross,
    discount: DATA.a1.discount + DATA.a2.discount,
    net: netA1 + netA2,
    tax: taxA1 + taxA2,
    invoiceDate: DATA.a1.date, // قدیمی‌ترین
    invoiceNumber: '', // دو فاکتور ⇒ خالی
  };
  expectedA.total = expectedA.net + expectedA.tax;

  const expectedB = {
    goodsAmount: DATA.b1.gross,
    discount: DATA.b1.discount,
    net: netB,
    tax: taxB,
    total: netB + taxB,
    invoiceDate: DATA.b1.date,
    invoiceNumber: DATA.b1.number,
  };

  // ── اجرای گزارش
  const preview = await admin.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check('گزارش اجرا شد', preview.status === 200 || preview.status === 201, `${preview.status} ${cut(preview.data, 400)}`);

  const table = (preview.data?.report?.body ?? []).find((block) => block.kind === 'table');
  check('جدول گزارش ساخته شد', Boolean(table), cut(preview.data?.report?.body));

  const byKey = (row) => {
    const map = {};
    table.columns.forEach((column, index) => {
      map[column.key] = row[index];
    });
    return map;
  };

  check(
    'فاکتور بدون فروشنده از گزارش بیرون مانده و شمرده شده است',
    preview.data?.skippedInvoiceCount === 1 && table.rows.length === 2,
    `skipped=${preview.data?.skippedInvoiceCount} rows=${table.rows.length}`,
  );

  // ترتیب ردیف‌ها: بر اساس تاریخ اولین فاکتور ⇒ الف (۰۴) پیش از ب (۰۸)
  const rowA = byKey(table.rows[0] ?? []);
  const rowB = byKey(table.rows[1] ?? []);

  check(
    'ترتیب ردیف‌ها بر اساس تاریخ اولین فاکتور است',
    rowA.counterparty?.text === DATA.vendorA.name && rowB.counterparty?.text === DATA.vendorB.name,
    `${rowA.counterparty?.text} | ${rowB.counterparty?.text}`,
  );

  // ── معیار پذیرش ۱: هر ستون، عدد به عدد
  const columnChecks = [
    ['مبلغ کالا (الف)', rowA.goodsAmount?.raw, expectedA.goodsAmount],
    ['مبلغ تخفیف (الف)', rowA.discount?.raw, expectedA.discount],
    ['مبلغ خالص (الف)', rowA.net?.raw, expectedA.net],
    ['مالیات (الف)', rowA.tax?.raw, expectedA.tax],
    ['جمع کل (الف)', rowA.total?.raw, expectedA.total],
    ['مبلغ کالا (ب)', rowB.goodsAmount?.raw, expectedB.goodsAmount],
    ['مبلغ تخفیف (ب)', rowB.discount?.raw, expectedB.discount],
    ['مبلغ خالص (ب)', rowB.net?.raw, expectedB.net],
    ['مالیات (ب)', rowB.tax?.raw, expectedB.tax],
    ['جمع کل (ب)', rowB.total?.raw, expectedB.total],
  ];
  for (const [label, actual, expected] of columnChecks) {
    check(`${label} با محاسبه دستی می‌خواند`, actual === expected.toString(), `${actual} ≠ ${expected}`);
  }

  // ── معیار پذیرش ۲: قاعده شماره صورتحساب
  check(
    'فروشنده با دو فاکتور، شماره صورتحساب خالی دارد',
    rowA.invoiceRef?.text === '',
    `«${rowA.invoiceRef?.text}»`,
  );
  // ستون با ارقام فارسی نمایش داده می‌شود (docs/15 §۴)، پس مقایسه هم با همان شکل است.
  const persianNumber = DATA.b1.number.replace(/\d/gu, (digit) =>
    String.fromCharCode(0x06f0 + Number(digit)),
  );
  check(
    'فروشنده با یک فاکتور، شماره صورتحساب دارد',
    rowB.invoiceRef?.text === persianNumber,
    `«${rowB.invoiceRef?.text}» ≠ «${persianNumber}»`,
  );

  // ── معیار پذیرش ۳: قاعده تاریخ صورتحساب (اولین فاکتور)
  check(
    'تاریخ صورتحساب، تاریخ قدیمی‌ترین فاکتور است',
    rowA.invoiceRef?.extraLines?.[0]?.text === '۱۴۰۵/۰۷/۱۲',
    `${cut(rowA.invoiceRef?.extraLines)}`,
  );

  // ── هویت فروشنده از snapshot
  check(
    'شماره اقتصادی با گروه‌بندی چهارتایی نمایش داده می‌شود',
    rowA.counterparty?.extraLines?.[0]?.text === '۴۱۱۱-۳۴۸۵-۸۹۱۶',
    `${cut(rowA.counterparty?.extraLines)}`,
  );
  check('نوع کالا در ردیف نشسته است', rowA.productType?.text === 'انشعاب برق', rowA.productType?.text);
  check('نشانی فروشنده از snapshot می‌آید', rowA.address?.text === DATA.vendorA.addressLine, rowA.address?.text);

  // ── معیار پذیرش ۴: جمع‌ها بدون دوباره‌شماری
  const totalsRow = byKey(table.totals ?? []);
  const sumGoods = expectedA.goodsAmount + expectedB.goodsAmount;
  const sumTotal = expectedA.total + expectedB.total;
  check('ردیف جمع ستون مبلغ کالا درست است', totalsRow.goodsAmount?.raw === sumGoods.toString(), `${totalsRow.goodsAmount?.raw} ≠ ${sumGoods}`);
  check('ردیف جمع ستون جمع کل درست است', totalsRow.total?.raw === sumTotal.toString(), `${totalsRow.total?.raw} ≠ ${sumTotal}`);

  // Σ ردیف‌های گزارش == Σ فاکتورهای مشمول (یعنی بدون فاکتور بی‌فروشنده)
  const documentDetail = await admin.request('GET', `/documents/${documentId}`);
  const includedTotal = (documentDetail.data?.invoices ?? [])
    .filter((invoice) => invoice.vendorSnapshot !== null)
    .reduce((total, invoice) => total + BigInt(invoice.totalAmount), 0n);
  check(
    'Σ ردیف‌های گزارش برابر Σ فاکتورهای مشمول است',
    sumTotal === includedTotal,
    `${sumTotal} ≠ ${includedTotal}`,
  );

  // و جمع سند = جمع گزارش + فاکتور بیرون‌مانده (هیچ چیز دوبار شمرده نشده)
  const documentTotal = BigInt(documentDetail.data?.totalAmount ?? '0');
  const orphanTotal = DATA.orphan.gross + taxOf(DATA.orphan.gross, DATA.orphan.rateBp);
  check(
    'جمع سند = جمع گزارش + فاکتور بدون فروشنده',
    documentTotal === sumTotal + orphanTotal,
    `${documentTotal} ≠ ${sumTotal} + ${orphanTotal}`,
  );

  // ── حداقل ردیف چاپی
  check('جدول چاپی حداقل ۴ ردیف دارد', table.fildlerRowCount === 2, `filler=${table.fildlerRowCount}`);

  // ── امضاها از اطلاعات پایه
  const signatureRow = (preview.data?.report?.footer ?? []).find(
    (block) => block.kind === 'signatureRow',
  );
  check(
    'دو بلوک امضا با نام و سمت از اطلاعات پایه',
    signatureRow?.blocks?.length === 2 &&
      signatureRow.blocks[0].positionTitle === 'مسئول کارپردازی' &&
      signatureRow.blocks[1].fullName === 'احمدرضا اجتهادی',
    cut(signatureRow),
  );

  // ── خروجی HTML
  const html = await admin.request('POST', `/reports/TAX_REPORT/documents/${documentId}/html`, {
    raw: true,
  });
  const htmlText = await html.response.text();
  check('خروجی HTML تولید شد', html.status === 200 || html.status === 201, `${html.status}`);
  check('صفحه افقی A4 است', htmlText.includes('size: A4 landscape;'), '');
  check('جهت راست‌به‌چپ است', htmlText.includes('dir="rtl"'), '');
  check('سرستون در صفحه بعد تکرار می‌شود', htmlText.includes('thead { display: table-header-group; }'), '');
  check('هیچ منبع خارجی بارگذاری نمی‌شود', !/https?:\/\//u.test(htmlText), '');
  check(
    'مبالغ با ارقام فارسی و جداکننده هزارگان‌اند',
    htmlText.includes('۲۰٬۱۲۳٬۴۵۵'),
    'جمع کالای فروشنده الف در HTML پیدا نشد',
  );

  // ── خروجی Excel
  const excel = await admin.request('POST', `/reports/TAX_REPORT/documents/${documentId}/excel`, {
    raw: true,
  });
  const buffer = Buffer.from(await excel.response.arrayBuffer());
  check('خروجی Excel تولید شد', excel.status === 200 || excel.status === 201, `${excel.status}`);
  check(
    'نوع محتوای Excel درست است',
    (excel.response.headers.get('content-type') ?? '').includes('spreadsheetml'),
    excel.response.headers.get('content-type'),
  );
  check('فایل Excel یک ZIP معتبر است', buffer.subarray(0, 2).toString('latin1') === 'PK', '');

  // فایل xlsx یک ZIP است؛ بررسی محتوایش فقط با باز کردن واقعی معنا دارد.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];

  let numericMoneyCell = null;
  let totalsFormulaCell = null;
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === 'number' && cell.value === Number(expectedA.goodsAmount)) {
        numericMoneyCell = cell;
      }
      if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
        totalsFormulaCell = cell.value.formula;
      }
    });
  });

  check(
    'سلول مالی در Excel عدد واقعی است، نه متن',
    numericMoneyCell !== null && numericMoneyCell.numFmt === '#,##0',
    `${numericMoneyCell?.value} / ${numericMoneyCell?.numFmt}`,
  );
  check(
    'ردیف جمع از فرمول SUBTOTAL استفاده می‌کند',
    (totalsFormulaCell ?? '').startsWith('SUBTOTAL(109'),
    `${totalsFormulaCell}`,
  );
  check('شیت راست‌به‌چپ است', sheet.views?.[0]?.rightToLeft === true, cut(sheet.views));

  // ضد Formula Injection: متنی که با «=» شروع شود نباید فرمول شود.
  const injectionSheet = await buildInjectionProbe();
  check(
    'متن شروع‌شده با «=» به‌صورت فرمول نوشته نمی‌شود',
    injectionSheet.startsWithQuote && !injectionSheet.isFormula,
    cut(injectionSheet),
  );

  // ── خروجی PDF (معیار پذیرش ۵)
  const pdf = await admin.request('POST', `/reports/TAX_REPORT/documents/${documentId}/pdf`, {
    raw: true,
  });
  const pdfBuffer = Buffer.from(await pdf.response.arrayBuffer());
  check('خروجی PDF تولید شد', pdf.status === 200 || pdf.status === 201, `${pdf.status}`);
  check('فایل واقعاً PDF است', pdfBuffer.subarray(0, 5).toString('latin1') === '%PDF-', '');
  check(
    'نوع محتوا و نام فایل PDF درست‌اند',
    (pdf.response.headers.get('content-type') ?? '').includes('application/pdf') &&
      (pdf.response.headers.get('content-disposition') ?? '').includes("filename*=UTF-8''"),
    `${pdf.response.headers.get('content-type')} | ${pdf.response.headers.get('content-disposition')}`,
  );

  // گزارش بلند: سرستون باید در صفحه‌های بعد تکرار شود و ستونی بریده نشود.
  const multipage = await renderMultipagePdf();
  check(
    'گزارش ۴۰ ردیفی چندصفحه‌ای می‌شود',
    multipage.pages >= 2,
    `تعداد صفحه: ${multipage.pages}`,
  );
  check(
    'سرستون در هر صفحه تکرار می‌شود (table-header-group)',
    multipage.html.includes('thead { display: table-header-group; }'),
    '',
  );
  check(
    'ردیف جمع در tfoot نیست تا پای هر صفحه تکرار نشود',
    !multipage.html.includes('<tfoot>'),
    'ردیف جمع در tfoot است و روی هر صفحه تکرار می‌شود',
  );
  check(
    'مجموع عرض ستون‌ها در عرض قابل چاپ جا می‌شود',
    multipage.widthMm <= multipage.printableMm,
    `${multipage.widthMm}mm > ${multipage.printableMm}mm`,
  );

  // ── تفکیک وظایف گزارش
  const supervisorRun = await nazer.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'ناظر می‌تواند گزارش را اجرا کند (مجوز report:run)',
    supervisorRun.status === 200 || supervisorRun.status === 201,
    `${supervisorRun.status}`,
  );
  const supervisorSet = await nazer.request(
    'POST',
    `/reports/documents/${documentId}/vendors/${vendorAId}/product-type`,
    { body: { productTypeId: earthType.id } },
  );
  check('ناظر نمی‌تواند نوع کالا را عوض کند (۴۰۳)', supervisorSet.status === 403, `${supervisorSet.status}`);

  const anonymous = await fetch(`${BASE}/reports/TAX_REPORT/documents/${documentId}/preview`, {
    method: 'POST',
  });
  check('اجرای گزارش بدون ورود رد می‌شود', anonymous.status === 401 || anonymous.status === 403, `${anonymous.status}`);

  // ── تاریخچه اجرا
  const runs = await admin.request('GET', `/reports/documents/${documentId}/runs`);
  check(
    'تاریخچه اجرای گزارش ثبت شده است',
    runs.status === 200 && (runs.data?.length ?? 0) >= 3,
    `${runs.status} تعداد=${runs.data?.length}`,
  );

  console.log(results.join('\n'));
  console.log(`\nنتیجه: ${pass} قبول، ${fail} رد`);
  console.log(`سند آزمون: ${documentId}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error('خطای غیرمنتظره:', error);
  process.exitCode = 2;
});
