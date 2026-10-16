/**
 * آزمون زنده فاز ۷ — طراح بصری قالب گزارش.
 *
 * شش معیار پذیرش این فاز روی **سرویس در حال اجرا** سنجیده می‌شوند، نه با mock:
 *
 *   ۱. کاربر مجاز قالب گزارش مالیات را باز می‌کند، ویرایش و منتشر می‌کند و **بدون
 *      تغییر کد** خروجی PDF و Excel معتبر می‌گیرد.
 *   ۲. قالبی که به مسیر داده غیرمجاز اشاره کند با پیام روشن رد می‌شود — و ذخیره نمی‌شود.
 *   ۳. کاربر کم‌دسترسی که قالب کاربر پردسترسی را اجرا می‌کند، داده غیرمجاز نمی‌بیند.
 *   ۴. تزریق کد و HTML در قالب و در داده بی‌اثر است.
 *   ۵. انتشار نسخه ۲ خروجی تاریخی نسخه ۱ را عوض نمی‌کند.
 *   ۶. قالبی که از سقف عمق یا تعداد گره بگذرد رد می‌شود.
 *
 * اسکریپت **تکرارپذیر** است: در پایان، قالب فعال نوع گزارش به همان قالب سیستمی
 * برمی‌گردد و بررسی می‌شود که برگشته باشد.
 *
 * پیش‌نیاز: سرویس بالا، داده مرجع ثبت‌شده، کاربران آزمون ساخته‌شده.
 * اجرا: `npm run verify:phase7`
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
  async request(method, path, { body, idempotencyKey, raw = false } = {}) {
    const headers = { Cookie: this.cookieHeader() };
    if (this.cookies.has('dm_csrf')) headers['x-csrf-token'] = this.cookies.get('dm_csrf');
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
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
  async buffer(method, path) {
    const headers = { Cookie: this.cookieHeader() };
    if (this.cookies.has('dm_csrf')) headers['x-csrf-token'] = this.cookies.get('dm_csrf');
    const response = await fetch(`${BASE}${path}`, { method, headers });
    return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
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

/** یک فاکتور با اعداد معلوم: کالا ۱۰٬۰۰۰٬۰۰۰، تخفیف ۱٬۰۰۰٬۰۰۰، مالیات ۱۰٪. */
const INVOICE = {
  gross: 10_000_000n,
  discount: 1_000_000n,
  rateBp: 1000,
  date: '2026-10-06',
  number: 'P7-1',
};
const EXPECTED = {
  net: INVOICE.gross - INVOICE.discount, // ۹٬۰۰۰٬۰۰۰
  tax: 900_000n,
  total: 9_900_000n,
};

/** نام فروشنده با بار تزریق — معیار پذیرش ۴ روی **داده**، نه فقط قالب. */
const INJECTION_VENDOR_NAME = 'شرکت <script>alert(1)</script> آزمون';
const INJECTION_TEXT = '<img src=x onerror="alert(1)">';

async function ensureVendor(client, name) {
  const existing = await client.request('GET', `/vendors?search=${encodeURIComponent('آزمون')}`);
  const found = (existing.data?.items ?? []).find((item) => item.name === name);
  if (found) return found.id;

  const created = await client.request('POST', '/vendors', {
    body: {
      personType: 'LEGAL',
      name,
      economicCode: '411155667788',
      addressLine: 'قم — خیابان آزمون فاز هفت',
      postalCode: '3715600001',
      phone: '02537758899',
    },
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`ساخت فروشنده ناموفق: ${created.status} ${cut(created.data, 400)}`);
  }
  return created.data.id;
}

/** سند آزمون تازه با یک فاکتور معلوم. */
async function createDocument(admin) {
  const [buyers, categories, bootstrap] = await Promise.all([
    admin.request('GET', '/buyers?pageSize=50'),
    admin.request('GET', '/base-data/chapters/categories'),
    admin.request('GET', '/base-data/bootstrap'),
  ]);

  const buyerId = buyers.data?.items?.[0]?.id;
  if (!buyerId) throw new Error('هیچ مجموعه خریداری ثبت نشده است');

  const paymentMethod = (bootstrap.data?.paymentMethods ?? []).find(
    (method) => method.kind === 'PETTY_CASH',
  );
  if (!paymentMethod) throw new Error('روش پرداخت تنخواه ثبت نشده است');

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

  const vendorId = await ensureVendor(admin, INJECTION_VENDOR_NAME);

  const created = await admin.request('POST', '/documents', {
    body: {
      title: `سند آزمون طراح گزارش ${Date.now() % 100000}`,
      type: 'NORMAL',
      fiscalYear: 1405,
      jalaliYear: 1405,
      buyerEntityId: buyerId,
      stad: null,
    },
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`ساخت سند ناموفق: ${created.status} ${cut(created.data, 400)}`);
  }
  const documentId = created.data.id;

  const invoice = await admin.request('POST', `/documents/${documentId}/invoices`, {
    body: {
      chapterId: chapter.id,
      invoiceTypeId: chapter.invoiceTypeId,
      vendorId,
      invoiceNumber: INVOICE.number,
      invoiceDate: INVOICE.date,
      notes: null,
      payment: { paymentMethodId: paymentMethod.id },
      details: {
        kind: 'NORMAL',
        taxMode: 'PERCENT',
        taxRateBp: INVOICE.rateBp,
        taxAmount: null,
        items: [
          {
            rowNo: 1,
            description: 'ردیف آزمون فاز ۷',
            productCode: null,
            quantity: '1',
            unitId: null,
            unitPrice: INVOICE.gross.toString(),
            discountAmount: INVOICE.discount.toString(),
            taxMode: 'PERCENT',
            taxRateBp: INVOICE.rateBp,
            taxAmount: null,
          },
        ],
      },
    },
  });
  if (invoice.status !== 201 && invoice.status !== 200) {
    throw new Error(`ثبت فاکتور ناموفق: ${invoice.status} ${cut(invoice.data, 500)}`);
  }

  return { documentId, vendorId };
}

/** عبارت تودرتو با عمق دلخواه — برای آزمون سقف عمق. */
function deepExpression(levels) {
  let node = { k: 'var', path: 'row.net' };
  for (let index = 0; index < levels; index += 1) {
    node = { k: 'arith', op: 'add', args: [node, { k: 'const', type: 'money', v: '1' }] };
  }
  return node;
}

/** درخت پهن — برای آزمون سقف تعداد گره (۶ انشعاب، عمق ۵ ⇒ حدود ۹۳۰۰ گره). */
function wideExpression(depth) {
  if (depth === 0) return { k: 'const', type: 'text', v: 'x' };
  return { k: 'concat', args: Array.from({ length: 6 }, () => wideExpression(depth - 1)) };
}

function tableOf(template) {
  return template.body.find((block) => block.type === 'table');
}

function columnValues(table, rowIndex = 0) {
  const map = {};
  table.columns.forEach((column, index) => {
    map[column.key] = table.rows[rowIndex]?.[index];
  });
  return map;
}

async function main() {
  const admin = new Client('admin');
  const bayegan = new Client('bayegan');
  const nazer = new Client('nazer');
  await admin.login(ADMIN_PASSWORD);
  await bayegan.login();
  await nazer.login();

  const { documentId } = await createDocument(admin);
  results.push(`— سند آزمون: ${documentId} —`);

  // ───────────────────────── فهرست قالب‌ها و قالب سیستمی ─────────────────────────

  const list = await admin.request('GET', '/reports/definitions');
  check('فهرست قالب‌ها خوانده شد', list.status === 200, `${list.status} ${cut(list.data)}`);

  const systemDefinition = (list.data ?? []).find(
    (row) => row.isSystem && row.reportType.key === 'TAX_REPORT',
  );
  check('قالب سیستمی گزارش مالیات در فهرست است', Boolean(systemDefinition), cut(list.data));
  check(
    'قالب سیستمی در آغاز، قالب فعال این نوع گزارش است',
    systemDefinition?.isActive === true,
    cut(systemDefinition),
  );

  const systemVersionId = systemDefinition.currentVersion.id;
  const systemVersion = await admin.request('GET', `/reports/versions/${systemVersionId}`);
  check(
    'محتوای قالب سیستمی خوانده شد',
    systemVersion.status === 200 && systemVersion.data?.template?.schemaVersion === 1,
    `${systemVersion.status} ${cut(systemVersion.data, 200)}`,
  );
  const originalTitle = systemVersion.data.template.titleFa;

  // قالب سیستمی مستقیم ویرایش نمی‌شود — مرجع بازگشت باید سالم بماند.
  const directEdit = await admin.request('POST', `/reports/definitions/${systemDefinition.id}/draft`, {
    body: { template: systemVersion.data.template },
  });
  check(
    'ویرایش مستقیم قالب سیستمی رد می‌شود',
    directEdit.status === 409 && directEdit.data?.code === 'REPORT_TEMPLATE_SYSTEM',
    `${directEdit.status} ${cut(directEdit.data)}`,
  );

  const directRename = await admin.request('PATCH', `/reports/definitions/${systemDefinition.id}`, {
    body: { name: 'نام تازه' },
  });
  check(
    'تغییر نام قالب سیستمی رد می‌شود',
    directRename.status === 409,
    `${directRename.status} ${cut(directRename.data)}`,
  );

  // ───────────────────────── معیار ۱: کپی، ویرایش، انتشار، خروجی ─────────────────

  const stamp = Date.now() % 100000;
  const copy = await admin.request('POST', `/reports/definitions/${systemDefinition.id}/copy`, {
    body: { name: `گزارش مالیات آزمون ${stamp}` },
  });
  check(
    'کپی قالب سیستمی ساخته شد',
    copy.status === 200 || copy.status === 201,
    `${copy.status} ${cut(copy.data)}`,
  );
  const definitionId = copy.data.id;

  const detail = await admin.request('GET', `/reports/definitions/${definitionId}`);
  check(
    'کپی به‌صورت پیش‌نویس و غیرفعال ساخته می‌شود',
    detail.data?.status === 'DRAFT' &&
      detail.data?.isActive === false &&
      detail.data?.versions?.length === 1 &&
      detail.data.versions[0].status === 'DRAFT',
    cut(detail.data, 400),
  );

  const draftVersionId = detail.data.versions[0].id;
  const base = await admin.request('GET', `/reports/versions/${draftVersionId}`);
  check(
    'محتوای کپی همان قالب مبدأ است',
    base.data?.template?.titleFa === originalTitle,
    cut(base.data?.template?.titleFa),
  );

  // ویرایش: حذف ستون آدرس، افزودن ستون محاسبه‌شده، و یک بلوک متنی با بار تزریق.
  const newTitle = `گزارش آزمون طراح ${stamp}`;
  const edited = structuredClone(base.data.template);
  edited.titleFa = newTitle;
  const editedTable = tableOf(edited);
  editedTable.columns = editedTable.columns.filter((column) => column.key !== 'address');
  editedTable.columns.push({
    key: 'checkTotal',
    titleFa: 'خالص + مالیات',
    width: { unit: 'mm', value: 25 },
    align: 'end',
    value: {
      k: 'arith',
      op: 'add',
      args: [
        { k: 'var', path: 'row.net' },
        { k: 'var', path: 'row.tax' },
      ],
    },
    format: { kind: 'currency', persianDigits: true, thousandSeparator: true, decimals: 0, emptyText: '۰' },
  });
  editedTable.totalsRow.cells.checkTotal = 'sum';
  edited.header.blocks.push({
    id: 'injection-probe',
    type: 'text',
    text: `${INJECTION_TEXT} — {{document.title}}`,
    align: 'center',
    bold: false,
  });

  const checkOk = await admin.request('POST', '/reports/templates/check', {
    body: { template: edited },
  });
  check(
    'اعتبارسنجی قالب ویرایش‌شده روی سرور سبز است',
    checkOk.status === 200 && checkOk.data?.ok === true,
    `${checkOk.status} ${cut(checkOk.data)}`,
  );

  const saved = await admin.request('POST', `/reports/definitions/${definitionId}/draft`, {
    body: { template: edited },
  });
  check(
    'پیش‌نویس ذخیره شد و همان نسخه ۱ به‌روز شد',
    (saved.status === 200 || saved.status === 201) &&
      saved.data?.versionNo === 1 &&
      saved.data?.id === draftVersionId,
    `${saved.status} ${cut(saved.data)}`,
  );

  const published = await admin.request('POST', `/reports/versions/${draftVersionId}/publish`, {
    idempotencyKey: crypto.randomUUID(),
  });
  check(
    'نسخه منتشر شد',
    published.status === 200 && published.data?.status === 'PUBLISHED',
    `${published.status} ${cut(published.data)}`,
  );
  check(
    'انتشار، قالب فعال را خودسرانه عوض نمی‌کند',
    published.data?.becameActive === false,
    cut(published.data),
  );

  // نکته اصلی معیار ۱: تا قالب فعال نشود، اجرای نوع گزارش همان قالب قبلی را می‌دهد.
  const beforeActivate = await admin.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'پیش از فعال‌سازی، اجرا همان قالب سیستمی را می‌دهد',
    beforeActivate.data?.report?.titleFa === originalTitle,
    cut(beforeActivate.data?.report?.titleFa),
  );

  const activated = await admin.request('POST', `/reports/definitions/${definitionId}/activate`, {
    idempotencyKey: crypto.randomUUID(),
  });
  check(
    'قالب تازه فعال شد',
    activated.status === 200 && activated.data?.isActive === true,
    `${activated.status} ${cut(activated.data)}`,
  );

  const afterActivate = await admin.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'پس از فعال‌سازی، اجرا قالب تازه را می‌دهد',
    afterActivate.data?.report?.titleFa === newTitle,
    cut(afterActivate.data?.report?.titleFa),
  );

  const liveTable = tableOf({ body: afterActivate.data?.report?.body ?? [] }) ??
    (afterActivate.data?.report?.body ?? []).find((block) => block.kind === 'table');
  check('جدول گزارش تازه ساخته شد', Boolean(liveTable), cut(afterActivate.data?.report?.body, 200));
  check(
    'ستون حذف‌شده در خروجی نیست',
    !(liveTable?.columns ?? []).some((column) => column.key === 'address'),
    cut((liveTable?.columns ?? []).map((column) => column.key)),
  );

  const cells = columnValues(liveTable);
  check(
    'ستون تازه با عبارت محاسبه‌شده درست است (خالص + مالیات)',
    cells.checkTotal?.raw === EXPECTED.total.toString(),
    `checkTotal=${cells.checkTotal?.raw} total=${cells.total?.raw} انتظار=${EXPECTED.total}`,
  );
  check(
    'ستون‌های مالی با محاسبه دستی می‌خوانند',
    cells.net?.raw === EXPECTED.net.toString() &&
      cells.tax?.raw === EXPECTED.tax.toString() &&
      cells.total?.raw === EXPECTED.total.toString(),
    `net=${cells.net?.raw} tax=${cells.tax?.raw} total=${cells.total?.raw}`,
  );

  const firstRunId = afterActivate.data.runId;

  // خروجی Excel از قالبِ ساخته‌شده در طراح
  const excel = await admin.buffer('POST', `/reports/TAX_REPORT/documents/${documentId}/excel`);
  check('خروجی Excel تولید شد', excel.status === 200 && excel.bytes.length > 2000, `${excel.status} ${excel.bytes.length}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excel.bytes);
  const sheet = workbook.worksheets[0];
  let headerFound = false;
  let numericTotal = null;
  let scriptLeak = false;
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const value = cell.value;
      if (value === 'خالص + مالیات') headerFound = true;
      if (typeof value === 'number' && value === Number(EXPECTED.total)) numericTotal = value;
      if (typeof value === 'string' && value.includes('<script>')) scriptLeak = true;
    });
  });
  check('سرستون ستون تازه در Excel هست', headerFound, 'سرستون پیدا نشد');
  check(
    'سلول مالی ستون تازه عدد واقعی است',
    numericTotal === Number(EXPECTED.total),
    `${numericTotal}`,
  );
  check('نام فروشنده با تگ، در Excel به‌صورت متن می‌نشیند', scriptLeak, 'متن خام پیدا نشد');

  const pdf = await admin.buffer('POST', `/reports/TAX_REPORT/documents/${documentId}/pdf`);
  const pdfText = pdf.bytes.toString('latin1');
  const pageMatch = /\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/u.exec(pdfText);
  check(
    'خروجی PDF تولید شد و فایل PDF معتبری است',
    pdf.status === 200 && pdfText.startsWith('%PDF-') && pdf.bytes.length > 5000,
    `${pdf.status} ${pdf.bytes.length} ${pdfText.slice(0, 8)}`,
  );
  check('PDF دست‌کم یک صفحه دارد', Number(pageMatch?.[1] ?? 0) >= 1, cut(pageMatch?.[1]));

  // ───────────────────────── معیار ۴: تزریق کد و HTML ─────────────────────────

  const html = await admin.buffer('POST', `/reports/TAX_REPORT/documents/${documentId}/html`);
  const htmlText = html.bytes.toString('utf8');
  check(
    'خروجی HTML تولید شد',
    html.status === 200 && /^<!doctype html>/iu.test(htmlText.trim()),
    `${html.status} ${htmlText.slice(0, 40)}`,
  );
  check(
    'بار تزریق قالب به‌صورت تگ اجرا نمی‌شود',
    !htmlText.includes('<img src=x') && htmlText.includes('&lt;img src=x'),
    htmlText.includes('<img src=x') ? 'تگ خام در خروجی است' : 'نسخه escape شده پیدا نشد',
  );
  check(
    'بار تزریق داده (نام فروشنده) به‌صورت تگ اجرا نمی‌شود',
    !htmlText.includes('<script>alert(1)</script>') && htmlText.includes('&lt;script&gt;'),
    htmlText.includes('<script>alert(1)</script>') ? 'script خام در خروجی است' : 'escape پیدا نشد',
  );
  check(
    'عنوان گزارش هم escape می‌شود و خروجی هیچ script تگی ندارد',
    !/<script/iu.test(htmlText),
    'تگ script در خروجی هست',
  );
  check(
    'خروجی چاپی هیچ منبع خارجی بار نمی‌کند',
    !/https?:\/\//u.test(htmlText),
    'آدرس خارجی در خروجی هست',
  );
  check(
    'متغیر {{document.title}} جای‌گذاری شده است',
    !htmlText.includes('{{document.title}}'),
    'متغیر جای‌گذاری نشده',
  );

  // ───────────────────────── معیار ۲: مسیر داده غیرمجاز ─────────────────────────

  async function expectRejected(name, mutate, needle) {
    const bad = structuredClone(edited);
    mutate(bad, tableOf(bad));
    const result = await admin.request('POST', '/reports/templates/check', {
      body: { template: bad },
    });
    const message = `${result.data?.message ?? ''} ${(result.data?.details ?? [])
      .map((item) => item.message)
      .join(' ')}`;
    check(
      name,
      result.status === 422 && message.includes(needle),
      `${result.status} ${cut(result.data, 400)}`,
    );
    return bad;
  }

  const badPathTemplate = await expectRejected(
    'مسیر داده بیرون از فهرست رد می‌شود',
    (_template, table) => {
      table.columns[0].value = { k: 'var', path: 'users.passwordHash' };
    },
    'users.passwordHash',
  );

  await expectRejected(
    'ستون ناموجود منبع داده رد می‌شود',
    (_template, table) => {
      table.columns[0].value = { k: 'var', path: 'row.secretSalary' };
    },
    'secretSalary',
  );

  await expectRejected(
    'مسیر ردیف بیرون از جدول رد می‌شود',
    (template) => {
      template.header.blocks.push({
        id: 'bad-row',
        type: 'variable',
        value: { k: 'var', path: 'row.total' },
        format: { kind: 'currency', persianDigits: true, thousandSeparator: true, decimals: 0, emptyText: '۰' },
      });
    },
    'دامنه ردیف',
  );

  await expectRejected(
    'منبع داده ناشناخته رد می‌شود',
    (_template, table) => {
      table.dataSource = 'users';
    },
    'users',
  );

  await expectRejected(
    'متغیر متنی بیرون از فهرست رد می‌شود',
    (template) => {
      template.header.blocks[0].text = 'سلام {{user.passwordHash}}';
    },
    'user.passwordHash',
  );

  // و مهم‌تر: قالب نامعتبر **ذخیره هم نمی‌شود**.
  const beforeBadSave = await admin.request('GET', `/reports/definitions/${definitionId}`);
  const badSave = await admin.request('POST', `/reports/definitions/${definitionId}/draft`, {
    body: { template: badPathTemplate },
  });
  const afterBadSave = await admin.request('GET', `/reports/definitions/${definitionId}`);
  check(
    'ذخیره قالب با مسیر غیرمجاز رد می‌شود',
    badSave.status === 422,
    `${badSave.status} ${cut(badSave.data)}`,
  );
  check(
    'قالب نامعتبر هیچ نسخه‌ای در دیتابیس نمی‌سازد',
    afterBadSave.data?.versions?.length === beforeBadSave.data?.versions?.length,
    `${beforeBadSave.data?.versions?.length} → ${afterBadSave.data?.versions?.length}`,
  );

  // ───────────────────────── معیار ۶: سقف عمق و تعداد گره ─────────────────────────

  await expectRejected(
    'عبارت عمیق‌تر از سقف رد می‌شود',
    (_template, table) => {
      table.columns[0].value = deepExpression(25);
    },
    'عمق عبارت',
  );

  await expectRejected(
    'قالب با گره‌های بیش از سقف رد می‌شود',
    (_template, table) => {
      table.columns[0].value = wideExpression(5);
      table.columns[0].format = {
        kind: 'text',
        persianDigits: false,
        thousandSeparator: false,
        decimals: 0,
        emptyText: '',
      };
    },
    'گره‌های قالب',
  );

  // ───────────────────────── معیار ۵: نسخه تاریخی تغییرناپذیر ─────────────────────

  const secondTitle = `گزارش آزمون طراح ${stamp} — نسخه ۲`;
  const v2Template = structuredClone(edited);
  v2Template.titleFa = secondTitle;

  const savedV2 = await admin.request('POST', `/reports/definitions/${definitionId}/draft`, {
    body: { template: v2Template },
  });
  check(
    'ذخیره روی نسخه منتشرشده، نسخه ۲ تازه می‌سازد',
    (savedV2.status === 200 || savedV2.status === 201) &&
      savedV2.data?.versionNo === 2 &&
      savedV2.data?.id !== draftVersionId,
    `${savedV2.status} ${cut(savedV2.data)}`,
  );
  const v2Id = savedV2.data.id;

  const v1After = await admin.request('GET', `/reports/versions/${draftVersionId}`);
  check(
    'نسخه ۱ منتشرشده دست‌نخورده مانده است',
    v1After.data?.template?.titleFa === newTitle && v1After.data?.status === 'PUBLISHED',
    cut(v1After.data?.template?.titleFa),
  );

  const publishV2 = await admin.request('POST', `/reports/versions/${v2Id}/publish`, {
    idempotencyKey: crypto.randomUUID(),
  });
  check(
    'نسخه ۲ منتشر شد',
    publishV2.status === 200 && publishV2.data?.versionNo === 2,
    `${publishV2.status} ${cut(publishV2.data)}`,
  );

  const afterV2 = await admin.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'اجرای تازه، نسخه ۲ را می‌دهد',
    afterV2.data?.report?.titleFa === secondTitle,
    cut(afterV2.data?.report?.titleFa),
  );

  const reproduced = await admin.request('POST', `/reports/runs/${firstRunId}/reproduce`);
  check(
    'بازتولید اجرای قبلی همان نسخه ۱ را می‌دهد، نه نسخه ۲',
    reproduced.status === 200 && reproduced.data?.report?.titleFa === newTitle,
    `${reproduced.status} ${cut(reproduced.data?.report?.titleFa)}`,
  );

  const history = await admin.request('GET', `/reports/documents/${documentId}/runs`);
  check(
    'تاریخچه اجرا شماره نسخه قالب هر اجرا را نگه داشته است',
    (history.data ?? []).some((row) => row.version?.versionNo === 1) &&
      (history.data ?? []).some((row) => row.version?.versionNo === 2),
    cut((history.data ?? []).map((row) => row.version?.versionNo)),
  );

  // انتشار دوباره همان نسخه رد می‌شود (نسخه منتشرشده تغییرناپذیر است).
  const republish = await admin.request('POST', `/reports/versions/${v2Id}/publish`, {
    idempotencyKey: crypto.randomUUID(),
  });
  check(
    'انتشار دوباره یک نسخه منتشرشده رد می‌شود',
    republish.status === 409,
    `${republish.status} ${cut(republish.data)}`,
  );

  // و انتشار با یک کلید تکراری، دو بار اجرا نمی‌شود (ریسک R8).
  const idempotencyKey = crypto.randomUUID();
  const v3Template = structuredClone(edited);
  v3Template.titleFa = `${newTitle} — نسخه ۳`;
  const savedV3 = await admin.request('POST', `/reports/definitions/${definitionId}/draft`, {
    body: { template: v3Template },
  });
  const firstPublish = await admin.request('POST', `/reports/versions/${savedV3.data.id}/publish`, {
    idempotencyKey,
  });
  const replay = await admin.request('POST', `/reports/versions/${savedV3.data.id}/publish`, {
    idempotencyKey,
  });
  check(
    'انتشار با کلید تکراری، همان پاسخ را بازمی‌گرداند و دوباره اجرا نمی‌شود',
    firstPublish.status === 200 && replay.status === 200 && replay.data?.versionNo === 3,
    `${firstPublish.status}/${replay.status} ${cut(replay.data)}`,
  );

  // ───────────────────────── معیار ۳: کاربر کم‌دسترسی ─────────────────────────

  /*
   * قالبی که **ریز مبالغ هر فاکتور** را نشان می‌دهد، مجوز «جزئیات محاسبه فاکتور»
   * می‌خواهد. بایگانی این مجوز را ندارد ولی مجوز «اجرای گزارش» را دارد — یعنی نگهبان
   * مسیر او را رد نمی‌کند و تنها چیزی که جلویش را می‌گیرد، بررسی مسیرهای داده‌ای
   * قالب در برابر مجوز **کاربر اجراکننده** است.
   */
  const invoiceCopy = await admin.request('POST', `/reports/definitions/${systemDefinition.id}/copy`, {
    body: { name: `ریز فاکتورهای آزمون ${stamp}` },
  });
  const invoiceDefinitionId = invoiceCopy.data.id;
  const invoiceDetail = await admin.request('GET', `/reports/definitions/${invoiceDefinitionId}`);
  const invoiceVersionId = invoiceDetail.data.versions[0].id;
  const invoiceBase = await admin.request('GET', `/reports/versions/${invoiceVersionId}`);

  const invoiceTemplate = structuredClone(invoiceBase.data.template);
  invoiceTemplate.titleFa = `ریز فاکتورهای آزمون ${stamp}`;
  invoiceTemplate.body = [
    {
      id: 'invoice-table',
      type: 'table',
      dataSource: 'document.invoices',
      minRows: 0,
      sortBy: [],
      pagination: { repeatHeaderOnNewPage: true, avoidRowBreak: true },
      columns: [
        {
          key: 'invoiceNumber',
          titleFa: 'شماره فاکتور',
          width: { unit: 'mm', value: 30 },
          align: 'start',
          value: { k: 'var', path: 'row.invoiceNumber' },
          format: { kind: 'text', persianDigits: false, thousandSeparator: false, decimals: 0, emptyText: '—' },
        },
        {
          key: 'invoiceTax',
          titleFa: 'مالیات این فاکتور',
          width: { unit: 'mm', value: 30 },
          align: 'end',
          value: { k: 'var', path: 'row.taxAmount' },
          format: { kind: 'currency', persianDigits: true, thousandSeparator: true, decimals: 0, emptyText: '۰' },
        },
      ],
    },
  ];

  const invoiceSaved = await admin.request('POST', `/reports/definitions/${invoiceDefinitionId}/draft`, {
    body: { template: invoiceTemplate },
  });
  check(
    'قالب ریز فاکتورها ذخیره شد',
    invoiceSaved.status === 200 || invoiceSaved.status === 201,
    `${invoiceSaved.status} ${cut(invoiceSaved.data)}`,
  );

  const invoicePublished = await admin.request('POST', `/reports/versions/${invoiceSaved.data.id}/publish`, {
    idempotencyKey: crypto.randomUUID(),
  });
  check('قالب ریز فاکتورها منتشر شد', invoicePublished.status === 200, `${invoicePublished.status}`);

  await admin.request('POST', `/reports/definitions/${invoiceDefinitionId}/activate`, {
    idempotencyKey: crypto.randomUUID(),
  });

  const adminRun = await admin.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'کاربر پردسترسی ریز فاکتورها را می‌بیند',
    adminRun.status === 200 &&
      adminRun.data?.report?.titleFa === invoiceTemplate.titleFa,
    `${adminRun.status} ${cut(adminRun.data?.report?.titleFa)}`,
  );

  const archivistRun = await bayegan.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'کاربر کم‌دسترسی روی همان قالب ۴۰۳ می‌گیرد',
    archivistRun.status === 403,
    `${archivistRun.status} ${cut(archivistRun.data)}`,
  );
  check(
    'پاسخ ۴۰۳ هیچ داده‌ای از گزارش ندارد',
    archivistRun.data?.report === undefined && !JSON.stringify(archivistRun.data ?? {}).includes('taxAmount'),
    cut(archivistRun.data),
  );
  check(
    'پیام خطا نام مجوز را لو نمی‌دهد',
    !JSON.stringify(archivistRun.data ?? {}).includes('invoice:read_calc_details'),
    cut(archivistRun.data),
  );

  // و همان کاربر، روی قالب تجمیعی (که مجوز جزئیات نمی‌خواهد) از این بابت رد نمی‌شود:
  // بازگشت به قالب تجمیعی و اجرای دوباره.
  await admin.request('POST', `/reports/definitions/${definitionId}/activate`, {
    idempotencyKey: crypto.randomUUID(),
  });
  const archivistAggregate = await bayegan.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'همان کاربر روی گزارش تجمیعی به‌خاطر مسیر داده رد نمی‌شود',
    archivistAggregate.status !== 403,
    `${archivistAggregate.status} ${cut(archivistAggregate.data)}`,
  );

  // ───────────────────────── کنترل دسترسی مسیرهای طراح ─────────────────────────

  const anonymous = await fetch(`${BASE}/reports/definitions`);
  check('کاربر ناشناس به فهرست قالب‌ها ۴۰۱ می‌گیرد', anonymous.status === 401, `${anonymous.status}`);

  const supervisorList = await nazer.request('GET', '/reports/definitions');
  check(
    'ناظر بدون مجوز قالب، فهرست قالب‌ها را نمی‌بیند',
    supervisorList.status === 403,
    `${supervisorList.status}`,
  );

  const supervisorSave = await nazer.request('POST', `/reports/definitions/${definitionId}/draft`, {
    body: { template: edited },
  });
  check('ناظر نمی‌تواند قالب ذخیره کند', supervisorSave.status === 403, `${supervisorSave.status}`);

  const archivistActivate = await bayegan.request(
    'POST',
    `/reports/definitions/${definitionId}/activate`,
    { idempotencyKey: crypto.randomUUID() },
  );
  check(
    'بایگانی نمی‌تواند قالب فعال را عوض کند',
    archivistActivate.status === 403,
    `${archivistActivate.status}`,
  );

  const draftCopy = await admin.request('POST', `/reports/definitions/${systemDefinition.id}/copy`, {
    body: { name: `کپی منتشرنشده ${stamp}` },
  });
  const activateDraft = await admin.request(
    'POST',
    `/reports/definitions/${draftCopy.data.id}/activate`,
    { idempotencyKey: crypto.randomUUID() },
  );
  check(
    'قالب بدون نسخه منتشرشده فعال نمی‌شود',
    activateDraft.status === 409 && activateDraft.data?.code === 'REPORT_TEMPLATE_NOT_PUBLISHED',
    `${activateDraft.status} ${cut(activateDraft.data)}`,
  );

  const ghostVersion = await admin.request('GET', `/reports/versions/${crypto.randomUUID()}`);
  check('نسخه ناموجود ۴۰۴ می‌دهد', ghostVersion.status === 404, `${ghostVersion.status}`);

  const dataSources = await admin.request('GET', '/reports/data-sources');
  check(
    'فهرست منابع داده با مجوز کاربر فیلتر می‌شود',
    dataSources.status === 200 && (dataSources.data ?? []).length >= 4,
    `${dataSources.status} ${cut((dataSources.data ?? []).map((item) => item.key))}`,
  );

  const archivistSources = await bayegan.request('GET', '/reports/data-sources');
  check(
    'منابع داده برای بایگانی هم برمی‌گردد (مجوز اجرای گزارش دارد)',
    archivistSources.status === 200,
    `${archivistSources.status}`,
  );

  const signatories = await admin.request('GET', '/reports/signatories');
  check(
    'نقش‌های امضاکننده برای طراح برمی‌گردند',
    signatories.status === 200 && (signatories.data ?? []).length >= 1,
    `${signatories.status} ${cut(signatories.data)}`,
  );

  // ───────────────────────── بایگانی و پاک‌سازی ─────────────────────────

  const archiveSystem = await admin.request(
    'POST',
    `/reports/definitions/${systemDefinition.id}/archive`,
  );
  check(
    'قالب سیستمی بایگانی نمی‌شود',
    archiveSystem.status === 409 && archiveSystem.data?.code === 'REPORT_TEMPLATE_SYSTEM',
    `${archiveSystem.status} ${cut(archiveSystem.data)}`,
  );

  // قالب فعال هم بایگانی نمی‌شود: ابتدا باید جایگزینش فعال شود.
  await admin.request('POST', `/reports/definitions/${definitionId}/activate`, {
    idempotencyKey: crypto.randomUUID(),
  });
  const archiveWhileActive = await admin.request(
    'POST',
    `/reports/definitions/${definitionId}/archive`,
  );
  check(
    'قالب فعال بایگانی نمی‌شود',
    archiveWhileActive.status === 409 && archiveWhileActive.data?.code === 'REPORT_TEMPLATE_ACTIVE',
    `${archiveWhileActive.status} ${cut(archiveWhileActive.data)}`,
  );

  const restore = await admin.request(
    'POST',
    `/reports/definitions/${systemDefinition.id}/activate`,
    { idempotencyKey: crypto.randomUUID() },
  );
  check('قالب سیستمی دوباره فعال شد', restore.status === 200, `${restore.status} ${cut(restore.data)}`);

  const madeHere = [definitionId, invoiceDefinitionId, draftCopy.data.id];
  const archived = await Promise.all(
    madeHere.map((id) => admin.request('POST', `/reports/definitions/${id}/archive`)),
  );
  check(
    'قالب‌های آزمونی بایگانی شدند',
    archived.every((result) => result.status === 200),
    cut(archived.map((result) => result.status)),
  );

  const defaultList = await admin.request('GET', '/reports/definitions');
  const withArchived = await admin.request('GET', '/reports/definitions?includeArchived=true');
  check(
    'قالب بایگانی‌شده در فهرست پیش‌فرض نیست',
    !(defaultList.data ?? []).some((row) => madeHere.includes(row.id)),
    cut((defaultList.data ?? []).map((row) => row.name)),
  );
  check(
    'قالب بایگانی‌شده با درخواست صریح دیده می‌شود',
    madeHere.every((id) => (withArchived.data ?? []).some((row) => row.id === id)),
    cut((withArchived.data ?? []).length),
  );

  const historyAfterArchive = await admin.request('GET', `/reports/documents/${documentId}/runs`);
  check(
    'بایگانی، تاریخچه اجراها را پاک نمی‌کند',
    (historyAfterArchive.data ?? []).length > 0,
    'تاریخچه خالی شد',
  );

  const finalRun = await admin.request(
    'POST',
    `/reports/TAX_REPORT/documents/${documentId}/preview`,
  );
  check(
    'اجرای پایانی دوباره قالب سیستمی را می‌دهد',
    finalRun.data?.report?.titleFa === originalTitle,
    cut(finalRun.data?.report?.titleFa),
  );

  console.log('\n— نتیجه آزمون زنده فاز ۷ —\n');
  console.log(results.join('\n'));
  console.log(`\nموفق: ${pass}   ناموفق: ${fail}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.log(results.join('\n'));
  console.error('\nاجرای آزمون شکست:', error);
  process.exitCode = 1;
});
