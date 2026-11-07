import { describe, expect, it } from 'vitest';

import {
  CURRENCY_FORMAT,
  MAX_EXPRESSION_DEPTH,
  MAX_TEMPLATE_NODES,
  countTemplateNodes,
  JALALI_FORMAT,
  TEXT_FORMAT,
  escapeHtml,
  evaluateCondition,
  evaluateExpression,
  formatValue,
  layoutReport,
  toValue,
  printableWidthMm,
  readPath,
  renderReportHtml,
  tableWidthMm,
  templateV1Schema,
  validateTemplate,
  type Condition,
  type EvaluationScope,
  type Expression,
  type ReportDataset,
  type TemplateV1,
} from './index.js';

function scopeOf(
  values: Record<string, unknown>,
  collections: Record<string, Record<string, unknown>[]> = {},
): EvaluationScope {
  return {
    read: (path) => readPath(values, path),
    list: (path) => collections[path],
    roundingMode: 'HALF_UP',
  };
}

describe('قالب‌بندی مقدار', () => {
  it('مبلغ با جداکننده هزارگان فارسی', () => {
    expect(formatValue(2_950_481_510n, CURRENCY_FORMAT)).toBe('۲٬۹۵۰٬۴۸۱٬۵۱۰');
  });

  it('صفر صریح نوشته می‌شود، نه سلول خالی', () => {
    // قاعده docs/15 §۳ — در تصویر مرجع ستون مالیات صفر «۰» دارد.
    expect(formatValue(0n, CURRENCY_FORMAT)).toBe('۰');
    expect(formatValue(null, CURRENCY_FORMAT)).toBe('۰');
  });

  it('مبلغ بزرگ‌تر از محدوده امن number سالم می‌ماند', () => {
    // 2^53 + 1 — با number این عدد گرد می‌شد و یک ریال گم می‌کرد.
    expect(formatValue(9_007_199_254_740_993n, { ...CURRENCY_FORMAT, thousandSeparator: false })).toBe(
      '۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳',
    );
  });

  it('شماره اقتصادی گروه‌بندی چهارتایی می‌شود', () => {
    expect(formatValue('411134858916', { ...TEXT_FORMAT, kind: 'economicCode', persianDigits: true })).toBe(
      '۴۱۱۱-۳۴۸۵-۸۹۱۶',
    );
  });

  /*
    همین ستون گاهی کد ملی یا شناسهٔ ملی است — فروشندهٔ حقوقی‌ای که شمارهٔ اقتصادی
    ندارد. جدا کردنشان چهارتا‌چهارتا، عددی می‌سازد که در هیچ سامانه‌ای به آن شکل
    نوشته نمی‌شود.
  */
  it('کد ملی و شناسهٔ ملی بدون جداکننده می‌آیند', () => {
    expect(
      formatValue('0499370899', { ...TEXT_FORMAT, kind: 'economicCode', persianDigits: true }),
    ).toBe('۰۴۹۹۳۷۰۸۹۹');

    expect(
      formatValue('10101234561', { ...TEXT_FORMAT, kind: 'economicCode', persianDigits: false }),
    ).toBe('10101234561');
  });

  /*
    صفرِ ابتدایی، جایی می‌افتاد که هیچ قالبی نمی‌دیدش.

    آزمون بالا سال‌ها سبز بود چون `formatValue` را مستقیم با **رشته** صدا می‌زد؛
    ولی در مسیر واقعی، مقدار اول از `toValue` رد می‌شود و آنجا هر رشتهٔ تماماً
    رقمی `bigint` می‌شد. کد ملیِ «۰۴۹۹۳۷۰۸۹۹» پیش از رسیدن به قالب‌بندی،
    «۴۹۹۳۷۰۸۹۹» شده بود — نه بدقواره، که **عدد دیگری**. پس ادعا باید روی همان
    مرزی بنشیند که داده از آن می‌گذرد.
  */
  it('شناسهٔ با صفرِ ابتدایی، عدد نمی‌شود', () => {
    expect(toValue('0499370899')).toBe('0499370899');
    expect(toValue('00123456789')).toBe('00123456789');
    // کدپستی و تلفن شهری هم همین‌اند.
    expect(toValue('0371234567')).toBe('0371234567');
  });

  it('عددِ واقعی همچنان عدد می‌ماند', () => {
    // مبالغ از API رشتهٔ عددی‌اند (ADR-0003) و باید bigint شوند، وگرنه جمع‌ها می‌شکند.
    expect(toValue('2950481510')).toBe(2_950_481_510n);
    expect(toValue('0')).toBe(0n);
    expect(toValue('-4500')).toBe(-4500n);
    expect(toValue('')).toBe('');
  });

  it('کد ملیِ با صفر، از داده تا چاپ سالم می‌رسد', () => {
    const format = { ...TEXT_FORMAT, kind: 'economicCode' as const, persianDigits: true };
    expect(formatValue(toValue('0499370899'), format)).toBe('۰۴۹۹۳۷۰۸۹۹');
  });

  it('تاریخ میلادی به شمسی تبدیل می‌شود', () => {
    expect(formatValue('2026-10-04', JALALI_FORMAT)).toBe('۱۴۰۵/۰۷/۱۲');
  });

  it('تاریخ نامعتبر پنهان نمی‌شود', () => {
    expect(formatValue('نامعتبر', JALALI_FORMAT)).toBe('نامعتبر');
  });
});

describe('ارزیاب عبارت', () => {
  it('مقدار متنی عددی به bigint تبدیل می‌شود، نه به number', () => {
    const expression: Expression = { k: 'var', path: 'a.amount' };
    expect(evaluateExpression(expression, scopeOf({ a: { amount: '9007199254740993' } }))).toBe(
      9_007_199_254_740_993n,
    );
  });

  it('نام با ارقام، متن می‌ماند', () => {
    const expression: Expression = { k: 'var', path: 'v.name' };
    expect(evaluateExpression(expression, scopeOf({ v: { name: 'شرکت ۲۰۲۰' } }))).toBe('شرکت ۲۰۲۰');
  });

  it('جمع و تفریق روی مبلغ', () => {
    const expression: Expression = {
      k: 'arith',
      op: 'sub',
      args: [
        { k: 'var', path: 'r.gross' },
        { k: 'var', path: 'r.discount' },
      ],
    };
    expect(evaluateExpression(expression, scopeOf({ r: { gross: '1000', discount: '250' } }))).toBe(750n);
  });

  it('تقسیم از همان گرد کردن سند استفاده می‌کند', () => {
    const expression: Expression = {
      k: 'arith',
      op: 'divRound',
      args: [
        { k: 'const', type: 'money', v: '7777777' },
        { k: 'const', type: 'number', v: '2' },
      ],
    };
    // HALF_UP: 3888888.5 → 3888889
    expect(evaluateExpression(expression, scopeOf({}))).toBe(3_888_889n);
  });

  it('تقسیم بر صفر خطای صریح می‌دهد', () => {
    const expression: Expression = {
      k: 'arith',
      op: 'divRound',
      args: [
        { k: 'const', type: 'money', v: '10' },
        { k: 'const', type: 'number', v: '0' },
      ],
    };
    expect(() => evaluateExpression(expression, scopeOf({}))).toThrowError(/تقسیم بر صفر/u);
  });

  it('ضرب روی متن رد می‌شود', () => {
    const expression: Expression = {
      k: 'arith',
      op: 'mul',
      args: [
        { k: 'var', path: 'v.name' },
        { k: 'const', type: 'number', v: '2' },
      ],
    };
    expect(() => evaluateExpression(expression, scopeOf({ v: { name: 'الف' } }))).toThrowError(
      /غیرعددی/u,
    );
  });

  it('تجمیع sum روی یک مجموعه', () => {
    const expression: Expression = {
      k: 'agg',
      fn: 'sum',
      over: 'rows',
      of: { k: 'var', path: 'row.total' },
    };
    const scope = scopeOf({}, { rows: [{ total: '100' }, { total: '250' }, { total: '1' }] });
    expect(evaluateExpression(expression, scope)).toBe(351n);
  });

  it('تجمیع روی مجموعه ناموجود خطا می‌دهد، نه صفر', () => {
    const expression: Expression = { k: 'agg', fn: 'count', over: 'ghost' };
    expect(() => evaluateExpression(expression, scopeOf({}))).toThrowError(/وجود ندارد/u);
  });

  it('شرط تهی بودن، صفر را تهی نمی‌شمارد', () => {
    const condition: Condition = { k: 'empty', of: { k: 'var', path: 'r.tax' } };
    expect(evaluateCondition(condition, scopeOf({ r: { tax: '0' } }))).toBe(false);
    expect(evaluateCondition(condition, scopeOf({ r: { tax: null } }))).toBe(true);
  });

  it('عمق بیش از حد رد می‌شود', () => {
    let deep: Expression = { k: 'const', type: 'number', v: '1' };
    for (let index = 0; index < 25; index += 1) {
      deep = { k: 'arith', op: 'add', args: [deep, { k: 'const', type: 'number', v: '1' }] };
    }
    expect(() => evaluateExpression(deep, scopeOf({}))).toThrowError(/عمق عبارت/u);
  });

  it('خواندن مسیر به prototype نمی‌رسد', () => {
    // بدون این محافظ، قالبی با مسیر `__proto__.constructor` می‌توانست به تابع برسد.
    expect(readPath({ a: 1 }, '__proto__.constructor')).toBeUndefined();
    expect(readPath({ a: { b: 2 } }, 'a.b')).toBe(2);
    expect(readPath({ a: 1 }, 'toString')).toBeUndefined();
  });
});

/**
 * ستون‌های منبع داده `document.vendorAggregates`، همان‌طور که Data Dictionary لایه API
 * می‌دهد. اعتبارسنجی مسیرهای `row.*` به همین فهرست تکیه می‌کند.
 */
const VENDOR_AGGREGATE_FIELDS = new Set([
  'index',
  'vendorId',
  'vendorName',
  'vendorIdentifier',
  'goodsAmount',
  'discount',
  'net',
  'tax',
  'total',
]);

const MINIMAL_TEMPLATE: TemplateV1 = templateV1Schema.parse({
  schemaVersion: 1,
  reportTypeKey: 'TAX_REPORT',
  titleFa: 'گزارش آزمون',
  page: {
    size: 'A4',
    orientation: 'landscape',
    margins: { top: 10, bottom: 10, inlineStart: 10, inlineEnd: 10 },
    direction: 'rtl',
  },
  styles: {
    fontFamily: 'Vazirmatn',
    baseFontSizePt: 9,
    headingFontSizePt: 12,
    tableFontSizePt: 8,
    borderWidthPx: 1,
    borderColor: '#333333',
    textColor: '#000000',
    mutedTextColor: '#555555',
  },
  header: { repeatOnEveryPage: true, blocks: [] },
  footer: { repeatOnEveryPage: false, blocks: [] },
  body: [
    {
      id: 'table',
      type: 'table',
      dataSource: 'document.vendorAggregates',
      minRows: 4,
      pagination: { repeatHeaderOnNewPage: true, avoidRowBreak: true },
      totalsRow: { enabled: true, labelFa: 'جمع کل', cells: { total: 'sum', goods: 'sum' } },
      columns: [
        {
          key: 'rowNo',
          titleFa: 'ردیف',
          width: { unit: 'mm', value: 10 },
          align: 'center',
          rowNumber: true,
          value: { k: 'var', path: 'row.index' },
          format: { kind: 'integer', emptyText: '' },
        },
        {
          key: 'name',
          titleFa: 'طرف قرارداد',
          width: { unit: 'auto' },
          align: 'start',
          value: { k: 'var', path: 'row.vendorName' },
          format: { kind: 'text', persianDigits: false, emptyText: '' },
        },
        {
          key: 'goods',
          titleFa: 'مبلغ کالا',
          width: { unit: 'mm', value: 25 },
          align: 'end',
          value: { k: 'var', path: 'row.goodsAmount' },
          format: { kind: 'currency', emptyText: '۰' },
        },
        {
          key: 'total',
          titleFa: 'جمع کل',
          width: { unit: 'mm', value: 25 },
          align: 'end',
          value: { k: 'var', path: 'row.total' },
          format: { kind: 'currency', emptyText: '۰' },
        },
      ],
    },
  ],
});

/** شکل کمکیِ آزمون: جدولِ قالب پس از عبور از JSON. */
type TableBlockLike = { columns: unknown[] };

function datasetOf(rows: Record<string, unknown>[]): ReportDataset {
  return {
    values: { document: { title: 'سند آزمون' } },
    collections: { 'document.vendorAggregates': rows },
    signatories: [
      { roleKey: 'PROCUREMENT_LEAD', fullName: 'محمدصادق محمدی', positionTitle: 'مسئول کارپردازی' },
    ],
    roundingMode: 'HALF_UP',
    generatedAt: '2026-10-16',
  };
}

describe('چیدمان گزارش', () => {
  const rows = [
    { vendorName: 'شرکت توزیع برق', goodsAmount: '2950481510', total: '2950481510' },
    { vendorName: 'شرکت آرمان بهسازان', goodsAmount: '140000000', total: '140000000' },
  ];

  it('شماره ردیف از ۱ شروع می‌شود', () => {
    const report = layoutReport(MINIMAL_TEMPLATE, datasetOf(rows));
    const table = report.body[0];
    if (table?.kind !== 'table') throw new Error('جدول ساخته نشد');
    expect(table.rows[0]?.[0]?.text).toBe('۱');
    expect(table.rows[1]?.[0]?.text).toBe('۲');
  });

  it('ردیف جمع از مقادیر خام همان ستون ساخته می‌شود', () => {
    const report = layoutReport(MINIMAL_TEMPLATE, datasetOf(rows));
    const table = report.body[0];
    if (table?.kind !== 'table') throw new Error('جدول ساخته نشد');
    // ۲٬۹۵۰٬۴۸۱٬۵۱۰ + ۱۴۰٬۰۰۰٬۰۰۰ = ۳٬۰۹۰٬۴۸۱٬۵۱۰
    expect(table.totals?.[3]?.raw).toBe(3_090_481_510n);
    expect(table.totals?.[3]?.text).toBe('۳٬۰۹۰٬۴۸۱٬۵۱۰');
  });

  /*
    ردیف خالی یعنی **خالی**، نه صفر.

    پیش از این هر ستون عددیِ ردیف پرکننده «۰» می‌گرفت: عددی که وجود ندارد. در یک
    فرم مالی، نبودنِ عدد با صفر بودنش یکی نیست. فقط شمارهٔ ردیف می‌ماند، تا شمارش
    فرم پیوسته باشد.
  */
  it('ردیف‌های پرکننده فقط شماره دارند و بقیهٔ سلول‌هایشان خالی است', () => {
    const report = layoutReport(MINIMAL_TEMPLATE, datasetOf(rows));
    const table = report.body[0];
    if (table?.kind !== 'table') throw new Error('جدول ساخته نشد');

    expect(table.fillerRows).toHaveLength(2);

    // دو ردیف واقعی هست، پس پرکننده‌ها ۳ و ۴ می‌شوند.
    expect(table.fillerRows[0]?.[0]?.text).toBe('۳');
    expect(table.fillerRows[1]?.[0]?.text).toBe('۴');

    // بقیهٔ سلول‌ها خالی‌اند — حتی ستون‌های مبلغ.
    for (const row of table.fillerRows) {
      for (const cell of row.slice(1)) expect(cell.text).toBe('');
    }
  });

  /*
    برچسب «جمع کل» ستون‌های ابتدایی را با هم می‌گیرد.

    در ستون «ردیف» که چند میلی‌متر عرض دارد، همین عبارت می‌شکست و از سلول بیرون
    می‌زد. گستره تا اولین ستونی است که جمع دارد.
  */
  it('برچسب جمع، ستون‌های بی‌جمعِ ابتدایی را می‌پوشاند', () => {
    const report = layoutReport(MINIMAL_TEMPLATE, datasetOf(rows));
    const table = report.body[0];
    if (table?.kind !== 'table') throw new Error('جدول ساخته نشد');

    const firstAggregated = table.columns.findIndex((column) => column.key === 'goods');
    expect(table.totalsLabelSpan).toBe(firstAggregated);
    expect(table.totalsLabelSpan).toBeGreaterThan(1);
  });

  it('امضاکننده ثبت‌نشده، کادر امضا را حذف نمی‌کند', () => {
    const withSignatures = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      footer: {
        repeatOnEveryPage: false,
        blocks: [
          {
            id: 'row',
            type: 'signatureRow',
            blocks: [
              { id: 's1', type: 'signature', signatoryRoleKey: 'PROCUREMENT_LEAD', align: 'center' },
              { id: 's2', type: 'signature', signatoryRoleKey: 'GENERAL_MANAGER', align: 'center' },
            ],
          },
        ],
      },
    });
    const report = layoutReport(withSignatures, datasetOf(rows));
    const block = report.footer[0];
    if (block?.kind !== 'signatureRow') throw new Error('بلوک امضا ساخته نشد');
    expect(block.blocks[0]?.fullName).toBe('محمدصادق محمدی');
    expect(block.blocks[1]?.fullName).toBe('');
    expect(block.blocks).toHaveLength(2);
  });

  it('منبع داده ناموجود خطای صریح می‌دهد', () => {
    const dataset = { ...datasetOf(rows), collections: {} };
    expect(() => layoutReport(MINIMAL_TEMPLATE, dataset)).toThrowError(/وجود ندارد/u);
  });
});

describe('رندر HTML', () => {
  it('داده کاربر به‌صورت متن escape می‌شود، نه تگ', () => {
    const rows = [
      { vendorName: '<img src=x onerror="alert(1)">', goodsAmount: '10', total: '10' },
    ];
    const html = renderReportHtml(layoutReport(MINIMAL_TEMPLATE, datasetOf(rows)));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('escape همه پنج نویسه را یک‌بار انجام می‌دهد', () => {
    expect(escapeHtml('a&<>"\'')).toBe('a&amp;&lt;&gt;&quot;&#39;');
  });

  it('سرستون در هر صفحه تکرار می‌شود و ردیف نمی‌شکند', () => {
    const html = renderReportHtml(layoutReport(MINIMAL_TEMPLATE, datasetOf([])));
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('.avoid-row-break tr { break-inside: avoid; }');
  });

  it('جهت صفحه و اندازه از قالب می‌آید', () => {
    const html = renderReportHtml(layoutReport(MINIMAL_TEMPLATE, datasetOf([])));
    expect(html).toContain('size: A4 landscape;');
    expect(html).toContain('dir="rtl"');
  });

  it('هیچ منبع خارجی بارگذاری نمی‌شود', () => {
    const html = renderReportHtml(layoutReport(MINIMAL_TEMPLATE, datasetOf([])));
    expect(html).not.toMatch(/https?:\/\//u);
  });
});

describe('اعتبارسنجی قالب در برابر فهرست داده', () => {
  const dictionary = {
    allowedValuePaths: new Set(['document.title', 'organization.name']),
    collections: new Map([['document.vendorAggregates', VENDOR_AGGREGATE_FIELDS]]),
  };

  it('قالب درست مشکلی ندارد', () => {
    expect(validateTemplate(MINIMAL_TEMPLATE, dictionary)).toEqual([]);
  });

  it('منبع داده خارج از فهرست رد می‌شود', () => {
    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      body: [{ ...MINIMAL_TEMPLATE.body[0], dataSource: 'users.passwords' }],
    });
    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('users.passwords');
  });

  it('متغیر متنی خارج از فهرست رد می‌شود', () => {
    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      header: {
        repeatOnEveryPage: true,
        blocks: [
          { id: 't', type: 'text', text: 'سلام {{user.passwordHash}}', align: 'start' },
        ],
      },
    });
    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('user.passwordHash');
  });

  it('ردیف جمع به ستون ناموجود رد می‌شود', () => {
    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      body: [
        {
          ...MINIMAL_TEMPLATE.body[0],
          totalsRow: { enabled: true, labelFa: 'جمع', cells: { ghost: 'sum' } },
        },
      ],
    });
    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('ghost');
  });

  it('قالب با نسخه schema ناشناخته رد می‌شود', () => {
    const result = templateV1Schema.safeParse({ ...MINIMAL_TEMPLATE, schemaVersion: 2 });
    expect(result.success).toBe(false);
  });

  /**
   * این سه تست، حفره‌ای را می‌پوشانند که تا فاز ۷ باز بود: مسیرهای `row.*` **اصلاً**
   * بررسی نمی‌شدند. یعنی یک غلط تایپی در نام ستون (`row.totl`) از اعتبارسنجی رد
   * می‌شد و در گزارش مالی به‌جای خطا، یک سلول **خالی** می‌نشست.
   */
  it('مسیر ردیف به ستون ناموجود منبع داده رد می‌شود', () => {
    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      body: [
        {
          ...MINIMAL_TEMPLATE.body[0],
          columns: [
            {
              key: 'ghost',
              titleFa: 'ستون خیالی',
              width: { unit: 'mm', value: 20 },
              align: 'end',
              value: { k: 'var', path: 'row.secretSalary' },
              format: { kind: 'currency', emptyText: '۰' },
            },
          ],
        },
      ],
    });

    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('secretSalary');
  });

  it('مسیر ردیف بیرون از جدول رد می‌شود', () => {
    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      header: {
        repeatOnEveryPage: true,
        blocks: [
          {
            id: 'v',
            type: 'variable',
            value: { k: 'var', path: 'row.total' },
            format: { kind: 'currency', emptyText: '۰' },
          },
        ],
      },
    });

    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('دامنه ردیف ندارد');
  });

  /**
   * و همان مسیر، داخل یک تابع تجمیعی، **معتبر** است.
   *
   * گره `agg` دامنه `row.*` را به مجموعه‌ای که روی آن تجمیع می‌شود عوض می‌کند — دقیقاً
   * همان کاری که ارزیاب هنگام اجرا می‌کند. اگر اعتبارسنجی این را نمی‌دانست، یک جمعِ
   * درست و قابل‌اجرا را رد می‌کرد.
   */
  it('مسیر ردیف داخل تابع تجمیعی، بیرون از جدول هم معتبر است', () => {
    const good = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      header: {
        repeatOnEveryPage: true,
        blocks: [
          {
            id: 'sum',
            type: 'variable',
            labelFa: 'جمع کل',
            value: {
              k: 'agg',
              fn: 'sum',
              over: 'document.vendorAggregates',
              of: { k: 'var', path: 'row.total' },
            },
            format: { kind: 'currency', emptyText: '۰' },
          },
        ],
      },
    });

    expect(validateTemplate(good, dictionary)).toEqual([]);
  });

  it('مسیر ردیفِ ناموجود داخل تابع تجمیعی هم رد می‌شود', () => {
    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      header: {
        repeatOnEveryPage: true,
        blocks: [
          {
            id: 'sum',
            type: 'variable',
            value: {
              k: 'agg',
              fn: 'sum',
              over: 'document.vendorAggregates',
              of: { k: 'var', path: 'row.bonusPool' },
            },
            format: { kind: 'currency', emptyText: '۰' },
          },
        ],
      },
    });

    expect(validateTemplate(bad, dictionary).map((item) => item.message).join(' ')).toContain(
      'bonusPool',
    );
  });

  it('شرط نمایش ستون هم در دامنه همان جدول سنجیده می‌شود', () => {
    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      body: [
        {
          ...MINIMAL_TEMPLATE.body[0],
          columns: [
            {
              ...MINIMAL_TEMPLATE.body[0].columns[0],
              visibleWhen: { k: 'empty', of: { k: 'var', path: 'row.nothingHere' } },
            },
          ],
        },
      ],
    });

    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('nothingHere');
  });

  /** معیار پذیرش ۶ فاز ۷: قالبی که از سقف عمق یا تعداد گره بگذرد، ذخیره نمی‌شود. */
  it('عبارت عمیق‌تر از سقف رد می‌شود', () => {
    let deep: unknown = { k: 'var', path: 'row.total' };
    for (let level = 0; level < MAX_EXPRESSION_DEPTH + 5; level += 1) {
      deep = { k: 'arith', op: 'add', args: [deep, { k: 'const', type: 'money', v: '1' }] };
    }

    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      body: [
        {
          ...MINIMAL_TEMPLATE.body[0],
          columns: [{ ...MINIMAL_TEMPLATE.body[0].columns[0], value: deep }],
        },
      ],
    });

    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('عمق عبارت');
  });

  it('قالب با گره‌های بیش از سقف رد می‌شود', () => {
    // درخت concat با انشعاب ۶ و عمق ۵: حدود ۹۳۰۰ گره، بیشتر از سقف ۵۰۰۰.
    const wide = (depth: number): unknown =>
      depth === 0
        ? { k: 'const', type: 'text', v: 'x' }
        : { k: 'concat', args: Array.from({ length: 6 }, () => wide(depth - 1)) };

    const bad = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      body: [
        {
          ...MINIMAL_TEMPLATE.body[0],
          columns: [
            {
              ...MINIMAL_TEMPLATE.body[0].columns[1],
              value: wide(5),
            },
          ],
        },
      ],
    });

    expect(countTemplateNodes(bad)).toBeGreaterThan(MAX_TEMPLATE_NODES);
    const problems = validateTemplate(bad, dictionary);
    expect(problems.map((item) => item.message).join(' ')).toContain('گره‌های قالب');
  });
});

describe('جا شدن ستون‌ها در عرض صفحه', () => {
  it('عرض قابل چاپ از اندازه و جهت صفحه محاسبه می‌شود', () => {
    expect(
      printableWidthMm({
        size: 'A4',
        orientation: 'landscape',
        margins: { top: 12, bottom: 12, inlineStart: 10, inlineEnd: 10 },
        direction: 'rtl',
      }),
    ).toBe(277);

    expect(
      printableWidthMm({
        size: 'A4',
        orientation: 'portrait',
        margins: { top: 12, bottom: 12, inlineStart: 15, inlineEnd: 15 },
        direction: 'rtl',
      }),
    ).toBe(180);
  });

  it('جدول پهن‌تر از صفحه رد می‌شود', () => {
    // همان نقصی که در آزمون PDF فاز ۶ دیده شد: دو ستون آخر از صفحه بیرون می‌افتادند.
    const wide = templateV1Schema.parse({
      ...MINIMAL_TEMPLATE,
      body: [
        {
          ...MINIMAL_TEMPLATE.body[0],
          columns: MINIMAL_TEMPLATE.body[0].columns.map((column) => ({
            ...column,
            width: { unit: 'mm', value: 100 },
          })),
        },
      ],
    });

    const problems = validateTemplate(wide, {
      allowedValuePaths: new Set(['document.title']),
      collections: new Map([['document.vendorAggregates', VENDOR_AGGREGATE_FIELDS]]),
    });

    expect(problems.map((item) => item.message).join(' ')).toContain('بریده می‌شوند');
  });
});

/**
 * ستون تکرارشونده — چیزی که فرم ریزهزینه لازمش داشت.
 *
 * ستون‌های فصل از **داده مرجع** می‌آیند و نه از قالب: کاربر فصل اضافه و کم می‌کند و
 * قالب نباید با هر بار، عوض شود.
 */
/**
 * سلولِ دوبخشی و سرستونِ دوتکه‌ای — وقتی یکی از دو تکه نیست.
 *
 * گزارش مالیات سه ستون دوبخشی دارد («شماره صورت‌حساب — تاریخ»، «نام — کد ملی»،
 * «تلفن — کد پستی»). قاعدهٔ تجمیع می‌گوید فروشنده‌ای که چند فاکتور دارد شمارهٔ
 * صورت‌حساب نمی‌گیرد؛ پس نیمهٔ بالای آن سلول خالی می‌ماند، و اگر هیچ فروشنده‌ای
 * شماره نداشته باشد، سرستون به ستونی اشاره می‌کند که در کل جدول خالی است.
 */
describe('سلول دوبخشی با تکهٔ غایب', () => {
  const TEMPLATE: TemplateV1 = templateV1Schema.parse({
    schemaVersion: 1,
    reportTypeKey: 'TAX_REPORT',
    titleFa: 'مالیات',
    page: {
      size: 'A4',
      orientation: 'landscape',
      margins: { top: 10, bottom: 10, inlineStart: 10, inlineEnd: 10 },
      direction: 'rtl',
    },
    styles: {
      fontFamily: 'Vazirmatn',
      baseFontSizePt: 9,
      headingFontSizePt: 12,
      tableFontSizePt: 8,
      borderWidthPx: 1,
      borderColor: '#333333',
      textColor: '#000000',
      mutedTextColor: '#555555',
    },
    header: { repeatOnEveryPage: true, blocks: [] },
    footer: { repeatOnEveryPage: false, blocks: [] },
    body: [
      {
        id: 'table',
        type: 'table',
        dataSource: 'document.vendorAggregates',
        minRows: 0,
        pagination: { repeatHeaderOnNewPage: true, avoidRowBreak: true },
        columns: [
          {
            key: 'vendor',
            titleFa: 'فروشنده',
            width: { unit: 'mm', value: 60 },
            align: 'start',
            value: { k: 'var', path: 'row.vendorName' },
            format: { kind: 'text', persianDigits: false, emptyText: '' },
          },
          {
            key: 'invoiceRef',
            titleFa: 'شماره صورت حساب — تاریخ صورت حساب',
            titleParts: { mainTitleFa: 'شماره صورت حساب', separator: ' — ' },
            width: { unit: 'mm', value: 40 },
            align: 'center',
            value: { k: 'var', path: 'row.invoiceNumber' },
            format: { kind: 'text', persianDigits: true, emptyText: '' },
            multiline: {
              lines: [
                {
                  value: { k: 'var', path: 'row.invoiceDate' },
                  format: { kind: 'jalaliDate', persianDigits: true, emptyText: '' },
                  muted: false,
                  titleFa: 'تاریخ صورت حساب',
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const tableOf = (rows: Record<string, unknown>[]) => {
    const block = layoutReport(TEMPLATE, {
      values: {},
      collections: { 'document.vendorAggregates': rows },
      signatories: [],
      roundingMode: 'HALF_UP',
      generatedAt: '2026-10-27',
    }).body[0];
    if (block?.kind !== 'table') throw new Error('جدول ساخته نشد');
    return block;
  };

  const WITH_NUMBER = { vendorName: 'الف', invoiceNumber: 'F-100', invoiceDate: '2026-09-22' };
  const WITHOUT = { vendorName: 'ب', invoiceNumber: null, invoiceDate: '2026-09-23' };

  /*
    این همان اشکالی است که دیده شد: سلول با نیمهٔ بالای خالی، خطی افقی وسطش، و
    تاریخ در نیمهٔ پایین — به‌جای یک سلولِ ساده با تاریخ.
  */
  it('ردیفِ بی‌شماره، سلولِ یک‌تکه با تاریخ می‌گیرد و نه نیمهٔ خالی', () => {
    const table = tableOf([WITH_NUMBER, WITHOUT]);

    // ارقام فارسی، چون `persianDigits` ستون روشن است.
    expect(table.rows[0]?.[1]?.text).toBe('F-۱۰۰');
    expect(table.rows[0]?.[1]?.extraLines.map((line) => line.text)).toEqual(['۱۴۰۵/۰۶/۳۱']);

    expect(table.rows[1]?.[1]?.text).toBe('۱۴۰۵/۰۷/۰۱');
    expect(table.rows[1]?.[1]?.extraLines).toEqual([]);
  });

  it('سلولِ یک‌تکه در HTML هم دوبخشی نیست', () => {
    const html = renderReportHtml(layoutReport(TEMPLATE, {
      values: {},
      collections: { 'document.vendorAggregates': [WITHOUT] },
      signatories: [],
      roundingMode: 'HALF_UP',
      generatedAt: '2026-10-27',
    }));

    expect(html).toContain(
      '<td class="align-center"><span class="cell-line">۱۴۰۵/۰۷/۰۱</span></td>',
    );
    // فقط بدنهٔ جدول؛ خودِ شیوه‌نامه همیشه قاعدهٔ `split-cell` را دارد.
    expect(html.slice(html.indexOf('</thead>'))).not.toContain('split-cell');
  });

  /*
    سرستون دربارهٔ **ستون** است و نه یک ردیف: یک ردیفِ شماره‌دار کافی است تا
    «شماره صورت حساب» سر جایش بماند.
  */
  it('تکه‌ای که در یک ردیف هم آمده باشد، در سرستون می‌ماند', () => {
    expect(tableOf([WITH_NUMBER, WITHOUT]).columns[1]?.titleFa).toBe(
      'شماره صورت حساب — تاریخ صورت حساب',
    );
  });

  it('تکه‌ای که در هیچ ردیفی نیامده، از سرستون می‌افتد', () => {
    expect(tableOf([WITHOUT, { ...WITHOUT, vendorName: 'ج' }]).columns[1]?.titleFa).toBe(
      'تاریخ صورت حساب',
    );
  });

  // سرستونِ خالی بدتر از سرستونِ کامل است؛ جدولِ بی‌ردیف هم همین حالت است.
  it('وقتی هیچ تکه‌ای داده ندارد، عنوان ثابت می‌ماند', () => {
    expect(tableOf([]).columns[1]?.titleFa).toBe('شماره صورت حساب — تاریخ صورت حساب');
    expect(
      tableOf([{ vendorName: 'د', invoiceNumber: null, invoiceDate: null }]).columns[1]?.titleFa,
    ).toBe('شماره صورت حساب — تاریخ صورت حساب');
  });

  // ستونی که `titleParts` ندارد، دست‌نخورده می‌ماند.
  it('ستون بدون titleParts عنوانش عوض نمی‌شود', () => {
    expect(tableOf([WITHOUT]).columns[0]?.titleFa).toBe('فروشنده');
  });
});

describe('ستون تکرارشونده', () => {
  const CHAPTERS = [
    { key: 'ch-1', title: 'تعمیرات', code: 'فصل ۱' },
    { key: 'ch-2', title: 'تجهیزات', code: 'فصل ۲' },
  ];

  const EXPENSES = [
    { index: 1, description: 'رنگ‌آمیزی', chapterKey: 'ch-1', total: '14094800' },
    { index: 2, description: 'میز و نیمکت', chapterKey: 'ch-2', total: '2114220' },
    { index: 3, description: 'تعمیر در', chapterKey: 'ch-1', total: '1000000' },
  ];

  const TEMPLATE: TemplateV1 = templateV1Schema.parse({
    schemaVersion: 1,
    reportTypeKey: 'EXPENSE',
    titleFa: 'ریزهزینه',
    page: {
      size: 'A4',
      orientation: 'landscape',
      margins: { top: 10, bottom: 10, inlineStart: 10, inlineEnd: 10 },
      direction: 'rtl',
    },
    styles: {
      fontFamily: 'Vazirmatn',
      baseFontSizePt: 9,
      headingFontSizePt: 12,
      tableFontSizePt: 8,
      borderWidthPx: 1,
      borderColor: '#333333',
      textColor: '#000000',
      mutedTextColor: '#555555',
    },
    header: { repeatOnEveryPage: true, blocks: [] },
    footer: { repeatOnEveryPage: false, blocks: [] },
    body: [
      {
        id: 'table',
        type: 'table',
        dataSource: 'document.capitalExpenses',
        minRows: 0,
        pagination: { repeatHeaderOnNewPage: true, avoidRowBreak: true },
        totalsRow: { enabled: true, labelFa: 'جمع کل', cells: { chapter: 'sum', total: 'sum' } },
        columns: [
          {
            key: 'description',
            titleFa: 'شرح',
            width: { unit: 'mm', value: 60 },
            align: 'start',
            value: { k: 'var', path: 'row.description' },
            format: { kind: 'text', persianDigits: false, emptyText: '' },
          },
          {
            key: 'chapter',
            titleFa: 'فصل',
            repeatFor: {
              over: 'document.capitalChapters',
              keyFrom: 'key',
              titleFrom: 'title',
              subtitleFrom: 'code',
              maxColumns: 8,
            },
            width: { unit: 'mm', value: 25 },
            align: 'end',
            value: {
              k: 'if',
              cond: {
                k: 'cmp',
                op: 'eq',
                args: [
                  { k: 'var', path: 'row.chapterKey' },
                  { k: 'var', path: 'column.key' },
                ],
              },
              then: { k: 'var', path: 'row.total' },
              else: { k: 'const', type: 'text', v: '' },
            },
            format: { kind: 'currency', emptyText: '' },
          },
          {
            key: 'total',
            titleFa: 'جمع',
            width: { unit: 'mm', value: 30 },
            align: 'end',
            value: { k: 'var', path: 'row.total' },
            format: { kind: 'currency', emptyText: '' },
          },
        ],
      },
    ],
  });

  const dataset = (chapters: Record<string, unknown>[] = CHAPTERS): ReportDataset => ({
    values: {},
    collections: {
      'document.capitalChapters': chapters,
      'document.capitalExpenses': EXPENSES,
    },
    signatories: [],
    roundingMode: 'HALF_UP',
    generatedAt: '2026-10-27',
  });

  const tableOf = (chapters?: Record<string, unknown>[]) => {
    const block = layoutReport(TEMPLATE, dataset(chapters)).body[0];
    if (block?.kind !== 'table') throw new Error('جدول ساخته نشد');
    return block;
  };

  it('یک ستونِ قالب به تعداد فصل‌ها باز می‌شود', () => {
    const table = tableOf();
    expect(table.columns.map((column) => column.titleFa)).toEqual([
      'شرح',
      'تعمیرات',
      'تجهیزات',
      'جمع',
    ]);
  });

  it('سرستونِ هر فصل دو طبقه است: عنوان بالا، کد پایین', () => {
    const table = tableOf();
    expect(table.columns.map((column) => column.subtitleFa)).toEqual([
      null,
      'فصل ۱',
      'فصل ۲',
      null,
    ]);
  });

  /*
    مهم‌ترین ادعای این ستون.

    مبلغ فقط زیر فصلِ خودش می‌نشیند و بقیهٔ خانه‌ها **خالی** می‌مانند و نه صفر: در
    یک فرم مالی، نبودنِ عدد با صفر بودنش یکی نیست.
  */
  it('مبلغ هر ردیف فقط زیر فصل خودش می‌نشیند', () => {
    const table = tableOf();
    expect(table.rows[0]?.[1]?.raw).toBe(14_094_800n);
    expect(table.rows[0]?.[2]?.text).toBe('');
    expect(table.rows[1]?.[1]?.text).toBe('');
    expect(table.rows[1]?.[2]?.raw).toBe(2_114_220n);
  });

  it('ته هر ستون، جمعِ همان فصل می‌نشیند و نه جمع همه', () => {
    const table = tableOf();
    // تعمیرات: ۱۴٬۰۹۴٬۸۰۰ + ۱٬۰۰۰٬۰۰۰
    expect(table.totals?.[1]?.raw).toBe(15_094_800n);
    expect(table.totals?.[2]?.raw).toBe(2_114_220n);
    expect(table.totals?.[3]?.raw).toBe(17_209_020n);
  });

  it('فصلی که ردیفی ندارد ستونش می‌ماند، با جمع صفر', () => {
    const table = tableOf([...CHAPTERS, { key: 'ch-9', title: 'ورزشی', code: 'فصل ۹' }]);
    expect(table.columns).toHaveLength(5);
    expect(table.totals?.[3]?.raw).toBe(0n);
  });

  // مجموعهٔ خالی یعنی هیچ ستونی، نه یک ستونِ بی‌سرستون.
  it('بدون فصل، هیچ ستون فصلی ساخته نمی‌شود', () => {
    const table = tableOf([]);
    expect(table.columns.map((column) => column.key)).toEqual(['description', 'total']);
  });

  /*
    ───── حذف ستونِ صفر ─────

    سازمانی که ده فصل تعریف کرده، روی هر فرم ده ستون می‌گیرد؛ سندی که در دو فصل
    خرج داشته، هشت ستونِ صفر چاپ می‌کند. این نشان اجازه می‌دهد آن هشت ستون نیایند.
  */
  describe('حذف ستون صفر', () => {
    /** همان قالب، با اجازهٔ حذفِ ستون فصلِ صفر. */
    const dropping = (): TemplateV1 => {
      const next = structuredClone(TEMPLATE) as TemplateV1;
      const table = next.body[0];
      if (table?.type !== 'table') throw new Error('جدول نیست');
      const chapter = table.columns[1];
      if (!chapter) throw new Error('ستون فصل نیست');
      (chapter as { dropWhenAllZero: boolean }).dropWhenAllZero = true;
      return next;
    };

    const droppedTableOf = (
      chapters?: Record<string, unknown>[],
      rows?: Record<string, unknown>[],
    ) => {
      const data = dataset(chapters);
      const block = layoutReport(dropping(), {
        ...data,
        collections: { ...data.collections, 'document.capitalExpenses': rows ?? EXPENSES },
      }).body[0];
      if (block?.kind !== 'table') throw new Error('جدول ساخته نشد');
      return block;
    };

    it('فصلی که در این سند خرجی ندارد، ستونش نمی‌آید', () => {
      const withEmpty = [...CHAPTERS, { key: 'ch-9', title: 'ورزشی', code: 'فصل ۹' }];
      // بدون نشان، ستون می‌ماند — همان ادعای آزمون بالاتر.
      expect(tableOf(withEmpty).columns).toHaveLength(5);
      // با نشان، فقط «ورزشی» می‌رود و دو فصلِ دیگر سر جایشان می‌مانند.
      expect(droppedTableOf(withEmpty).columns.map((column) => column.titleFa)).toEqual([
        'شرح',
        'تعمیرات',
        'تجهیزات',
        'جمع',
      ]);
    });

    /*
      حذف، فقط ستون را برنمی‌دارد: ردیف جمع و پهنای خانه‌هایش هم باید با
      ستون‌های **مانده** حساب شوند. اگر حذف پس از ساختِ جمع انجام می‌شد، جمعِ هر
      ستون یکی به چپ می‌افتاد — یعنی مبلغِ «تجهیزات» زیر «تعمیرات».
    */
    it('ردیف جمع با ستون‌های مانده می‌خواند', () => {
      const table = droppedTableOf([
        { key: 'ch-0', title: 'خالی', code: 'فصل ۰' },
        ...CHAPTERS,
      ]);
      expect(table.columns.map((column) => column.titleFa)).toEqual([
        'شرح',
        'تعمیرات',
        'تجهیزات',
        'جمع',
      ]);
      expect(table.totals).toHaveLength(4);
      expect(table.totals?.[1]?.raw).toBe(15_094_800n);
      expect(table.totals?.[2]?.raw).toBe(2_114_220n);
      expect(table.totals?.[3]?.raw).toBe(17_209_020n);
      expect(table.totalsSpans).toHaveLength(4);
    });

    /*
      فرمِ خالی، فرمِ دست‌نویس است.

      جدولی که هیچ ردیفی ندارد چاپ می‌شود تا کسی با خودکار پرش کند؛ اگر ستونِ
      صفر را آنجا هم حذف می‌کردیم، فرم بی‌ستون از چاپگر بیرون می‌آمد.
    */
    it('جدولِ بی‌ردیف، همهٔ ستون‌هایش را نگه می‌دارد', () => {
      const table = droppedTableOf(CHAPTERS, []);
      expect(table.columns.map((column) => column.titleFa)).toEqual([
        'شرح',
        'تعمیرات',
        'تجهیزات',
        'جمع',
      ]);
    });
  });

  /*
    ───── علامتِ خاکستری ─────

    گزارش مالیات صد ردیف دارد و کسی که امضایش می‌کند باید ردیف‌های بزرگ را در یک
    نگاه ببیند. آستانه از تنظیم‌های سازمان می‌آید و نه از قالب.
  */
  describe('پس‌زمینهٔ مشروط سلول', () => {
    /** همان قالب، با شرطِ «جمعِ ردیف از آستانهٔ تنظیم‌ها بیشتر است». */
    const shading = (): TemplateV1 => {
      const next = structuredClone(TEMPLATE) as TemplateV1;
      const table = next.body[0];
      if (table?.type !== 'table') throw new Error('جدول نیست');
      const total = table.columns[2];
      if (!total) throw new Error('ستون جمع نیست');
      const threshold: Expression = { k: 'var', path: 'settings.taxHighlightAbove' };
      (total as { shadeWhen: Condition }).shadeWhen = {
        k: 'and',
        args: [
          { k: 'not', of: { k: 'empty', of: threshold } },
          { k: 'cmp', op: 'gt', args: [{ k: 'var', path: 'row.total' }, threshold] },
        ],
      };
      return next;
    };

    const shadedTableOf = (taxHighlightAbove: string) => {
      const data = dataset();
      const block = layoutReport(shading(), {
        ...data,
        values: { settings: { taxHighlightAbove } },
      }).body[0];
      if (block?.kind !== 'table') throw new Error('جدول ساخته نشد');
      return block;
    };

    it('فقط ردیفِ بالاتر از آستانه علامت می‌خورد', () => {
      // ردیف‌ها: ۱۴٬۰۹۴٬۸۰۰ و ۲٬۱۱۴٬۲۲۰ و ۱٬۰۰۰٬۰۰۰ — آستانه ۲ میلیون.
      // ستونِ «جمع» شاخصِ ۳ است: ستون فصل به دو ستون باز شده.
      const table = shadedTableOf('2000000');
      expect(table.columns.map((column) => column.titleFa)).toEqual([
        'شرح',
        'تعمیرات',
        'تجهیزات',
        'جمع',
      ]);
      expect(table.rows.map((row) => row[3]?.shaded)).toEqual([true, true, false]);
      // و ستون‌های دیگر دست‌نخورده‌اند: شرط روی ستون نشسته، نه روی ردیف.
      expect(table.rows.flatMap((row) => row.slice(0, 3).map((cell) => cell.shaded))).not.toContain(
        true,
      );
    });

    it('مبلغِ برابر با آستانه علامت نمی‌خورد', () => {
      // `gt` و نه `gte`: «بیشتر از» همان چیزی است که کاربر می‌گوید.
      const table = shadedTableOf('14094800');
      expect(table.rows[0]?.[3]?.shaded).toBe(false);
    });

    /*
      آستانهٔ خالی یعنی خاموش — و نه خطا.

      مقایسهٔ ترتیبی در موتور فقط روی عدد ممکن است و رشتهٔ خالی خطا می‌دهد؛ شرطِ
      قالب با `not empty` جلوی آن را می‌گیرد و `and` کوتاه‌مدار است. اگر این
      نگهبان نبود، **هر** اجرای گزارش مالیات در سازمانی که آستانه نگذاشته با خطا
      می‌افتاد.
    */
    it('آستانهٔ خالی، گزارش را نمی‌شکند و هیچ سلولی علامت نمی‌خورد', () => {
      const table = shadedTableOf('');
      expect(table.rows.map((row) => row[3]?.shaded)).toEqual([false, false, false]);
    });

    it('ردیف جمع علامت نمی‌خورد، هرچند از آستانه بیشتر است', () => {
      // جمعِ کل ۱۷٬۲۰۹٬۰۲۰ است؛ شرط برای **ردیف** معنا دارد و جمع، ردیف نیست.
      expect(shadedTableOf('2000000').totals?.[3]?.shaded).toBe(false);
    });

    it('رندر HTML پس‌زمینه را می‌گذارد و رنگ متن را دست نمی‌زند', () => {
      const data = dataset();
      const html = renderReportHtml(
        layoutReport(shading(), {
          ...data,
          values: { settings: { taxHighlightAbove: '2000000' } },
        }),
      );
      expect(html).toContain('<td class="align-end shaded">');
      expect(html).toContain('.report-table td.shaded');
      // متن، همان رنگِ همیشگی؛ علامت نباید عدد را کم‌کنتراست کند.
      expect(html).not.toMatch(/td\.shaded\s*\{[^}]*color:/u);
    });

    it('اعتبارسنجی، مسیرِ ناشناخته در شرطِ رنگ را رد می‌کند', () => {
      const problems = validateTemplate(shading(), {
        allowedValuePaths: new Set<string>(),
        collections: new Map([
          ['document.capitalChapters', new Set(['key', 'title', 'code'])],
          ['document.capitalExpenses', new Set(['index', 'description', 'chapterKey', 'total'])],
        ]),
      });

      expect(
        problems.filter((problem) => problem.path === 'block.table.columns.total.shadeWhen'),
      ).not.toHaveLength(0);
      expect(problems.map((problem) => problem.message)).toContain(
        'مسیر داده «settings.taxHighlightAbove» مجاز نیست',
      );
    });
  });

  /*
    سقف تکرار، بررسیِ «ستون‌ها از عرض صفحه بیرون نمی‌زنند» را معنادار نگه می‌دارد.

    خطا دادن از بریدنِ خاموشِ دو ستونِ آخر روی کاغذ بهتر است: کاربر می‌فهمد و
    می‌تواند کاری بکند.
  */
  it('بیشتر از سقف قالب، خطا می‌دهد و ستون نمی‌برد', () => {
    const many = Array.from({ length: 9 }, (_unused, index) => ({
      key: `ch-${index}`,
      title: `فصل ${index}`,
      code: '',
    }));
    expect(() => tableOf(many)).toThrow(/سقف قالب/u);
  });

  /*
    سلولِ ردیفِ داده، هیچ‌وقت `colspan` ندارد.

    ادغام خانه فقط در ردیف جمع معنا دارد (جمعِ نوشته‌شده به حروف، و برچسب «جمع
    کل»). این آزمون یک اشتباهِ واقعی را می‌گیرد: `row.map(renderCell)` شاخصِ آرایه
    را به پارامتر `colspan` می‌داد و از سلول سوم به بعد، هر خانه چند ستون را
    می‌پوشاند — جدول روی کاغذ به‌هم می‌ریخت و هیچ آزمونی نمی‌دید.
  */
  it('ردیف‌های داده هیچ سلولِ ادغام‌شده‌ای ندارند', () => {
    const html = renderReportHtml(layoutReport(TEMPLATE, dataset()));
    const body = html.slice(html.indexOf('</thead>'));
    const dataRowCells = [...body.matchAll(/<tr>(?:(?!<\/tr>)[\s\S])*<\/tr>/gu)].flatMap((row) =>
      [...row[0].matchAll(/<td [^>]*>/gu)].map((cell) => cell[0]),
    );

    expect(dataRowCells).not.toHaveLength(0);
    expect(dataRowCells.filter((cell) => cell.includes('colspan'))).toEqual([]);
  });

  it('رندر HTML سرستون را دو ردیفه می‌کند و بی‌زیرعنوان‌ها را عمودی ادغام', () => {
    const html = renderReportHtml(layoutReport(TEMPLATE, dataset()));
    expect(html).toContain('<th class="align-center" rowspan="2">شرح</th>');
    expect(html).toContain('<th class="align-center">تعمیرات</th>');
    expect(html).toContain('<th class="align-center">فصل ۱</th>');
  });

  it('اعتبارسنجی، `column.*` را بیرون از ستون تکرارشونده رد می‌کند', () => {
    const broken = structuredClone(TEMPLATE) as TemplateV1;
    const table = broken.body[0];
    if (table?.type !== 'table') throw new Error('جدول نیست');
    const column = table.columns[2];
    if (!column) throw new Error('ستون نیست');
    (column as { value: Expression }).value = { k: 'var', path: 'column.key' };

    const problems = validateTemplate(broken, {
      allowedValuePaths: new Set<string>(),
      collections: new Map([
        ['document.capitalChapters', new Set(['key', 'title', 'code'])],
        ['document.capitalExpenses', new Set(['index', 'description', 'chapterKey', 'total'])],
      ]),
    });

    expect(problems.map((problem) => problem.message)).toContain(
      'مسیر «column.key» فقط در ستون تکرارشونده معنا دارد',
    );
  });
});

/**
 * ستونی که روی صفحه هست و روی کاغذ نه.
 *
 * فرم‌های ریزهزینه شکل قانونیِ ثابتی دارند و ستون تازه در آن‌ها جا ندارد؛ ولی
 * کسی که فرم را روی صفحه بررسی می‌کند به تاریخ صورت‌حساب نیاز دارد تا بفهمد هر
 * ردیف کدام فاکتور است. ادعای این بخش این است که جداسازی در **چیدمان** انجام
 * می‌شود: ستون پیش از ساخته شدن حذف می‌شود، پس پهنای ردیف جمع و ادغام خانه‌ها
 * برای همان ستون‌هایی حساب می‌شود که واقعاً چاپ می‌شوند — نه با یک حذفِ بعدی در
 * خروجی‌گیر که باید همهٔ آن شمارش‌ها را از نو بکند.
 */
describe('ستون فقط-صفحه', () => {
  const WITH_SCREEN_ONLY: TemplateV1 = templateV1Schema.parse({
    ...JSON.parse(JSON.stringify(MINIMAL_TEMPLATE)),
    body: [
      {
        ...JSON.parse(JSON.stringify(MINIMAL_TEMPLATE.body[0])),
        columns: [
          ...JSON.parse(JSON.stringify(MINIMAL_TEMPLATE.body[0] as TableBlockLike)).columns.slice(
            0,
            2,
          ),
          {
            key: 'invoiceDate',
            titleFa: 'تاریخ صورت حساب',
            width: { unit: 'mm', value: 22 },
            align: 'center',
            screenOnly: true,
            value: { k: 'var', path: 'row.invoiceDate' },
            format: { kind: 'jalaliDate', persianDigits: true, emptyText: '' },
          },
          ...JSON.parse(JSON.stringify(MINIMAL_TEMPLATE.body[0] as TableBlockLike)).columns.slice(2),
        ],
      },
    ],
  });

  const rows = [
    { index: 1, vendorName: 'الف', invoiceDate: '2026-10-04', goodsAmount: '1000', total: '1000' },
  ];

  function tableOf(target: 'screen' | 'print') {
    const report = layoutReport(WITH_SCREEN_ONLY, datasetOf(rows), { target });
    const table = report.body[0];
    if (table?.kind !== 'table') throw new Error('جدول ساخته نشد');
    return table;
  }

  it('روی صفحه هست، با مقدار قالب‌بندی‌شده', () => {
    const table = tableOf('screen');
    const keys = table.columns.map((column) => column.key);
    expect(keys).toEqual(['rowNo', 'name', 'invoiceDate', 'goods', 'total']);

    const index = keys.indexOf('invoiceDate');
    expect(table.columns[index]?.screenOnly).toBe(true);
    // تاریخ میلادیِ داده، شمسیِ فارسی روی صفحه.
    expect(table.rows[0]?.[index]?.text).toBe('۱۴۰۵/۰۷/۱۲');
  });

  it('روی کاغذ، ستون اصلاً ساخته نمی‌شود', () => {
    const table = tableOf('print');
    expect(table.columns.map((column) => column.key)).toEqual([
      'rowNo',
      'name',
      'goods',
      'total',
    ]);
    // هیچ ردیفی هم خانهٔ اضافه ندارد — وگرنه جدول یک ستون کج می‌شد.
    expect(table.rows[0]).toHaveLength(4);
    expect(table.fillerRows[0]).toHaveLength(4);
  });

  /*
    مهم‌ترین ادعا.

    برچسب «جمع کل» ستون‌های ابتدایی را با هم می‌گیرد. اگر ستونِ فقط-صفحه بعد از
    ساختِ چیدمان حذف می‌شد، این پهنا یکی بیشتر از ستون‌های موجود می‌ماند و کل
    ردیف جمع یک خانه کج می‌افتاد.
  */
  it('پهنای برچسب جمع، در هر خروجی با ستون‌های همان خروجی می‌خواند', () => {
    const screen = tableOf('screen');
    const print = tableOf('print');

    expect(screen.totalsLabelSpan).toBe(print.totalsLabelSpan + 1);
    expect(screen.totals).toHaveLength(screen.columns.length);
    expect(print.totals).toHaveLength(print.columns.length);
  });

  it('پیش‌فرض، چیدمانِ صفحه است', () => {
    const table = layoutReport(WITH_SCREEN_ONLY, datasetOf(rows)).body[0];
    if (table?.kind !== 'table') throw new Error('جدول ساخته نشد');
    expect(table.columns.map((column) => column.key)).toContain('invoiceDate');
  });

  /*
    عرض کاغذ.

    ستونی که چاپ نمی‌شود نباید از بودجهٔ عرضِ صفحه بخورد؛ وگرنه افزودن یک ستونِ
    کمکی به فرمی که تا لبهٔ کاغذ پر است، آن را «بیش از عرض قابل چاپ» می‌کرد.
  */
  it('در جمع عرض ستون‌ها شمرده نمی‌شود', () => {
    const body = WITH_SCREEN_ONLY.body[0];
    const plain = MINIMAL_TEMPLATE.body[0];
    if (body?.type !== 'table' || plain?.type !== 'table') throw new Error('جدول نیست');
    expect(tableWidthMm(body)).toBe(tableWidthMm(plain));
  });
});
