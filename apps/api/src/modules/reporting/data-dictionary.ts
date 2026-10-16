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
      money('grossAmount', 'مبلغ کالا'),
      money('discountAmount', 'تخفیف'),
      money('netAmount', 'خالص'),
      money('taxAmount', 'مالیات و عوارض'),
      money('totalAmount', 'جمع کل'),
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

export function allowedCollectionKeys(): Set<string> {
  return new Set(
    DATA_SOURCES.filter((source) => source.cardinality === 'list').map((source) => source.key),
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
    if (path.startsWith('row.')) continue;

    const source = DATA_SOURCE_BY_KEY.get(path) ?? findSourceOfValuePath(path);
    if (!source) {
      unknownPaths.push(path);
      continue;
    }
    for (const permission of source.requiredPermissions) permissions.add(permission);
  }

  return { permissions, unknownPaths };
}

function findSourceOfValuePath(path: string): DataSourceDefinition | undefined {
  const lastDot = path.lastIndexOf('.');
  if (lastDot <= 0) return undefined;

  const sourceKey = path.slice(0, lastDot);
  const fieldKey = path.slice(lastDot + 1);
  const source = DATA_SOURCE_BY_KEY.get(sourceKey);
  if (!source || source.cardinality !== 'single') return undefined;

  return source.fields.some((field) => field.key === fieldKey) ? source : undefined;
}
