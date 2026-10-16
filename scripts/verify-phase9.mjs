/**
 * آزمون زنده فاز ۹ — چک‌لیست بازبینی امنیتی با شواهد.
 *
 * هر بند `docs/10-security-plan.md §۱۰` اینجا **روی سرویس در حال اجرا** یا روی خود
 * مخزن سنجیده می‌شود، نه با خواندن کد و اطمینان دادن.
 *
 * دو متغیر محیطی:
 *   API_BASE   سرویس توسعه (پیش‌فرض http://localhost:3100/api/v1)
 *   PROD_BASE  سرویس production (تصویر Docker). بندهایی که فقط در production معنا
 *              دارند — نبودن Swagger، نبودن شمارنده کوئری — بدون آن **رد شده**
 *              گزارش می‌شوند، نه سبز.
 *
 * اجرا: npm run verify:phase9
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import ExcelJS from 'exceljs';

const BASE = process.env.API_BASE ?? 'http://localhost:3100/api/v1';
const PROD_BASE = process.env.PROD_BASE ?? null;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin!2345';
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD ?? 'Dev!2345';

let pass = 0;
let fail = 0;
let skipped = 0;
const lines = [];

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    lines.push(`  OK   ${name}`);
  } else {
    fail += 1;
    lines.push(`  FAIL ${name}  >> ${detail ?? ''}`);
  }
}

function skip(name, why) {
  skipped += 1;
  lines.push(`  SKIP ${name}  >> ${why}`);
}

function section(title) {
  lines.push('', `── ${title}`);
}

class Client {
  constructor(username) {
    this.username = username;
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  absorb(response) {
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  async request(method, path, body, options = {}) {
    const headers = { cookie: this.header() };
    if (!options.withoutCsrf) headers['x-csrf-token'] = this.cookies.get('dm_csrf') ?? '';
    if (body !== undefined && !(body instanceof FormData)) {
      headers['content-type'] = 'application/json';
    }

    const send = () =>
      fetch(BASE + path, {
        method,
        headers,
        body:
          body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });

    // یک بار تلاش دوباره: پس از مرحله‌های طولانی (مثل npm audit) اتصال keep-alive را
    // سرور بسته است و اولین درخواست بعدی ECONNRESET می‌گیرد. این خطای برنامه نیست.
    let response;
    try {
      response = await send();
    } catch (error) {
      if (error?.cause?.code !== 'ECONNRESET') throw error;
      response = await send();
    }

    this.absorb(response);
    return response;
  }

  async login(password) {
    const response = await this.request('POST', '/auth/login', {
      username: this.username,
      password: password ?? DEV_PASSWORD,
    });
    if (!response.ok) throw new Error(`ورود ${this.username} ناموفق بود (${response.status})`);
    return response;
  }
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * اسکن **تاریخچه کامل** git برای مقدارهای حساس.
 *
 * نکته مهم: جست‌وجو روی خطوط افزوده‌شده همه commitها انجام می‌شود، نه فقط درخت فعلی.
 * رمزی که یک‌بار commit و بعد حذف شده باشد، همچنان در تاریخچه هست و باید پیدا شود.
 */
function scanGitHistoryForSecrets() {
  const git = (args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

  const envTracked = git(['log', '--all', '--pretty=format:', '--name-only', '--diff-filter=A'])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => (line === '.env' || line.startsWith('.env.')) && line !== '.env.example');

  // الگوها عمداً دنبال **مقدار پرشده** می‌گردند، نه نام متغیر؛ وگرنه خود .env.example
  // و همین اسکریپت هم «یافته» می‌شوند.
  const patterns = [
    new RegExp(
      '(SESSION_SECRET|S3_SECRET_KEY|S3_ACCESS_KEY|POSTGRES_PASSWORD|MINIO_ROOT_PASSWORD)' +
        '\\s*=\\s*["\']?[A-Za-z0-9+/_-]{12,}',
    ),
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    new RegExp('\\bAKIA[0-9A-Z]{16}\\b'),
    new RegExp('\\bghp_[A-Za-z0-9]{36}\\b'),
  ];

  const added = git(['log', '--all', '-p', '--no-color', '--unified=0'])
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));

  const hits = [];
  for (const line of added) {
    if (patterns.some((pattern) => pattern.test(line))) hits.push(line.slice(0, 90));
  }

  return { hits, envTracked };
}

function runNpmAudit(command) {
  const parse = (output) => {
    try {
      return JSON.parse(output).metadata.vulnerabilities;
    } catch {
      return null;
    }
  };

  try {
    return parse(
      execSync(command, {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch (error) {
    // npm audit با پیدا شدن آسیب‌پذیری کد خروج غیرصفر می‌دهد؛ خروجی‌اش همچنان JSON است.
    return typeof error?.stdout === 'string' ? parse(error.stdout) : null;
  }
}

async function main() {
  const admin = new Client('admin');
  await admin.login(ADMIN_PASSWORD);
  const supervisor = new Client('nazer');
  await supervisor.login();
  const archivist = new Client('bayegan');
  await archivist.login();

  const documents = await json(await admin.request('GET', '/documents?pageSize=50'));
  const items = documents?.items ?? [];
  const finalized = items.find((item) => item.status !== 'DRAFT');
  const draft = items.find((item) => item.status === 'DRAFT');

  // ───────────────────────────────────────────────────────────────────────
  section('۱. هر endpoint مجوز اعلام‌شده دارد');
  // مرجع این بند، آزمون واحدی است که گراف ماژول‌ها را می‌پیماید. اینجا همان آزمون
  // **اجرا** می‌شود؛ ارجاع دادن به وجود فایل، شاهد نیست.
  try {
    // از shell اجرا می‌شود چون روی ویندوز `npx` فایل .cmd است و Node اجرای مستقیم
    // .cmd را مسدود می‌کند (EINVAL). فرمان ثابت و درون‌خطی است.
    execSync('npx vitest run apps/api/src/common/auth --reporter dot', { stdio: 'pipe' });
    check('آزمون پوشش مجوز مسیرها اجرا و قبول شد', true);
  } catch (error) {
    check('آزمون پوشش مجوز مسیرها اجرا و قبول شد', false, String(error).slice(0, 200));
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۲. ناظر هیچ مسیر نوشتنی ندارد');
  const supervisorWrites = [
    ['POST', '/documents', { title: 'ناظر', type: 'NORMAL', fiscalYear: 1405, jalaliYear: 1405 }],
    ['POST', '/vendors', { name: 'ناظر' }],
    ['POST', '/buyers', { name: 'ناظر' }],
  ];
  for (const [method, path, body] of supervisorWrites) {
    const response = await supervisor.request(method, path, body);
    check(
      `ناظر ${method} ${path} را نمی‌تواند`,
      response.status === 403 || response.status === 404,
      `${response.status}`,
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۳. بایگانی هیچ مسیر تغییر مبلغ ندارد');
  if (finalized) {
    const response = await archivist.request('POST', `/documents/${finalized.id}/invoices`, {
      chapterId: '00000000-0000-0000-0000-000000000000',
      invoiceTypeId: '00000000-0000-0000-0000-000000000000',
      invoiceDate: '2026-10-01',
    });
    check(
      'بایگان نمی‌تواند فاکتور اضافه کند',
      response.status === 403 || response.status === 404,
      `${response.status}`,
    );
  } else {
    skip('بایگان نمی‌تواند فاکتور اضافه کند', 'سند ثبت‌شده‌ای یافت نشد');
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۴. دسترسی خارج از دامنه ← ۴۰۴');
  if (draft) {
    const response = await archivist.request('GET', `/documents/${draft.id}`);
    check('پیش‌نویس برای بایگان ۴۰۴ است، نه ۴۰۳', response.status === 404, `${response.status}`);
  } else {
    skip('پیش‌نویس برای بایگان ۴۰۴ است', 'پیش‌نویسی یافت نشد');
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۵. آپلود فایل با پسوند جعلی');
  // بارگذاری اسکن کار بایگان است، نه کارپردازی؛ سند هم باید در جریان بایگانی باشد.
  const archiveItems = (await json(await archivist.request('GET', '/documents?pageSize=50')))?.items ?? [];
  const archivable = archiveItems.find((item) => item.status === 'PENDING_ARCHIVE');
  if (archivable) {
    const form = new FormData();
    // محتوای HTML با نام و نوع اعلام‌شده PNG — امضای فایل باید لو بدهد.
    form.append(
      'files',
      new Blob(['<html><script>alert(1)</script></html>'], { type: 'image/png' }),
      'fake.png',
    );
    const response = await archivist.request('POST', `/documents/${archivable.id}/attachments`, form);
    const body = await json(response);
    // مسیر آپلود چندفایلی است و نتیجه هر فایل جداگانه گزارش می‌شود؛ پس شاهدِ رد شدن،
    // خالی بودن uploaded و پر بودن failed است، نه کد وضعیت پاسخ.
    check(
      'فایل HTML با نام PNG رد می‌شود',
      (body?.uploaded ?? []).length === 0 && (body?.failed ?? []).length === 1,
      `${response.status} ${JSON.stringify(body)?.slice(0, 160)}`,
    );
    check(
      'و پیام رد، دلیل را به زبان کاربر می‌گوید',
      /نوع این فایل مجاز نیست/.test(body?.failed?.[0]?.message ?? ''),
      JSON.stringify(body?.failed?.[0])?.slice(0, 160),
    );
  } else {
    skip('فایل HTML با نام PNG رد می‌شود', 'سندی در جریان بایگانی یافت نشد');
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۶. دانلود فایل سند غیرمجاز');
  // هر سه نقش به‌درستی مجوز `attachment:read` دارند (ناظر باید اسکن را برای بازبینی
  // ببیند). بنابراین دفاع این مسیر **دامنه دسترسی** است، نه مجوز: فایلی که سندش در
  // دامنه کاربر نیست باید ۴۰۴ بدهد — نه ۴۰۳ که وجودش را تأیید می‌کند و نه ۵۰۰.
  const unknownAttachment = '11111111-2222-3333-4444-555555555555';
  for (const [who, client] of [
    ['ناظر', supervisor],
    ['بایگان', archivist],
    ['کارپردازی', admin],
  ]) {
    const response = await client.request('GET', `/attachments/${unknownAttachment}/content`);
    check(`${who}: پیوست خارج از دامنه ۴۰۴ می‌گیرد`, response.status === 404, `${response.status}`);
  }

  const malformed = await supervisor.request('GET', '/attachments/not-a-uuid/content');
  check('شناسه بدشکل پیوست ۴۲۲ می‌گیرد، نه ۵۰۰', malformed.status === 422, `${malformed.status}`);

  // ───────────────────────────────────────────────────────────────────────
  section('۷. قالب گزارش با مسیر داده غیرمجاز');
  const badTemplate = await admin.request('POST', '/report-templates/check', {
    template: {
      version: 1,
      page: {
        size: 'A4',
        orientation: 'landscape',
        margins: { top: 10, bottom: 10, inlineStart: 10, inlineEnd: 10 },
      },
      styles: {
        fontFamily: 'Vazirmatn',
        baseFontSizePt: 9,
        textColor: '#000000',
        borderColor: '#999999',
      },
      header: [{ kind: 'variable', path: 'user.passwordHash' }],
      body: [],
      footer: [],
    },
  });
  const badBody = await json(badTemplate);
  check(
    'مسیر داده بیرون از فهرست مجاز رد می‌شود',
    badTemplate.status >= 400 || badBody?.ok === false || (badBody?.errors ?? []).length > 0,
    `${badTemplate.status} ${JSON.stringify(badBody)?.slice(0, 160)}`,
  );

  // ───────────────────────────────────────────────────────────────────────
  section('۸. Formula Injection در Excel');
  // فروشنده‌ای با نام خطرناک لازم است. اگر از اجرای قبلی هست، همان استفاده می‌شود:
  // ساختن یک ردیف تازه در هر اجرا، داده را بی‌دلیل بزرگ می‌کند و فرضِ آزمون‌های دیگر
  // را هم به‌هم می‌زند.
  const existing = await json(await admin.request('GET', '/vendors?search=HYPERLINK&pageSize=1'));
  const alreadyThere = (existing?.items ?? []).length > 0;
  const created = alreadyThere
    ? { ok: true, status: 200 }
    : await admin.request('POST', '/vendors', {
        personType: 'LEGAL',
        name: '=HYPERLINK("http://evil","برنده شدید")',
      });
  if (created.ok) {
    const excel = await admin.request('POST', '/analytics/vendors/export', {
      columns: ['name'],
      sort: [{ field: 'name', dir: 'desc' }],
      page: 1,
      pageSize: 50,
    });
    if (excel.ok) {
      const file = `${process.env.TEMP ?? '.'}/phase9-formula.xlsx`;
      writeFileSync(file, Buffer.from(await excel.arrayBuffer()));
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file);

      let found = null;
      workbook.worksheets[0].eachRow((row) => {
        row.eachCell((cell) => {
          const value = typeof cell.value === 'string' ? cell.value : null;
          if (value?.includes('HYPERLINK')) {
            found = { value, formula: cell.formula, type: cell.type };
          }
        });
      });
      unlinkSync(file);

      check(
        'سلول حاوی نام خطرناک پیدا شد',
        found !== null,
        'نام ساخته‌شده در خروجی نبود؛ بررسی بی‌معنا می‌شود',
      );
      check(
        'و به فرمول تبدیل نشده است',
        found !== null && found.formula === undefined,
        JSON.stringify(found)?.slice(0, 160),
      );
      check(
        'و مقدارش با = شروع نمی‌شود',
        found !== null && !found.value.startsWith('='),
        JSON.stringify(found?.value)?.slice(0, 120),
      );
    } else {
      skip('خروجی Excel فروشندگان', `پاسخ ${excel.status}`);
    }
  } else {
    skip('ساخت فروشنده با نام خطرناک', `پاسخ ${created.status}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۹. CSRF روی متدهای غیرامن');
  const noCsrf = await admin.request('POST', '/vendors', { name: 'بدون CSRF' }, { withoutCsrf: true });
  check('نوشتن بدون هدر CSRF رد می‌شود', noCsrf.status === 403, `${noCsrf.status}`);

  const mismatched = new Client('admin');
  await mismatched.login(ADMIN_PASSWORD);
  mismatched.cookies.set('dm_csrf', 'not-the-right-token');
  const wrongCsrf = await mismatched.request('POST', '/vendors', { name: 'CSRF اشتباه' });
  check('هدر CSRF ناهمخوان با کوکی رد می‌شود', wrongCsrf.status === 403, `${wrongCsrf.status}`);

  // ───────────────────────────────────────────────────────────────────────
  section('۱۰. هدرهای امنیتی در پاسخ واقعی');
  const headerResponse = await fetch(`${PROD_BASE ?? BASE}/health`);
  const required = [
    ['content-security-policy', /default-src 'self'/],
    ['x-content-type-options', /nosniff/],
    ['referrer-policy', /same-origin/],
    ['x-frame-options', /SAMEORIGIN|DENY/],
    ['strict-transport-security', /max-age=\d+/],
  ];
  for (const [header, pattern] of required) {
    const value = headerResponse.headers.get(header);
    check(`هدر ${header}`, value !== null && pattern.test(value), String(value).slice(0, 90));
  }
  check(
    'هدر X-Powered-By فرستاده نمی‌شود',
    headerResponse.headers.get('x-powered-by') === null,
    headerResponse.headers.get('x-powered-by') ?? '',
  );

  if (PROD_BASE) {
    const docs = await fetch(`${PROD_BASE.replace(/\/v1$/, '')}/docs`);
    check('مستندات Swagger در production باز نیست', [401, 403, 404].includes(docs.status), `${docs.status}`);
    const queryCount = headerResponse.headers.get('x-query-count');
    check('شمارنده کوئری در production فرستاده نمی‌شود', queryCount === null, queryCount ?? '');
  } else {
    skip('مستندات Swagger در production باز نیست', 'PROD_BASE تنظیم نشده است');
    skip('شمارنده کوئری در production فرستاده نمی‌شود', 'PROD_BASE تنظیم نشده است');
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۱۱. هیچ secret در مخزن');
  const scan = scanGitHistoryForSecrets();
  check('اسکن تاریخچه git چیزی پیدا نکرد', scan.hits.length === 0, scan.hits.slice(0, 3).join(' | '));
  check('فایل .env هرگز commit نشده است', scan.envTracked.length === 0, scan.envTracked.join(', '));

  const envExample = readFileSync('.env.example', 'utf8');
  const filled = ['SESSION_SECRET', 'POSTGRES_PASSWORD', 'S3_SECRET_KEY', 'MINIO_ROOT_PASSWORD'].filter(
    (key) => new RegExp(`^${key}=.+$`, 'm').test(envExample),
  );
  check('.env.example هیچ مقدار واقعی ندارد', filled.length === 0, filled.join(', '));

  // ───────────────────────────────────────────────────────────────────────
  section('۱۲. npm audit بدون آسیب‌پذیری بالا/بحرانی');
  for (const [label, command] of [
    ['production', 'npm audit --omit=dev --json'],
    ['کل درخت (شامل ابزار توسعه)', 'npm audit --json'],
  ]) {
    const report = runNpmAudit(command);
    check(
      `${label}: بدون high و critical`,
      report !== null && report.high === 0 && report.critical === 0,
      report === null ? 'اجرای audit ناموفق بود' : JSON.stringify(report),
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۱۳. خطاها بدون stack trace و داده حساس');
  const notFound = await admin.request('GET', '/documents/00000000-0000-0000-0000-000000000000');
  const notFoundBody = await notFound.text();
  check(
    'پاسخ ۴۰۴ شامل stack trace نیست',
    !new RegExp('\\bat\\s+\\S+\\s*\\(.*:\\d+:\\d+\\)').test(notFoundBody),
    notFoundBody.slice(0, 120),
  );
  check(
    'پاسخ خطا مسیر فایل سرور را لو نمی‌دهد',
    !/[A-Za-z]:\\\\|\/app\/|node_modules/.test(notFoundBody),
    notFoundBody.slice(0, 120),
  );

  const badId = await admin.request('GET', '/documents/not-a-uuid');
  const badIdBody = await badId.text();
  check('شناسه نامعتبر ۴۲۲ می‌گیرد، نه ۵۰۰', badId.status === 422, `${badId.status}`);
  check(
    'و پیامش جزئیات پایگاه داده را نشان نمی‌دهد',
    !/prisma|postgres|invalid input syntax/i.test(badIdBody),
    badIdBody.slice(0, 120),
  );

  const anonymous = new Client('admin');
  const wrongPassword = await anonymous.request('POST', '/auth/login', {
    username: 'admin',
    password: 'wrong-on-purpose',
  });
  const wrongBody = await wrongPassword.text();
  check(
    'پیام رمز اشتباه، وجود یا نبود کاربر را فاش نمی‌کند',
    !/یافت نشد|not found/i.test(wrongBody),
    wrongBody.slice(0, 120),
  );

  // ───────────────────────────────────────────────────────────────────────
  section('۱۴. نشست پس از خروج باطل است');
  const temporary = new Client('admin');
  await temporary.login(ADMIN_PASSWORD);
  const stolenCookie = temporary.header();
  const beforeLogout = await temporary.request('GET', '/auth/me');
  check('پیش از خروج، نشست معتبر است', beforeLogout.status === 200, `${beforeLogout.status}`);

  await temporary.request('POST', '/auth/logout');
  const replay = await fetch(`${BASE}/auth/me`, { headers: { cookie: stolenCookie } });
  check('همان کوکی پس از خروج ۴۰۱ می‌گیرد', replay.status === 401, `${replay.status}`);

  // ───────────────────────────────────────────────────────────────────────
  section('۱۵. مبالغ بزرگ‌تر از ۲^۵۳');
  // دلیل وجود قاعده «ریال صحیح به‌صورت رشته»: در Number این دو عدد یکی می‌شوند.
  const limit = 9_007_199_254_740_992n; // ۲^۵۳
  check(
    'دو ریال متفاوت در Number یکی می‌شوند (دلیل قاعده رشته‌بودن)',
    Number(limit) === Number(limit + 1n),
    `${Number(limit)} و ${Number(limit + 1n)}`,
  );

  if (finalized) {
    const detail = await admin.request('GET', `/documents/${finalized.id}`);
    const raw = await detail.text();
    const numericFields = [...raw.matchAll(/"(total[A-Za-z]*|amount|grossAmount|netAmount|taxAmount)":\s*([^,}]+)/g)];
    const unquoted = numericFields.filter(([, , value]) => !value.trim().startsWith('"'));
    check(
      'مبالغ سند به‌صورت رشته منتقل می‌شوند، نه number',
      numericFields.length > 0 && unquoted.length === 0,
      `${numericFields.length} میدان، ${unquoted.length} بدون کوتیشن: ${unquoted.slice(0, 3).map((m) => m[0]).join(' | ')}`,
    );
  } else {
    skip('مبالغ سند به‌صورت رشته منتقل می‌شوند', 'سند ثبت‌شده‌ای یافت نشد');
  }

  // ───────────────────────────────────────────────────────────────────────
  section('۱۶. خروجی گزارش خودبسنده است (ریسک R3)');
  if (finalized) {
    const types = await json(await admin.request('GET', '/reports/types'));
    const typeKey = (Array.isArray(types) ? types : (types?.items ?? []))[0]?.key;
    if (typeKey) {
      const response = await admin.request(
        'POST',
        `/reports/${typeKey}/documents/${finalized.id}/html`,
        {},
      );
      const html = await response.text();
      check(
        'قلم فارسی به‌صورت data URI درون خروجی است',
        html.includes('@font-face') && html.includes('data:font/woff2;base64,'),
        `${response.status}`,
      );
      check(
        'و هیچ منبع خارجی http در خروجی نیست',
        !/(src|href)\s*=\s*["']https?:/i.test(html) && !/url\(\s*["']?https?:/i.test(html),
      );
    } else {
      skip('قلم فارسی درون خروجی است', 'نوع گزارشی یافت نشد');
    }
  } else {
    skip('قلم فارسی درون خروجی است', 'سند ثبت‌شده‌ای یافت نشد');
  }
}

main()
  .then(() => {
    console.log(lines.join('\n'));
    console.log(`\nموفق: ${pass}   ناموفق: ${fail}   رد‌شده: ${skipped}`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.log(lines.join('\n'));
    console.error('\nآزمون متوقف شد:', error);
    process.exit(1);
  });
