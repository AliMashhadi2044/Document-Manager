import { describe, expect, it } from 'vitest';

import {
  CURRENCY_FORMAT,
  JALALI_FORMAT,
  TEXT_FORMAT,
  escapeHtml,
  evaluateCondition,
  evaluateExpression,
  formatValue,
  layoutReport,
  printableWidthMm,
  readPath,
  renderReportHtml,
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

  it('کمبود ردیف با ردیف خالی پر می‌شود', () => {
    const report = layoutReport(MINIMAL_TEMPLATE, datasetOf(rows));
    const table = report.body[0];
    if (table?.kind !== 'table') throw new Error('جدول ساخته نشد');
    expect(table.fildlerRowCount).toBe(2);
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
    allowedCollections: new Set(['document.vendorAggregates']),
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
      allowedCollections: new Set(['document.vendorAggregates']),
    });

    expect(problems.map((item) => item.message).join(' ')).toContain('بریده می‌شوند');
  });
});
