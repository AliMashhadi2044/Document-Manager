/**
 * آزمون زنده فاز ۵ — بایگانی، فایل امن، بازخورد ناظر، اعلان.
 *
 * این اسکریپت جای تست واحد را نمی‌گیرد؛ چیزی را می‌سنجد که تست واحد نمی‌تواند:
 * رفتار **سرویس در حال اجرا** روی HTTP واقعی — کوکی نشست، هدر CSRF، آپلود
 * multipart، هدرهای پاسخ دانلود، قیدهای دیتابیس و اعلان‌ها.
 *
 * پیش‌نیاز اجرا:
 *  ۱. سرویس روی `API_BASE` بالا باشد (پیش‌فرض `http://localhost:3100/api/v1`).
 *  ۲. داده مرجع ثبت شده باشد: `npm run db:seed -w @dm/api`.
 *  ۳. کاربران آزمون نقش‌ها ساخته شده باشند: `npm run db:seed:dev-users -w @dm/api`.
 *  ۴. دو سند آزمون در یک سال مالی وجود داشته باشند و شناسه‌شان در `VERIFY_DOC_A` و
 *     `VERIFY_DOC_B` داده شود (پیش‌فرض‌ها شناسه‌های پایگاه داده توسعه‌اند).
 *
 * قابل اجرای چندباره است: ابتدا هر دو سند را به وضعیت FINALIZED برمی‌گرداند و محتوای
 * فایل آپلودی در هر اجرا یکتاست تا تشخیص فایل تکراری سر راه نیفتد.
 *
 * اجرا: `npm run verify:phase5`
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3100/api/v1';
const DOC_A = process.env.VERIFY_DOC_A ?? '0fcfbaf0-dbb1-4a1d-b9e9-41a4c09a1ced';
const DOC_B = process.env.VERIFY_DOC_B ?? '79eb2715-f19d-47c5-901c-244bcd5f88bc';
/** یک سند پیش‌نویس، برای آزمون «خارج از دامنه دسترسی، ۴۰۴ می‌گیرد نه ۴۰۳». */
const DOC_DRAFT = process.env.VERIFY_DOC_DRAFT ?? 'e76a17ca-3bd0-400e-9675-4803e20ec2e0';
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
  async request(method, path, { body, headers = {}, idempotent = false, noCsrf = false } = {}) {
    const all = { Cookie: this.cookieHeader(), ...headers };
    if (!noCsrf && this.cookies.has('dm_csrf')) all['x-csrf-token'] = this.cookies.get('dm_csrf');
    if (idempotent) all['idempotency-key'] = crypto.randomUUID();
    let payload;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      all['content-type'] = 'application/json';
    }
    const response = await fetch(`${BASE}${path}`, { method, headers: all, body: payload });
    this.absorb(response);
    const type = response.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await response.json().catch(() => null) : null;
    return { status: response.status, data, response };
  }
  async login(password = DEV_PASSWORD) {
    const result = await this.request('POST', '/auth/login', {
      body: { username: this.username, password },
    });
    if (result.status !== 200) {
      throw new Error(`ورود ${this.username} ناموفق: ${result.status} ${JSON.stringify(result.data)}`);
    }
    return result;
  }
}

const bytes = (...values) => new Uint8Array(values);
const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};
const text = (value) => new TextEncoder().encode(value);
const cut = (value, length = 250) => JSON.stringify(value)?.slice(0, length);

const stamp = Date.now();
const PDF = concat(text(`%PDF-1.4\n% اجرای ${stamp}\n1 0 obj<</Type/Catalog>>endobj\n`), text('%%EOF\n'));
const PNG = concat(
  bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  text(`IHDR signature probe ${stamp}`),
);
const HTML = text('<html><script>alert(1)</script></html>');

function filePart(name, data, mime) {
  const form = new FormData();
  form.append('files', new Blob([data], { type: mime }), name);
  return form;
}

/**
 * ساخت یک سند **تازه** و ارجاعش به بایگانی، بدون شماره سند و بدون فایل.
 *
 * چرا هر بار از نو: آزمون «نهایی کردن بایگانی بدون پیش‌نیاز» به سندی نیاز دارد که
 * قطعاً شماره و فایل **ندارد**. تکیه بر یک سند موجود، اولین باری که کسی (یا همین
 * اسکریپت) شماره‌اش را ثبت کند، تست را بی‌صدا بی‌معنا می‌کند — که دقیقاً یک‌بار
 * اتفاق افتاد.
 */
async function createBareDocument(client) {
  const [buyers, categories, bootstrap] = await Promise.all([
    client.request('GET', '/buyers?pageSize=50'),
    client.request('GET', '/base-data/chapters/categories'),
    client.request('GET', '/base-data/bootstrap'),
  ]);

  const buyerId = buyers.data?.items?.[0]?.id;
  if (!buyerId) throw new Error('هیچ مجموعه خریداری ثبت نشده است');

  const paymentMethodId = (bootstrap.data?.paymentMethods ?? []).find(
    (method) => method.kind === 'PETTY_CASH',
  )?.id;
  if (!paymentMethodId) throw new Error('روش پرداخت تنخواه ثبت نشده است');

  let chapter = null;
  for (const category of categories.data ?? []) {
    for (const candidate of category.chapters ?? []) {
      const link = (candidate.invoiceTypes ?? []).find(
        (item) => item.invoiceType?.kind === 'NORMAL',
      );
      if (link) {
        chapter = { id: candidate.id, invoiceTypeId: link.invoiceType.id };
        break;
      }
    }
    if (chapter) break;
  }
  if (!chapter) throw new Error('فصلی با نوع فاکتور عادی پیدا نشد');

  const created = await client.request('POST', '/documents', {
    body: {
      title: `سند آزمون بایگانی ${stamp}`,
      type: 'NORMAL',
      fiscalYear: 1405,
      jalaliYear: 1405,
      buyerEntityId: buyerId,
      stad: null,
    },
  });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`ساخت سند آزمون ناموفق: ${created.status} ${cut(created.data, 400)}`);
  }
  const documentId = created.data.id;

  const invoice = await client.request('POST', `/documents/${documentId}/invoices`, {
    body: {
      chapterId: chapter.id,
      invoiceTypeId: chapter.invoiceTypeId,
      vendorId: null,
      invoiceNumber: 'ARCH-1',
      invoiceDate: '2026-10-06',
      notes: null,
      payment: { paymentMethodId },
      details: {
        kind: 'NORMAL',
        taxMode: 'PERCENT',
        taxRateBp: 1000,
        taxAmount: null,
        items: [
          {
            rowNo: 1,
            description: 'ردیف آزمون بایگانی',
            productCode: null,
            quantity: '1',
            unitId: null,
            unitPrice: '1000000',
            discountAmount: '0',
            taxMode: 'PERCENT',
            taxRateBp: 1000,
            taxAmount: null,
          },
        ],
      },
    },
  });
  if (invoice.status !== 201 && invoice.status !== 200) {
    throw new Error(`ثبت فاکتور آزمون ناموفق: ${invoice.status} ${cut(invoice.data, 400)}`);
  }

  await client.request('POST', `/documents/${documentId}/finalize`, { idempotent: true });
  await client.request('POST', `/documents/${documentId}/send-to-archive`, { idempotent: true });

  return documentId;
}

/**
 * بستن بازخوردهای بازِ یک سند.
 *
 * بازخورد باز از اجرای قبلی (یا از آزمون دستی در مرورگر) دروازه نهایی شدن بایگانی را
 * می‌بندد و اجرای بعدی را می‌شکند.
 */
async function resolveOpenFeedback(client, documentId) {
  const list = await client.request('GET', `/feedbacks?documentId=${documentId}&pageSize=100`);
  for (const feedback of list.data?.items ?? []) {
    if (feedback.status === 'OPEN' || feedback.status === 'ANSWERED') {
      await client.request('PATCH', `/feedbacks/${feedback.id}/status`, {
        body: { status: 'RESOLVED', note: 'پاک‌سازی پیش از اجرای آزمون' },
      });
    }
  }
}

/** سند را — از هر وضعیتی — به FINALIZED برمی‌گرداند تا اجرای چندباره ممکن باشد. */
async function prepare(client, documentId) {
  for (let step = 0; step < 4; step += 1) {
    const current = await client.request('GET', `/documents/${documentId}`);
    const status = current.data?.status;
    if (status === 'FINALIZED') return status;
    if (status === undefined) throw new Error(`سند ${documentId} خوانده نشد: ${cut(current.data)}`);

    if (status === 'ARCHIVED' || status === 'PENDING_ARCHIVE') {
      const reopen = await client.request('POST', `/documents/${documentId}/reopen`, {
        idempotent: true,
        body: { reason: 'آماده‌سازی آزمون زنده فاز ۵' },
      });
      if (reopen.status !== 200) throw new Error(`بازگشایی ناموفق: ${reopen.status} ${cut(reopen.data)}`);
      continue;
    }

    const finalize = await client.request('POST', `/documents/${documentId}/finalize`, {
      idempotent: true,
    });
    if (finalize.status !== 200) {
      throw new Error(`ثبت نهایی ناموفق: ${finalize.status} ${cut(finalize.data, 400)}`);
    }
  }
  throw new Error(`سند ${documentId} به FINALIZED نرسید`);
}

async function main() {
  const admin = new Client('admin'); // سازنده اسناد آزمون — گیرنده اعلان‌ها
  const karpardaz = new Client('karpardaz'); // PROCUREMENT
  const bayegan = new Client('bayegan'); // ARCHIVIST
  const nazer = new Client('nazer'); // SUPERVISOR

  await admin.login(ADMIN_PASSWORD);
  await karpardaz.login();
  await bayegan.login();
  await nazer.login();

  await resolveOpenFeedback(karpardaz, DOC_A);
  await prepare(karpardaz, DOC_A);
  await prepare(karpardaz, DOC_B);

  // سند سوم، تازه و خالی: برای آزمون «نهایی کردن بایگانی بدون پیش‌نیاز».
  const bareDocumentId = await createBareDocument(karpardaz);
  results.push('— ورود چهار کاربر و آماده‌سازی سه سند انجام شد —');

  // ── ۱) CSRF
  const noCsrf = await karpardaz.request('POST', `/documents/${DOC_A}/send-to-archive`, {
    idempotent: true,
    noCsrf: true,
  });
  check('POST بدون هدر CSRF رد می‌شود (۴۰۳)', noCsrf.status === 403, `${noCsrf.status} ${cut(noCsrf.data)}`);

  // ── ۲) ارجاع به بایگانی
  const send = await karpardaz.request('POST', `/documents/${DOC_A}/send-to-archive`, {
    idempotent: true,
  });
  check(
    'کارپردازی سند را به بایگانی ارجاع می‌دهد',
    send.status === 200 && send.data?.status === 'PENDING_ARCHIVE',
    `${send.status} ${cut(send.data)}`,
  );

  // ── ۳) تفکیک وظایف: کارپردازی شماره سند ثبت نمی‌کند
  const forbiddenInfo = await karpardaz.request('PUT', `/archive/documents/${DOC_A}/info`, {
    body: { documentNumber: 'KP-1', documentDate: '2026-10-16', notes: null },
  });
  check('کارپردازی مجوز ثبت شماره سند ندارد (۴۰۳)', forbiddenInfo.status === 403, `${forbiddenInfo.status}`);

  // ── ۴) بایگان شماره و تاریخ را ثبت می‌کند
  const number = `ARC-${stamp % 1000000}`;
  const saveInfo = await bayegan.request('PUT', `/archive/documents/${DOC_A}/info`, {
    body: { documentNumber: number, documentDate: '2026-10-16', notes: 'آزمون زنده فاز ۵' },
  });
  check(
    'بایگان شماره و تاریخ سند را ثبت می‌کند',
    saveInfo.status === 200 && saveInfo.data?.documentNumber === number,
    `${saveInfo.status} ${cut(saveInfo.data)}`,
  );

  // ── ۵) تفکیک وظایف: بایگان مبلغ و فاکتور را لمس نمی‌کند
  const archivistUpdate = await bayegan.request('PATCH', `/documents/${DOC_A}`, {
    body: { title: 'تغییر غیرمجاز' },
  });
  check('بایگان مجوز تغییر سند را ندارد (۴۰۳)', archivistUpdate.status === 403, `${archivistUpdate.status}`);
  const archivistInvoice = await bayegan.request('POST', `/documents/${DOC_A}/invoices`, { body: {} });
  check('بایگان مجوز افزودن فاکتور را ندارد (۴۰۳)', archivistInvoice.status === 403, `${archivistInvoice.status}`);

  // ── ۶) ناظر فقط می‌خواند
  const supervisorInvoice = await nazer.request('POST', `/documents/${DOC_A}/invoices`, { body: {} });
  check('ناظر مجوز افزودن فاکتور را ندارد (۴۰۳)', supervisorInvoice.status === 403, `${supervisorInvoice.status}`);
  const supervisorArchive = await nazer.request('PUT', `/archive/documents/${DOC_A}/info`, {
    body: { documentNumber: 'NZ-1', documentDate: '2026-10-16', notes: null },
  });
  check('ناظر مجوز ثبت شماره سند ندارد (۴۰۳)', supervisorArchive.status === 403, `${supervisorArchive.status}`);

  // ── ۷) آپلود فایل سالم
  const persianName = 'اسکن سند.pdf';
  const goodPdf = await bayegan.request('POST', `/documents/${DOC_A}/attachments`, {
    body: filePart(persianName, PDF, 'application/pdf'),
  });
  const attachmentId = goodPdf.data?.uploaded?.[0]?.id;
  check(
    'آپلود PDF سالم پذیرفته می‌شود',
    goodPdf.data?.uploaded?.length === 1 && goodPdf.data?.failed?.length === 0,
    `${goodPdf.status} ${cut(goodPdf.data, 400)}`,
  );
  // نام فارسی در multipart به latin1 می‌رسد؛ اگر رمزگشایی برگردد، همین‌جا پیدا می‌شود.
  check(
    'نام فارسی فایل سالم ذخیره می‌شود',
    goodPdf.data?.uploaded?.[0]?.originalFilename === persianName,
    JSON.stringify(goodPdf.data?.uploaded?.[0]?.originalFilename),
  );

  // ── ۸) پسوند جعلی: محتوای PNG با نام .pdf
  const fakeExt = await bayegan.request('POST', `/documents/${DOC_A}/attachments`, {
    body: filePart('fake.pdf', PNG, 'application/pdf'),
  });
  check(
    'PNG با پسوند .pdf رد می‌شود',
    fakeExt.data?.uploaded?.length === 0 && (fakeExt.data?.failed?.[0]?.message ?? '').includes('پسوند'),
    `${fakeExt.status} ${cut(fakeExt.data, 400)}`,
  );

  // ── ۹) HTML با پسوند .pdf
  const fakeHtml = await bayegan.request('POST', `/documents/${DOC_A}/attachments`, {
    body: filePart('payload.pdf', HTML, 'application/pdf'),
  });
  check(
    'HTML با پسوند .pdf رد می‌شود',
    fakeHtml.data?.uploaded?.length === 0 &&
      (fakeHtml.data?.failed?.[0]?.message ?? '').includes('مجاز نیست'),
    cut(fakeHtml.data, 400),
  );

  // ── ۱۰) MIME اعلامی ناسازگار با محتوا
  const mimeMismatch = await bayegan.request('POST', `/documents/${DOC_A}/attachments`, {
    body: filePart('image.png', PNG, 'application/pdf'),
  });
  check(
    'MIME اعلامی ناسازگار رد می‌شود',
    mimeMismatch.data?.uploaded?.length === 0 &&
      (mimeMismatch.data?.failed?.[0]?.message ?? '').includes('اعلامی'),
    cut(mimeMismatch.data, 400),
  );

  // ── ۱۱) فایل خالی
  const empty = await bayegan.request('POST', `/documents/${DOC_A}/attachments`, {
    body: filePart('empty.pdf', new Uint8Array(0), 'application/pdf'),
  });
  check('فایل خالی رد می‌شود', (empty.data?.uploaded?.length ?? 1) === 0, cut(empty.data, 300));

  // ── ۱۲) فایل تکراری با همان محتوا
  const duplicateFile = await bayegan.request('POST', `/documents/${DOC_A}/attachments`, {
    body: filePart('اسکن سند — کپی.pdf', PDF, 'application/pdf'),
  });
  check(
    'فایل با محتوای تکراری تشخیص داده می‌شود',
    (duplicateFile.data?.uploaded?.length ?? 1) === 0,
    cut(duplicateFile.data, 300),
  );

  // ── ۱۳) هدرهای دانلود و دسترسی
  if (attachmentId) {
    const download = await karpardaz.request('GET', `/attachments/${attachmentId}/content`);
    const headers = download.response.headers;
    check('کارپردازی فایل را دانلود می‌کند (مجوز خواندن)', download.status === 200, `${download.status}`);
    check(
      'Content-Type از نوع تشخیص‌داده‌شده سرور است',
      headers.get('content-type') === 'application/pdf',
      headers.get('content-type'),
    );
    check('هدر nosniff فرستاده می‌شود', headers.get('x-content-type-options') === 'nosniff', headers.get('x-content-type-options'));
    check('پاسخ قابل کش نیست', (headers.get('cache-control') ?? '').includes('no-store'), headers.get('cache-control'));
    const disposition = headers.get('content-disposition') ?? '';
    check('نام فایل به RFC 5987 کدگذاری شده', disposition.includes("filename*=UTF-8''"), disposition);
    check(
      'نام فارسی در هدر دانلود درست رمزگشایی می‌شود',
      decodeURIComponent(disposition.split("UTF-8''")[1] ?? '') === persianName,
      disposition,
    );

    const uploadForbidden = await karpardaz.request('POST', `/documents/${DOC_A}/attachments`, {
      body: filePart('x.pdf', PDF, 'application/pdf'),
    });
    check('کارپردازی مجوز آپلود ندارد (۴۰۳)', uploadForbidden.status === 403, `${uploadForbidden.status}`);
    const deleteForbidden = await karpardaz.request('DELETE', `/attachments/${attachmentId}`);
    check('کارپردازی مجوز حذف فایل ندارد (۴۰۳)', deleteForbidden.status === 403, `${deleteForbidden.status}`);

    const anonymous = await fetch(`${BASE}/attachments/${attachmentId}/content`);
    check('دانلود بدون ورود رد می‌شود (۴۰۱)', anonymous.status === 401, `${anonymous.status}`);

    const missing = await bayegan.request('GET', `/attachments/${crypto.randomUUID()}/content`);
    check('فایل ناموجود ۴۰۴ می‌دهد', missing.status === 404, `${missing.status}`);

    const history = await bayegan.request('GET', `/attachments/${attachmentId}/history`);
    const historyItems = Array.isArray(history.data) ? history.data : history.data?.items;
    check(
      'تاریخچه فایل ثبت شده است',
      history.status === 200 && (historyItems?.length ?? 0) > 0,
      `${history.status} ${cut(history.data, 300)}`,
    );
  }

  // ── ۱۴) شماره سند تکراری
  const sendB = await karpardaz.request('POST', `/documents/${DOC_B}/send-to-archive`, { idempotent: true });
  const duplicate = await bayegan.request('PUT', `/archive/documents/${DOC_B}/info`, {
    body: { documentNumber: number, documentDate: '2026-10-16', notes: null },
  });
  check(
    'شماره سند تکراری در همان سال مالی رد می‌شود (۴۰۹)',
    duplicate.status === 409 && duplicate.data?.code === 'DOCUMENT_NUMBER_DUPLICATE',
    `send=${sendB.status} dup=${duplicate.status} ${cut(duplicate.data, 300)}`,
  );

  // ── ۱۵) نهایی کردن بایگانی سند B: همه پیش‌نیازهای کم با هم
  const notReady = await bayegan.request('POST', `/archive/documents/${bareDocumentId}/complete`, {
    idempotent: true,
  });
  const paths = (notReady.data?.details ?? []).map((item) => item.path);
  check('نهایی کردن بایگانی بدون پیش‌نیاز ۴۲۲ می‌دهد', notReady.status === 422, `${notReady.status} ${cut(notReady.data, 300)}`);
  check(
    'همه پیش‌نیازهای کم با هم گزارش می‌شوند',
    paths.includes('documentNumber') && paths.includes('attachments'),
    cut(notReady.data, 400),
  );

  // ── ۱۶) چرخه بازخورد ناظر
  const feedback = await nazer.request('POST', `/documents/${DOC_A}/feedbacks`, {
    body: {
      targetKind: 'DOCUMENT',
      invoiceId: null,
      invoiceItemId: null,
      sectionKey: null,
      body: 'مبلغ ردیف دوم با فاکتور نمی‌خواند',
    },
  });
  const feedbackId = feedback.data?.id;
  check(
    'ناظر بازخورد ثبت می‌کند',
    (feedback.status === 200 || feedback.status === 201) && Boolean(feedbackId),
    `${feedback.status} ${cut(feedback.data, 300)}`,
  );

  const procurementFeedback = await karpardaz.request('POST', `/documents/${DOC_A}/feedbacks`, {
    body: {
      targetKind: 'DOCUMENT',
      invoiceId: null,
      invoiceItemId: null,
      sectionKey: null,
      body: 'تلاش غیرمجاز',
    },
  });
  check('کارپردازی بازخورد ثبت نمی‌کند (۴۰۳)', procurementFeedback.status === 403, `${procurementFeedback.status}`);

  if (feedbackId) {
    const blocked = await bayegan.request('POST', `/archive/documents/${DOC_A}/complete`, {
      idempotent: true,
    });
    const blockedPaths = (blocked.data?.details ?? []).map((item) => item.path);
    check(
      'بازخورد رسیدگی‌نشده نهایی شدن بایگانی را می‌بندد',
      blocked.status === 422 && blockedPaths.includes('feedbacks'),
      `${blocked.status} ${cut(blocked.data, 300)}`,
    );

    const nazerReply = await nazer.request('POST', `/feedbacks/${feedbackId}/replies`, {
      body: { body: 'پاسخ خودم' },
    });
    check('ناظر به بازخورد خودش پاسخ نمی‌دهد (۴۰۳)', nazerReply.status === 403, `${nazerReply.status}`);

    const reply = await karpardaz.request('POST', `/feedbacks/${feedbackId}/replies`, {
      body: { body: 'اصلاح شد؛ فاکتور پیوست به‌روز است' },
    });
    check('کارپردازی پاسخ می‌دهد', reply.status === 200 || reply.status === 201, `${reply.status} ${cut(reply.data, 300)}`);

    const afterReply = await nazer.request('GET', `/feedbacks/${feedbackId}`);
    check('وضعیت بازخورد پس از پاسخ ANSWERED است', afterReply.data?.status === 'ANSWERED', cut(afterReply.data, 300));

    // تفکیک وظایف در خود گذارها: ناظر نمی‌بندد، کارپردازی بازگشایی نمی‌کند.
    const supervisorResolve = await nazer.request('PATCH', `/feedbacks/${feedbackId}/status`, {
      body: { status: 'RESOLVED', note: null },
    });
    check('ناظر خودش رسیدگی را تأیید نمی‌کند (۴۰۳)', supervisorResolve.status === 403, `${supervisorResolve.status} ${cut(supervisorResolve.data, 200)}`);

    const resolve = await karpardaz.request('PATCH', `/feedbacks/${feedbackId}/status`, {
      body: { status: 'RESOLVED', note: 'اصلاح انجام شد' },
    });
    check(
      'کارپردازی رسیدگی را تأیید می‌کند',
      resolve.status === 200 && resolve.data?.status === 'RESOLVED',
      `${resolve.status} ${cut(resolve.data, 300)}`,
    );

    const procurementReopen = await karpardaz.request('PATCH', `/feedbacks/${feedbackId}/status`, {
      body: { status: 'OPEN', note: null },
    });
    check('کارپردازی بازخورد بسته‌شده را بازگشایی نمی‌کند (۴۰۳)', procurementReopen.status === 403, `${procurementReopen.status}`);

    const reopen = await nazer.request('PATCH', `/feedbacks/${feedbackId}/status`, {
      body: { status: 'OPEN', note: 'پاسخ قانع‌کننده نبود' },
    });
    check(
      'ناظر بازخورد بسته‌شده را بازگشایی می‌کند',
      reopen.status === 200 && reopen.data?.status === 'OPEN',
      `${reopen.status} ${cut(reopen.data, 300)}`,
    );

    const blockedAgain = await bayegan.request('POST', `/archive/documents/${DOC_A}/complete`, {
      idempotent: true,
    });
    check(
      'بازگشایی ناظر دروازه بایگانی را دوباره می‌بندد',
      blockedAgain.status === 422 &&
        (blockedAgain.data?.details ?? []).some((item) => item.path === 'feedbacks'),
      `${blockedAgain.status} ${cut(blockedAgain.data, 300)}`,
    );

    const resolveAgain = await karpardaz.request('PATCH', `/feedbacks/${feedbackId}/status`, {
      body: { status: 'RESOLVED', note: 'مستند پیوست اصلاح شد' },
    });
    check('رسیدگی دوباره ثبت می‌شود', resolveAgain.status === 200, `${resolveAgain.status} ${cut(resolveAgain.data, 200)}`);

    const detail = await nazer.request('GET', `/feedbacks/${feedbackId}`);
    const historyLength = detail.data?.statusHistory?.length ?? 0;
    check(
      'تاریخچه وضعیت همه گذارها را نگه داشته است',
      historyLength >= 3,
      `تعداد ردیف تاریخچه: ${historyLength} — ${cut(detail.data?.statusHistory, 300)}`,
    );

    const removeFeedback = await nazer.request('DELETE', `/feedbacks/${feedbackId}`);
    check('مسیر حذف بازخورد وجود ندارد', removeFeedback.status === 404, `${removeFeedback.status}`);
  }

  // ── ۱۷) نهایی کردن بایگانی سند A
  const complete = await bayegan.request('POST', `/archive/documents/${DOC_A}/complete`, {
    idempotent: true,
  });
  check(
    'بایگانی سند با همه پیش‌نیازها نهایی می‌شود',
    complete.status === 200 && complete.data?.status === 'ARCHIVED',
    `${complete.status} ${cut(complete.data, 300)}`,
  );

  // ── ۱۸) پس از نهایی شدن، ثبت شماره بسته است
  const afterArchive = await bayegan.request('PUT', `/archive/documents/${DOC_A}/info`, {
    body: { documentNumber: `${number}-X`, documentDate: '2026-10-16', notes: null },
  });
  check('پس از نهایی شدن بایگانی، اصلاح شماره بسته است (۴۰۹)', afterArchive.status === 409, `${afterArchive.status} ${cut(afterArchive.data, 200)}`);

  // ── ۱۹) اعلان‌ها — گیرنده، سازنده سند است
  const notifications = await admin.request('GET', '/notifications');
  const items = notifications.data?.items ?? [];
  const kinds = items.map((item) => item.kind);
  check('اعلان برای سازنده سند ساخته شده است', notifications.status === 200 && kinds.length > 0, `${notifications.status} ${cut(notifications.data, 300)}`);
  check(
    'اعلان بازخورد و بایگانی هر دو رسیده‌اند',
    kinds.includes('FEEDBACK_CREATED') && kinds.includes('DOCUMENT_ARCHIVED'),
    JSON.stringify(kinds.slice(0, 10)),
  );

  const unread = await admin.request('GET', '/notifications/unread-count');
  const unreadBefore = unread.data?.unread ?? unread.data?.count;
  const firstNotification = items.find((item) => item.readAt === null)?.id ?? items[0]?.id;
  if (firstNotification) {
    const markRead = await admin.request('POST', `/notifications/${firstNotification}/read`);
    const unreadAfter = await admin.request('GET', '/notifications/unread-count');
    const after = unreadAfter.data?.unread ?? unreadAfter.data?.count;
    check(
      'خواندن اعلان شمارنده را کم می‌کند',
      (markRead.status === 200 || markRead.status === 204) && after < unreadBefore,
      `${cut(unread.data)} → ${cut(unreadAfter.data)} markRead=${markRead.status}`,
    );
  }

  // ── ۲۰) کارتابل بایگانی و دامنه دسترسی
  const inbox = await bayegan.request('GET', '/archive/inbox?page=1&pageSize=20');
  check(
    'کارتابل بایگانی اسناد در جریان را برمی‌گرداند',
    inbox.status === 200 && (inbox.data?.items?.length ?? 0) > 0,
    `${inbox.status} ${cut(inbox.data, 250)}`,
  );
  const draftVisible = (inbox.data?.items ?? []).some((item) => item.status === 'DRAFT');
  check('پیش‌نویس در کارتابل بایگانی دیده نمی‌شود', !draftVisible, 'یک سند DRAFT در کارتابل بود');

  const supervisorDocuments = await nazer.request('GET', '/documents?page=1&pageSize=50');
  const supervisorSeesDraft = (supervisorDocuments.data?.items ?? []).some(
    (item) => item.status === 'DRAFT',
  );
  check('ناظر پیش‌نویس را نمی‌بیند', !supervisorSeesDraft, 'ناظر یک سند DRAFT دید');

  const archivistDraft = await bayegan.request('GET', `/documents/${DOC_DRAFT}`);
  check('سند پیش‌نویس برای بایگان ۴۰۴ است، نه ۴۰۳', archivistDraft.status === 404, `${archivistDraft.status}`);

  console.log(results.join('\n'));
  console.log(`\nنتیجه: ${pass} قبول، ${fail} رد`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error('خطای غیرمنتظره:', error);
  process.exitCode = 2;
});
