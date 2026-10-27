import type { Permission } from '@dm/shared';

/**
 * Data Dictionary — تنها فهرست مسیرهای داده‌ای که یک قالب می‌تواند به آن‌ها اشاره کند
 * (docs/09 §۳).
 *
 * چرا منبع حقیقت **کد** است و نه جدول دیتابیس: این فهرست در عمل یک **مرز امنیتی** است.
 * اگر از دیتابیس می‌آمد، افزودن یک ردیف به آن جدول، سطح دسترسی قالب‌ها را بی‌آنکه کسی
 * در بازبینی کد ببیند گسترش می‌داد. اینجا هر مسیر تازه یک diff دارد.
 *
 * قاعده دوم: مجوز هر مسیر با **کاربر اجراکننده** سنجیده می‌شود، نه سازنده قالب. قالبی
 * که مدیر ساخته، وقتی ناظر اجرایش می‌کند فقط داده‌ای را می‌بیند که ناظر حق دیدنش را
 * دارد.
 */

export type FieldType = 'money' | 'integer' | 'text' | 'date' | 'jalaliDate' | 'boolean';

export interface FieldDefinition {
  readonly key: string;
  readonly titleFa: string;
  readonly type: FieldType;
  readonly requiredPermissions?: readonly Permission[];
}

export interface DataSourceDefinition {
  readonly key: string;
  readonly titleFa: string;
  readonly cardinality: 'single' | 'list';
  readonly requiredPermissions: readonly Permission[];
  readonly fields: readonly FieldDefinition[];
}

const text = (key: string, titleFa: string): FieldDefinition => ({ key, titleFa, type: 'text' });
const money = (key: string, titleFa: string): FieldDefinition => ({ key, titleFa, type: 'money' });

/** فیلدی که دیدنش مجوز «جزئیات محاسبه فاکتور» می‌خواهد. */
const calcDetail = (field: FieldDefinition): FieldDefinition => ({
  ...field,
  requiredPermissions: ['invoice:read_calc_details'],
});

/**
 * منابع دادهٔ فرم ریزهزینهٔ یک گروه بودجه.
 *
 * دو تا: فصل‌های آن گروه (ستون‌های فرم) و فاکتورهای آن گروه (ردیف‌های فرم).
 * ساخته می‌شوند و کپی نمی‌شوند، چون هر فیلدی که به یکی اضافه شود باید به دیگری هم
 * اضافه شود — و دو فهرستِ دستی دیر یا زود واگرا می‌شوند.
 */
function expenseSources(
  category: 'CAPITAL' | 'CURRENT',
  categoryTitle: string,
): DataSourceDefinition[] {
  const slug = category === 'CAPITAL' ? 'capital' : 'current';

  return [
    {
      key: `document.${slug}Chapters`,
      titleFa: `فصل‌های بودجه ${categoryTitle} (ستون‌های فرم ریزهزینه)`,
      cardinality: 'list',
      requiredPermissions: ['base_data:read', 'report:run'],
      fields: [
        text('key', 'کلید فصل'),
        text('title', 'عنوان فصل'),
        text('code', 'کد فصل'),
      ],
    },
    {
      key: `document.${slug}Expenses`,
      titleFa: `ریزهزینه‌های ${categoryTitle} سند`,
      cardinality: 'list',
      requiredPermissions: ['document:read', 'report:run'],
      /*
        فقط **جمع** هر فاکتور، نه ریز محاسبه‌اش.

        مرز `invoice:read_calc_details` دربارهٔ تجزیهٔ مبلغ است — کالا، تخفیف،
        مالیات — و نه دربارهٔ رقمی که روی فرمِ چاپی می‌نشیند. بایگانی همین فرم را
        چاپ می‌کند و آن مجوز را ندارد؛ آوردن ستون‌های محاسبه اینجا یعنی فرمی که
        نقشِ صاحبش نمی‌تواند بگیرد.
      */
      fields: [
        { key: 'index', titleFa: 'ردیف', type: 'integer' },
        text('invoiceId', 'شناسه فاکتور'),
        text('description', 'شرح'),
        text('chapterKey', 'کلید فصل'),
        text('chapterTitle', 'عنوان فصل'),
        text('chapterCode', 'کد فصل'),
        text('vendorName', 'فروشنده'),
        text('beneficiaryShare', 'سهم ذی‌نفع (FULL/PARTIAL/NONE)'),
        money('total', 'جمع'),
      ],
    },
  ];
}

export const DATA_SOURCES: readonly DataSourceDefinition[] = [
  {
    key: 'organization',
    titleFa: 'اطلاعات سازمان',
    cardinality: 'single',
    requiredPermissions: ['base_data:read'],
    fields: [
      text('name', 'نام سازمان'),
      text('economicCode', 'شماره اقتصادی'),
      text('addressLine', 'نشانی'),
      text('phone', 'تلفن'),
    ],
  },
  {
    key: 'document',
    titleFa: 'سند',
    cardinality: 'single',
    requiredPermissions: ['document:read'],
    fields: [
      text('title', 'شرح سند'),
      text('type', 'نوع سند'),
      text('status', 'وضعیت'),
      { key: 'fiscalYear', titleFa: 'سال مالی', type: 'integer' },
      { key: 'jalaliYear', titleFa: 'سال شمسی', type: 'integer' },
      text('documentNumber', 'شماره سند'),
      { key: 'documentDate', titleFa: 'تاریخ سند', type: 'date' },
      { key: 'documentDateJalali', titleFa: 'تاریخ سند (شمسی)', type: 'text' },
      text('buyerName', 'نام خریدار'),
      text('buyerEconomicCode', 'شماره اقتصادی خریدار'),
      money('totalGross', 'جمع مبلغ کالا'),
      money('totalDiscount', 'جمع تخفیف'),
      money('totalNet', 'جمع خالص'),
      money('totalTax', 'جمع مالیات و عوارض'),
      money('totalAmount', 'جمع کل'),
      { key: 'invoiceCount', titleFa: 'تعداد فاکتور', type: 'integer' },
    ],
  },
  {
    key: 'document.vendorAggregates',
    titleFa: 'تجمیع فروشندگان سند (گزارش مالیات)',
    cardinality: 'list',
    // دو مجوز با هم: دیدن سند، و حق اجرای گزارش.
    requiredPermissions: ['document:read', 'report:run'],
    fields: [
      { key: 'index', titleFa: 'ردیف', type: 'integer' },
      text('vendorId', 'شناسه فروشنده'),
      text('vendorName', 'طرف قرارداد (حقیقی/حقوقی)'),
      text('vendorIdentifier', 'کد ملی / شماره اقتصادی'),
      text('personType', 'نوع شخص'),
      text('representativeName', 'نام فروشنده (نماینده)'),
      text('address', 'نشانی'),
      text('phone', 'تلفن'),
      text('postalCode', 'کد پستی'),
      text('invoiceNumber', 'شماره صورتحساب'),
      { key: 'invoiceDate', titleFa: 'تاریخ صورتحساب', type: 'date' },
      { key: 'invoiceCount', titleFa: 'تعداد فاکتور', type: 'integer' },
      text('productTypeTitle', 'نوع کالا'),
      money('goodsAmount', 'مبلغ کالا'),
      money('discount', 'مبلغ تخفیف'),
      money('net', 'مبلغ خالص'),
      money('tax', 'عوارض و مالیات بر ارزش افزوده'),
      money('total', 'جمع کل'),
    ],
  },
  {
    key: 'document.beneficiaries',
    titleFa: 'مقصدهای پرداخت سند (شماره شبا ذینفعان)',
    cardinality: 'list',
    // همان دو مجوز تجمیع فروشنده: دیدن سند، و حق اجرای گزارش.
    requiredPermissions: ['document:read', 'report:run'],
    fields: [
      { key: 'index', titleFa: 'ردیف', type: 'integer' },
      text('key', 'کلید مقصد'),
      text('kind', 'نوع مقصد'),
      text('identifier', 'شماره شبا / شناسه'),
      text('secondaryIdentifier', 'شناسه پرداخت'),
      text('accountHolder', 'نام صاحب حساب'),
      text('bankTitle', 'نام بانک'),
      { key: 'invoiceCount', titleFa: 'تعداد فاکتور', type: 'integer' },
      money('total', 'جمع'),
    ],
  },
  /*
    فرم ریزهزینه: دو جفت منبع داده، یکی برای عمرانی و یکی برای جاری.

    چرا جفت و نه یک منبع با ستون «گروه»: قالب هیچ زبانِ فیلتری ندارد — و نباید
    داشته باشد. اگر یک منبع می‌داشتیم، فرمِ عمرانی ناچار بود ردیف‌های جاری را هم
    بگیرد و خودش کنار بگذارد؛ یعنی یک قاعدهٔ مالی داخل قالب، جایی که نه تست دارد
    نه بازبینی.

    هر گروه دو منبع دارد: **فصل‌ها** که ستون‌های فرم از آن ساخته می‌شوند، و
    **ردیف‌ها** که هر کدام یک فاکتورند.
  */
  ...expenseSources('CAPITAL', 'عمرانی'),
  ...expenseSources('CURRENT', 'جاری'),
  {
    key: 'document.invoices',
    titleFa: 'فاکتورهای سند',
    cardinality: 'list',
    requiredPermissions: ['document:read'],
    fields: [
      { key: 'index', titleFa: 'ردیف', type: 'integer' },
      text('invoiceNumber', 'شماره صورتحساب'),
      { key: 'invoiceDate', titleFa: 'تاریخ صورتحساب', type: 'date' },
      text('invoiceKind', 'نوع فاکتور'),
      text('chapterTitle', 'فصل'),
      text('vendorName', 'فروشنده'),
      /*
       * مبالغ **تک‌تک فاکتورها** جزئیات محاسبه‌اند، نه خلاصه سند: همان چیزی که مجوز
       * `invoice:read_calc_details` درباره‌اش است. گزارش تجمیعی فروشنده‌ها (که بایگانی
       * برای چاپ لازمش دارد) این مجوز را نمی‌خواهد، ولی ریزِ هر فاکتور می‌خواهد.
       */
      calcDetail(money('grossAmount', 'مبلغ کالا')),
      calcDetail(money('discountAmount', 'تخفیف')),
      calcDetail(money('netAmount', 'خالص')),
      calcDetail(money('taxAmount', 'مالیات و عوارض')),
      calcDetail(money('totalAmount', 'جمع کل')),
    ],
  },
];

export const DATA_SOURCE_BY_KEY: ReadonlyMap<string, DataSourceDefinition> = new Map(
  DATA_SOURCES.map((source) => [source.key, source]),
);

/** مسیرهای تکی مجاز، به شکل `source.field`. */
export function allowedValuePaths(): Set<string> {
  const paths = new Set<string>();
  for (const source of DATA_SOURCES) {
    if (source.cardinality !== 'single') continue;
    for (const field of source.fields) paths.add(`${source.key}.${field.key}`);
  }
  return paths;
}

/**
 * مجموعه‌های مجاز و نام ستون‌های هر مجموعه.
 *
 * نام ستون‌ها هم برمی‌گردد چون اعتبارسنجی قالب، مسیرهای `row.*` را در دامنه جدول
 * می‌سنجد: `row.total` تنها وقتی معتبر است که منبع داده همان جدول ستونی به نام
 * `total` داشته باشد.
 */
export function collectionFields(): Map<string, Set<string>> {
  return new Map(
    DATA_SOURCES.filter((source) => source.cardinality === 'list').map((source) => [
      source.key,
      new Set(source.fields.map((field) => field.key)),
    ]),
  );
}

/**
 * مجوزهای لازم برای مجموعه‌ای از مسیرها.
 *
 * مسیر ناشناخته **خطا** است، نه «نادیده گرفته می‌شود»: اگر قالبی به مسیری اشاره کند
 * که نمی‌شناسیم، اجرا نباید ادامه پیدا کند.
 */
export function permissionsForPaths(paths: Iterable<string>): {
  readonly permissions: Set<Permission>;
  readonly unknownPaths: string[];
} {
  const permissions = new Set<Permission>();
  const unknownPaths: string[] = [];

  for (const path of paths) {
    // مسیر مجموعه، بدون فیلد: مجوز خودِ منبع.
    const whole = DATA_SOURCE_BY_KEY.get(path);
    if (whole) {
      for (const permission of whole.requiredPermissions) permissions.add(permission);
      continue;
    }

    const resolved = resolveFieldPath(path);
    if (!resolved) {
      unknownPaths.push(path);
      continue;
    }

    for (const permission of resolved.source.requiredPermissions) permissions.add(permission);
    /*
     * مجوز **فیلد**، نه فقط منبع.
     *
     * `requiredPermissions` روی فیلد از همان ابتدا در تایپ بود ولی هیچ‌جا خوانده
     * نمی‌شد — یعنی اعلامش هیچ اثری نداشت. ستونی که جزئیات محاسبه یک فاکتور را نشان
     * می‌دهد با ستونی که جمع سند را نشان می‌دهد یک سطح دسترسی نمی‌خواهد، و بدون این
     * حلقه، قالبی که مدیر ساخته بود همان ریز محاسبات را به نقشی نشان می‌داد که حق
     * دیدنش را ندارد.
     */
    for (const permission of resolved.field.requiredPermissions ?? []) {
      permissions.add(permission);
    }
  }

  return { permissions, unknownPaths };
}

/**
 * تجزیه یک مسیر `source.field` به منبع و فیلدش.
 *
 * برای مجموعه‌ها هم کار می‌کند: لایه اجرا مسیرهای `row.x` را پیش از این بررسی، با
 * کلید منبع دادهٔ همان جدول **کامل** می‌کند (`document.invoices.taxAmount`)، وگرنه
 * نمی‌شد فهمید `row.taxAmount` به کدام مجموعه است.
 */
function resolveFieldPath(
  path: string,
): { source: DataSourceDefinition; field: FieldDefinition } | undefined {
  const lastDot = path.lastIndexOf('.');
  if (lastDot <= 0) return undefined;

  const source = DATA_SOURCE_BY_KEY.get(path.slice(0, lastDot));
  if (!source) return undefined;

  const field = source.fields.find((item) => item.key === path.slice(lastDot + 1));
  return field ? { source, field } : undefined;
}
