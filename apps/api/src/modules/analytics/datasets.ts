import {
  OPERATORS_BY_TYPE,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_KIND_LABELS,
  PAYMENT_SETTLEMENT_LABELS,
  PAYMENT_SETTLEMENT_STATUSES,
  type FilterOperator,
  type Permission,
  type ReportFieldType,
} from '@dm/shared';

/**
 * فهرست مجموعه‌داده‌های گزارش‌گیری عمومی (فاز ۸).
 *
 * این فایل همان نقشی را برای گزارش‌گیری دارد که `data-dictionary.ts` برای موتور
 * گزارش: **تنها** فهرست چیزهایی که قابل خواستن‌اند. منبع حقیقتش کد است، نه جدول
 * دیتابیس، چون در عمل یک مرز امنیتی است — افزودن یک ردیف به جدول می‌توانست سطح
 * دسترسی گزارش‌ها را بی‌آنکه کسی در بازبینی کد ببیند گسترش دهد.
 *
 * هر فیلد سه چیز را اعلام می‌کند و هر سه در سرور اعمال می‌شوند:
 *
 *  - `path`: مسیر Prisma که این کلید به آن نگاشته می‌شود. کلید عمومی (`vendorName`)
 *    از مسیر داخلی (`vendorSnapshot.name`) جداست، پس تغییر ساختار دیتابیس، قالب‌های
 *    ذخیره‌شده کاربران را خراب نمی‌کند.
 *  - `type`: عملگرهای مجاز از آن مشتق می‌شوند.
 *  - `requiredPermissions`: مجوز **سطح فیلد**. ستونی که کاربر مجوزش را ندارد نه در
 *    فهرست می‌آید، نه در فیلتر پذیرفته می‌شود و نه در خروجی می‌نشیند.
 */

export interface ReportFieldDefinition {
  readonly key: string;
  readonly titleFa: string;
  readonly type: ReportFieldType;
  /** مسیر Prisma؛ نقطه‌ها رابطه‌های یک‌به‌یک را باز می‌کنند. */
  readonly path: string;
  readonly filterable?: boolean;
  readonly sortable?: boolean;
  /** گزینه‌های enum، برای ساختن فهرست در فیلترساز. */
  readonly enumValues?: readonly { readonly value: string; readonly label: string }[];
  readonly requiredPermissions?: readonly Permission[];
  /** عرض پیشنهادی ستون در Excel (نویسه). */
  readonly width?: number;
  /**
   * شرط شمارش، فقط برای مسیرهای `_count.*`.
   *
   * `_count` بیرون از `where` کوئری است، پس دامنهٔ سند به آن نمی‌رسد؛ بدون این،
   * «تعداد فاکتور» فروشنده، فاکتورهای سندهای **در سطل زباله** را هم می‌شمرد.
   */
  readonly countWhere?: Record<string, unknown>;
  /**
   * گزینه‌های فیلتر از **خودِ داده**، نه از اطلاعات پایهٔ امروز.
   *
   * برای ستون‌های snapshot، فهرست گرفتن از جدول پایه غلط است: اگر نام مدرسه‌ای عوض
   * شده باشد، ردیف‌های قدیمی نام قبلی را نگه داشته‌اند و با گزینهٔ امروز هیچ‌وقت
   * برابر نمی‌شوند — کاربر یک فهرست مرتب می‌بیند که بعضی سطرها را پیدا نمی‌کند.
   * پس گزینه‌ها «مقدارهای یکتایی که واقعاً در داده هست» است، با همان دامنهٔ دسترسی
   * کاربر.
   */
  readonly optionsFrom?: {
    readonly model: 'invoiceUtilityDetail';
    readonly column: string;
    /** مسیر رابطه از آن مدل تا سند، برای اعمال دامنه دسترسی. */
    readonly documentPath: string;
  };
}

/**
 * نشان رابطهٔ **یک‌به‌چند** در مسیر.
 *
 * شرح ردیف‌های یک فاکتور چند تاست، نه یکی؛ و فاکتورهای یک سند هم. مسیر خودش
 * می‌گوید کجا از یکی به چند می‌رود — `items[].description`،
 * `invoices[].utilityDetail.schoolTitleSnapshot` — به‌جای یک پرچم بولی که فقط
 * «آخرین پرش» را می‌توانست بگوید و برای مسیرهای دوپله کم می‌آورد.
 *
 * فیلتر چنین فیلدی یعنی «**دست‌کم یکی**»، ستونش همهٔ مقدارها را با «، » کنار هم
 * می‌گذارد، و مرتب‌سازی رویش معنا ندارد و بسته است.
 */
export const LIST_MARKER = '[]';

export function hasListHop(path: string): boolean {
  return path.includes(LIST_MARKER);
}

/** مسیر بدون نشان — همان چیزی که `select` و پیمایش نتیجه با آن کار می‌کنند. */
export function plainPath(path: string): string {
  return path.replaceAll(LIST_MARKER, '');
}

/**
 * مسیر را از **اولین** پرش یک‌به‌چند دو تکه می‌کند.
 *
 * تکهٔ اول تا و شاملِ خودِ رابطه است و تکهٔ دوم بقیه‌اش؛ `null` یعنی مسیر هیچ پرش
 * یک‌به‌چندی ندارد.
 */
export function splitListPath(path: string): { before: string; after: string } | null {
  const segments = path.split('.');
  const index = segments.findIndex((segment) => segment.endsWith(LIST_MARKER));
  if (index === -1) return null;

  return {
    before: segments
      .slice(0, index + 1)
      .map((segment) => segment.replace(LIST_MARKER, ''))
      .join('.'),
    /*
      بقیهٔ مسیر **با نشان‌هایش** برمی‌گردد.

      پاک کردنشان اینجا یعنی پرش یک‌به‌چندِ دوم گم می‌شود و شرطِ
      `invoices[].items[].description` به `{ invoices: { some: { items: {
      description } } } }` تبدیل می‌شد — شرطی که پریزما نمی‌شناسد.
    */
    after: segments.slice(index + 1).join('.'),
  };
}

export type DatasetKind = 'rows' | 'grouped';

export interface DatasetDefinition {
  readonly key: string;
  readonly titleFa: string;
  readonly description: string;
  readonly kind: DatasetKind;
  /** مدل Prisma که کوئری رویش اجرا می‌شود. */
  readonly model:
    | 'financialDocument'
    | 'invoice'
    | 'vendor'
    | 'invoicePayment'
    | 'archiveMetadata'
    | 'reviewFeedback'
    | 'auditLog';
  readonly requiredPermissions: readonly Permission[];
  readonly fields: readonly ReportFieldDefinition[];
  readonly defaultColumns: readonly string[];
  readonly defaultSort: readonly { readonly field: string; readonly dir: 'asc' | 'desc' }[];
  /** ابعاد مجاز گروه‌بندی — فقط برای مجموعه‌داده تجمیعی. */
  readonly groupBy?: readonly { readonly key: string; readonly titleFa: string }[];
  /**
   * آیا دامنه دسترسی سند روی این مجموعه‌داده اعمال می‌شود؟
   *
   * هر مجموعه‌داده‌ای که ریشه‌اش سند است (یا به سند می‌رسد) باید همان شرط کوئری
   * `DocumentAccessService` را بگیرد، وگرنه گزارش‌گیری یک راه دور زدن دامنه نقش
   * می‌شد: چیزی که در فهرست اسناد دیده نمی‌شود، نباید در گزارش دیده شود.
   */
  readonly documentScope: 'root' | 'relation' | 'none';
  /** مسیر رابطه به سند، وقتی `documentScope === 'relation'`. */
  readonly documentPath?: string;
  /**
   * شرط ثابت این مجموعه‌داده — همیشه اعمال می‌شود و فیلتر کاربر بازش نمی‌کند.
   *
   * گزارش «انشعابات» همان مدل فاکتور را می‌خواند ولی فقط فاکتورهای انشعابات را؛
   * گذاشتن این شرط در تعریف، یعنی هیچ مسیری در سرور — جدول، خروجی، شمارش — نمی‌تواند
   * فراموشش کند.
   */
  readonly baseWhere?: Record<string, unknown>;
}

const DOCUMENT_STATUS_VALUES = [
  { value: 'DRAFT', label: 'پیش‌نویس' },
  { value: 'FINALIZED', label: 'ثبت نهایی' },
  { value: 'PENDING_ARCHIVE', label: 'در انتظار بایگانی' },
  { value: 'ARCHIVED', label: 'بایگانی‌شده' },
  { value: 'NEEDS_REVISION', label: 'نیازمند اصلاح' },
] as const;

const DOCUMENT_TYPE_VALUES = [
  { value: 'NORMAL', label: 'عادی' },
  { value: 'STAD', label: 'ستاد' },
] as const;

const INVOICE_KIND_VALUES = [
  { value: 'NORMAL', label: 'عادی' },
  { value: 'UTILITY', label: 'انشعابات' },
  { value: 'FUEL', label: 'سوخت' },
] as const;

const BUDGET_CATEGORY_VALUES = [
  { value: 'CURRENT', label: 'جاری' },
  { value: 'CAPITAL', label: 'عمرانی' },
] as const;

const PERSON_TYPE_VALUES = [
  { value: 'LEGAL', label: 'حقوقی' },
  { value: 'NATURAL', label: 'حقیقی' },
] as const;

/*
  برچسب روش پرداخت از `@dm/shared` می‌آید، نه از فهرستی که اینجا نوشته شود.

  نسخهٔ دستیِ قبلی از enum واقعی جا مانده بود — `BANK_TRANSFER` و `OTHER` را داشت
  که وجود ندارند، و `BENEFICIARY_ACCOUNT` را نداشت که وجود دارد. نتیجه این بود که
  ستون «روش پرداخت» در خروجی، کلید انگلیسی دیتابیس را چاپ می‌کرد.
*/
const PAYMENT_KIND_VALUES = PAYMENT_METHOD_KINDS.map((kind) => ({
  value: kind,
  label: PAYMENT_METHOD_KIND_LABELS[kind],
}));

const PAYMENT_SETTLEMENT_VALUES = PAYMENT_SETTLEMENT_STATUSES.map((status) => ({
  value: status,
  label: PAYMENT_SETTLEMENT_LABELS[status],
}));

const FEEDBACK_STATUS_VALUES = [
  { value: 'OPEN', label: 'باز' },
  { value: 'ANSWERED', label: 'پاسخ داده‌شده' },
  { value: 'RESOLVED', label: 'رسیدگی‌شده' },
  { value: 'REJECTED', label: 'رد‌شده' },
] as const;

const ARCHIVE_STATUS_VALUES = [
  { value: 'RECEIVED', label: 'دریافت‌شده' },
  { value: 'IN_PROGRESS', label: 'در جریان' },
  { value: 'COMPLETED', label: 'تکمیل‌شده' },
] as const;

/** مبالغ سند: پنج ستون که همیشه با هم می‌آیند. */
function documentMoneyFields(prefix = ''): ReportFieldDefinition[] {
  const at = (path: string): string => (prefix === '' ? path : `${prefix}.${path}`);
  return [
    { key: 'totalGross', titleFa: 'جمع مبلغ کالا', type: 'money', path: at('totalGross') },
    { key: 'totalDiscount', titleFa: 'جمع تخفیف', type: 'money', path: at('totalDiscount') },
    { key: 'totalNet', titleFa: 'جمع خالص', type: 'money', path: at('totalNet') },
    { key: 'totalTax', titleFa: 'جمع مالیات و عوارض', type: 'money', path: at('totalTax') },
    { key: 'totalAmount', titleFa: 'جمع کل', type: 'money', path: at('totalAmount') },
  ];
}

const DOCUMENTS: DatasetDefinition = {
  key: 'documents',
  titleFa: 'اسناد',
  description: 'یک ردیف برای هر سند مالی، با جمع‌های ذخیره‌شده و وضعیت گردش کار.',
  kind: 'rows',
  model: 'financialDocument',
  requiredPermissions: ['document:read'],
  documentScope: 'root',
  defaultColumns: ['title', 'type', 'status', 'fiscalYear', 'documentNumber', 'totalAmount'],
  defaultSort: [{ field: 'createdAt', dir: 'desc' }],
  fields: [
    { key: 'id', titleFa: 'شناسه', type: 'uuid', path: 'id', filterable: false, sortable: false },
    { key: 'title', titleFa: 'شرح سند', type: 'text', path: 'title', width: 40 },
    {
      key: 'type',
      titleFa: 'نوع سند',
      type: 'enum',
      path: 'type',
      enumValues: DOCUMENT_TYPE_VALUES,
    },
    {
      key: 'status',
      titleFa: 'وضعیت',
      type: 'enum',
      path: 'status',
      enumValues: DOCUMENT_STATUS_VALUES,
    },
    { key: 'fiscalYear', titleFa: 'سال مالی', type: 'integer', path: 'fiscalYear' },
    { key: 'jalaliYear', titleFa: 'سال شمسی', type: 'integer', path: 'jalaliYear' },
    { key: 'documentNumber', titleFa: 'شماره سند', type: 'text', path: 'documentNumber' },
    { key: 'documentDate', titleFa: 'تاریخ سند', type: 'jalaliDate', path: 'documentDate' },
    // گردش، هر دو نوع سند را دارد — نه فقط ستاد.
    { key: 'workflowNumber', titleFa: 'شماره گردش', type: 'text', path: 'workflowNumber' },
    { key: 'workflowDate', titleFa: 'تاریخ گردش', type: 'jalaliDate', path: 'workflowDate' },
    { key: 'buyerName', titleFa: 'خریدار', type: 'text', path: 'buyerSnapshot.name', width: 30 },
    {
      key: 'buyerEconomicCode',
      titleFa: 'شماره اقتصادی خریدار',
      type: 'text',
      path: 'buyerSnapshot.economicCode',
    },
    {
      key: 'buyerNationalId',
      titleFa: 'کد ملی خریدار',
      type: 'text',
      path: 'buyerSnapshot.nationalId',
    },
    { key: 'buyerPhone', titleFa: 'تلفن خریدار', type: 'text', path: 'buyerSnapshot.phone' },
    {
      key: 'buyerPostalCode',
      titleFa: 'کد پستی خریدار',
      type: 'text',
      path: 'buyerSnapshot.postalCode',
    },
    {
      key: 'buyerAddress',
      titleFa: 'نشانی خریدار',
      type: 'text',
      path: 'buyerSnapshot.addressLine',
      width: 40,
    },

    /*
      اطلاعات ستاد.

      فقط سند ستاد این‌ها را دارد و بقیه خالی‌اند — همان‌طور که باید. «شماره نیاز»
      اختیاری است (سند ممکن است پیش از گرفتنش ثبت شود)، پس «خالی است» رویش معنای
      واقعی دارد.
    */
    { key: 'needNumber', titleFa: 'شماره نیاز (ستاد)', type: 'text', path: 'stadMetadata.needNumber' },
    {
      key: 'requestNumber',
      titleFa: 'شماره درخواست (ستاد)',
      type: 'text',
      path: 'stadMetadata.requestNumber',
    },
    {
      key: 'requestTypeTitle',
      titleFa: 'نوع درخواست (ستاد)',
      type: 'text',
      path: 'stadMetadata.requestType.title',
    },
    {
      key: 'stadNotes',
      titleFa: 'یادداشت ستاد',
      type: 'text',
      path: 'stadMetadata.notes',
      width: 40,
    },

    ...documentMoneyFields(),
    {
      key: 'openFeedbackCount',
      titleFa: 'بازخورد باز',
      type: 'integer',
      path: 'openFeedbackCount',
    },
    { key: 'createdByName', titleFa: 'ایجادکننده', type: 'text', path: 'createdBy.fullName' },
    /*
      ثبت‌کنندهٔ نهایی، فقط به‌صورت **شناسه**.

      `finalized_by_id` رابطهٔ پریزما ندارد (و کلید خارجی هم ندارد)، پس نامش را
      نمی‌شود از همین‌جا خواند. ساختن آن رابطه یک مهاجرت است و کار این پاس نبود؛
      برای دیدن نام، گزارش «فعالیت کاربران» همان رویداد را با نام کاربر دارد.
    */
    { key: 'finalizedById', titleFa: 'شناسهٔ ثبت‌کنندهٔ نهایی', type: 'uuid', path: 'finalizedById' },
    { key: 'createdAt', titleFa: 'تاریخ ایجاد', type: 'jalaliDate', path: 'createdAt' },
    { key: 'updatedAt', titleFa: 'آخرین تغییر', type: 'jalaliDate', path: 'updatedAt' },
    { key: 'finalizedAt', titleFa: 'تاریخ ثبت نهایی', type: 'jalaliDate', path: 'finalizedAt' },
    { key: 'archivedAt', titleFa: 'تاریخ بایگانی', type: 'jalaliDate', path: 'archivedAt' },

    // وضعیت بایگانی، از همان ردیفی که گزارش «بایگانی» رویش می‌دود.
    {
      key: 'archiveStatus',
      titleFa: 'وضعیت بایگانی',
      type: 'enum',
      path: 'archiveMetadata.status',
      enumValues: ARCHIVE_STATUS_VALUES,
    },
    {
      key: 'archiveNotes',
      titleFa: 'یادداشت بایگانی',
      type: 'text',
      path: 'archiveMetadata.notes',
      width: 40,
    },

    /*
      وضعیت پرداخت.

      مقدار خالیِ این ستون معنا دارد و «صفر» نیست: یعنی بایگان هنوز تعیین نکرده.
      در فیلتر، عملگر «خالی است» همین حالت را می‌گیرد.
    */
    {
      key: 'paymentStatus',
      titleFa: 'وضعیت پرداخت',
      type: 'enum',
      path: 'paymentStatus',
      enumValues: PAYMENT_SETTLEMENT_VALUES,
    },
    { key: 'paidAmount', titleFa: 'مبلغ پرداخت‌شده', type: 'money', path: 'paidAmount' },
    { key: 'outstandingAmount', titleFa: 'مبلغ شناسایی', type: 'money', path: 'outstandingAmount' },
    { key: 'paymentDate', titleFa: 'تاریخ پرداخت', type: 'jalaliDate', path: 'paymentDate' },
    {
      key: 'paymentStatusByName',
      titleFa: 'ثبت‌کنندهٔ وضعیت پرداخت',
      type: 'text',
      path: 'paymentStatusBy.fullName',
    },
    { key: 'paymentStatusAt', titleFa: 'تاریخ ثبت وضعیت پرداخت', type: 'jalaliDate', path: 'paymentStatusAt' },

    ...invoiceDerivedFields('invoices[].'),
  ],
};

const INVOICES: DatasetDefinition = {
  key: 'invoices',
  titleFa: 'فاکتورها',
  description: 'یک ردیف برای هر فاکتور، با مبالغ و فروشنده و فصل بودجه.',
  kind: 'rows',
  model: 'invoice',
  requiredPermissions: ['document:read'],
  documentScope: 'relation',
  documentPath: 'document',
  defaultColumns: [
    'documentTitle',
    'chapterTitle',
    'vendorName',
    'invoiceNumber',
    'invoiceDate',
    'totalAmount',
  ],
  defaultSort: [{ field: 'invoiceDate', dir: 'desc' }],
  fields: [
    { key: 'id', titleFa: 'شناسه', type: 'uuid', path: 'id', filterable: false, sortable: false },
    { key: 'documentTitle', titleFa: 'سند', type: 'text', path: 'document.title', width: 35 },
    {
      key: 'documentNumber',
      titleFa: 'شماره سند',
      type: 'text',
      path: 'document.documentNumber',
    },
    {
      key: 'documentType',
      titleFa: 'نوع سند',
      type: 'enum',
      path: 'document.type',
      enumValues: DOCUMENT_TYPE_VALUES,
    },
    {
      key: 'documentStatus',
      titleFa: 'وضعیت سند',
      type: 'enum',
      path: 'document.status',
      enumValues: DOCUMENT_STATUS_VALUES,
    },
    {
      key: 'documentPaymentStatus',
      titleFa: 'وضعیت پرداخت سند',
      type: 'enum',
      path: 'document.paymentStatus',
      enumValues: PAYMENT_SETTLEMENT_VALUES,
    },
    { key: 'fiscalYear', titleFa: 'سال مالی', type: 'integer', path: 'document.fiscalYear' },
    {
      key: 'invoiceKind',
      titleFa: 'نوع فاکتور',
      type: 'enum',
      path: 'invoiceKind',
      enumValues: INVOICE_KIND_VALUES,
    },
    {
      key: 'description',
      titleFa: 'شرح فاکتور',
      type: 'text',
      path: 'description',
      width: 35,
    },
    { key: 'notes', titleFa: 'یادداشت فاکتور', type: 'text', path: 'notes', width: 40 },
    { key: 'invoiceTypeTitle', titleFa: 'عنوان نوع فاکتور', type: 'text', path: 'invoiceType.titleFa' },
    {
      key: 'budgetCategory',
      titleFa: 'گروه بودجه',
      type: 'enum',
      path: 'chapter.category.key',
      enumValues: BUDGET_CATEGORY_VALUES,
    },
    { key: 'chapterTitle', titleFa: 'فصل بودجه', type: 'text', path: 'chapterTitleSnapshot', width: 25 },
    { key: 'chapterCode', titleFa: 'کد فصل', type: 'text', path: 'chapterCodeSnapshot' },
    { key: 'vendorName', titleFa: 'فروشنده', type: 'text', path: 'vendorSnapshot.name', width: 30 },
    {
      key: 'vendorPersonType',
      titleFa: 'نوع شخص فروشنده',
      type: 'enum',
      path: 'vendorSnapshot.personType',
      enumValues: PERSON_TYPE_VALUES,
    },
    {
      key: 'vendorRepresentative',
      titleFa: 'نمایندهٔ فروشنده',
      type: 'text',
      path: 'vendorSnapshot.representativeName',
    },
    {
      key: 'vendorEconomicCode',
      titleFa: 'شماره اقتصادی فروشنده',
      type: 'text',
      path: 'vendorSnapshot.economicCode',
    },
    {
      key: 'vendorNationalId',
      titleFa: 'کد ملی فروشنده',
      type: 'text',
      path: 'vendorSnapshot.nationalId',
    },
    { key: 'vendorPhone', titleFa: 'تلفن فروشنده', type: 'text', path: 'vendorSnapshot.phone' },
    {
      key: 'vendorPostalCode',
      titleFa: 'کد پستی فروشنده',
      type: 'text',
      path: 'vendorSnapshot.postalCode',
    },
    {
      key: 'vendorAddress',
      titleFa: 'نشانی فروشنده',
      type: 'text',
      path: 'vendorSnapshot.addressLine',
      width: 40,
    },
    { key: 'invoiceNumber', titleFa: 'شماره صورتحساب', type: 'text', path: 'invoiceNumber' },
    { key: 'invoiceDate', titleFa: 'تاریخ صورتحساب', type: 'jalaliDate', path: 'invoiceDate' },
    /*
     * مبالغ تک‌تک فاکتورها جزئیات محاسبه‌اند — همان قاعده‌ای که فاز ۷ در Data
     * Dictionary موتور گزارش گذاشت. بایگانی که مجوزش را ندارد، این ستون‌ها را نه
     * می‌بیند و نه می‌تواند رویشان فیلتر بگذارد.
     */
    {
      key: 'grossAmount',
      titleFa: 'مبلغ کالا',
      type: 'money',
      path: 'grossAmount',
      requiredPermissions: ['invoice:read_calc_details'],
    },
    {
      key: 'discountAmount',
      titleFa: 'تخفیف',
      type: 'money',
      path: 'discountAmount',
      requiredPermissions: ['invoice:read_calc_details'],
    },
    {
      key: 'netAmount',
      titleFa: 'خالص',
      type: 'money',
      path: 'netAmount',
      requiredPermissions: ['invoice:read_calc_details'],
    },
    {
      key: 'taxAmount',
      titleFa: 'مالیات و عوارض',
      type: 'money',
      path: 'taxAmount',
      requiredPermissions: ['invoice:read_calc_details'],
    },
    { key: 'totalAmount', titleFa: 'جمع کل', type: 'money', path: 'totalAmount' },
    /*
      شرح ردیف‌ها.

      «شرح فاکتور» اختیاری است و اغلب خالی می‌ماند؛ چیزی که کاربر واقعاً نوشته،
      شرح تک‌تک ردیف‌هاست. جست‌وجو روی ستونی که معمولاً خالی است، جست‌وجویی است که
      کار نمی‌کند — و دقیقاً همین شکایت را ساخت.
    */
    {
      key: 'itemDescriptions',
      titleFa: 'شرح ردیف‌ها',
      type: 'text',
      path: 'items[].description',
      sortable: false,
      width: 45,
    },
    {
      key: 'itemProductCodes',
      titleFa: 'کد کالای ردیف‌ها',
      type: 'text',
      path: 'items[].productCode',
      sortable: false,
    },

    /*
      پرداخت فاکتور.

      همان ستون‌های گزارش «پرداخت‌ها»، اینجا کنار خودِ فاکتور: کسی که دنبال
      «فاکتورهای فلان شبا» است نباید مجبور شود گزارش دیگری باز کند.
    */
    {
      key: 'paymentMethodKind',
      titleFa: 'روش پرداخت',
      type: 'enum',
      path: 'payment.methodKind',
      enumValues: PAYMENT_KIND_VALUES,
    },
    { key: 'paymentIban', titleFa: 'شبای پرداخت', type: 'text', path: 'payment.ibanSnapshot' },
    {
      key: 'paymentBankTitle',
      titleFa: 'بانک پرداخت',
      type: 'text',
      path: 'payment.bankTitleSnapshot',
    },
    {
      key: 'paymentIdentifier',
      titleFa: 'شناسه پرداخت',
      type: 'text',
      path: 'payment.paymentIdentifier',
    },
    { key: 'billIdentifier', titleFa: 'شناسه قبض', type: 'text', path: 'payment.billIdentifier' },
    { key: 'payeeName', titleFa: 'نام صاحب حساب قبض', type: 'text', path: 'payment.payeeName' },
    {
      key: 'pettyCashHolderName',
      titleFa: 'تنخواه‌دار',
      type: 'text',
      path: 'payment.pettyCashHolderNameSnapshot',
    },

    /*
      شرح این ردیف روی فرم ریزهزینه.

      دو منبع دارد — نوع کالا یا متن آزاد — و هر دو فیلترشدنی‌اند؛ خالی بودن هر دو
      یعنی ستون شرح، پیش‌فرضش (شرح خودِ فاکتور) را نشان می‌دهد.
    */
    {
      key: 'reportLineProductType',
      titleFa: 'شرح فرم ریزهزینه (نوع کالا)',
      type: 'text',
      path: 'reportTitle.productType.title',
    },
    {
      key: 'reportLineCustomTitle',
      titleFa: 'شرح فرم ریزهزینه (متن)',
      type: 'text',
      path: 'reportTitle.customTitle',
      width: 40,
    },

    /*
      جزئیات اختصاصی: انشعابات و سوخت.

      هر فاکتور حداکثر یکی از این دو را دارد، پس بقیهٔ ستون‌ها برایش خالی‌اند —
      همان‌طور که باید. مقدارها از **snapshot** خوانده می‌شوند و نه از اطلاعات
      پایهٔ امروز: گزارشِ یک سند ثبت‌شده باید همان نامی را بدهد که روز ثبت داشت.
    */
    {
      key: 'schoolTitle',
      titleFa: 'مدرسه (انشعابات)',
      type: 'text',
      path: 'utilityDetail.schoolTitleSnapshot',
      width: 30,
    },
    {
      key: 'districtTitle',
      titleFa: 'ناحیه (انشعابات)',
      type: 'text',
      path: 'utilityDetail.districtTitleSnapshot',
    },
    {
      key: 'utilityTypeTitle',
      titleFa: 'نوع انشعاب',
      type: 'text',
      path: 'utilityDetail.utilityTypeTitleSnapshot',
    },
    {
      key: 'vehiclePlate',
      titleFa: 'پلاک خودرو (سوخت)',
      type: 'text',
      path: 'fuelDetail.plateNumberSnapshot',
    },
    {
      key: 'vehicleTypeTitle',
      titleFa: 'نوع خودرو (سوخت)',
      type: 'text',
      path: 'fuelDetail.vehicleTypeTitleSnapshot',
    },
    {
      key: 'fuelTypeTitle',
      titleFa: 'نوع سوخت',
      type: 'text',
      path: 'fuelDetail.fuelTypeTitleSnapshot',
    },
    {
      key: 'fuelJalaliYear',
      titleFa: 'سال شمسی سوخت',
      type: 'integer',
      path: 'fuelDetail.jalaliYear',
    },
    {
      key: 'fuelJalaliMonth',
      titleFa: 'ماه شمسی سوخت',
      type: 'integer',
      path: 'fuelDetail.jalaliMonth',
    },

    { key: 'createdByName', titleFa: 'ثبت‌کننده', type: 'text', path: 'createdBy.fullName' },
    { key: 'createdAt', titleFa: 'تاریخ ثبت', type: 'jalaliDate', path: 'createdAt' },
    { key: 'updatedAt', titleFa: 'آخرین تغییر', type: 'jalaliDate', path: 'updatedAt' },
  ],
};

/**
 * آنچه سند از **فاکتورهایش** به ارث می‌برد.
 *
 * پرسش واقعی کاربر «کدام سند؟» است و نه «کدام فاکتور؟»: «سندی که قبض فلان مدرسه
 * در آن است»، «سندی که فلان فروشنده در آن فاکتور دارد». بدون این‌ها، چنین
 * جست‌وجویی فقط در گزارش فاکتورها ممکن بود و کاربر باید خودش از ردیف فاکتور به
 * سند می‌رسید.
 *
 * `[]` در مسیر یعنی پرش یک‌به‌چند: فیلتر به «**دست‌کم یکی** از فاکتورها» تبدیل
 * می‌شود و ستون، مقدارهای یکتا را کنار هم می‌گذارد. مرتب‌سازی رویشان بسته است —
 * یک سند چند مقدار دارد و «ترتیب» میانشان معنا ندارد.
 */
function invoiceDerivedFields(prefix: string): ReportFieldDefinition[] {
  const at = (path: string): string => `${prefix}${path}`;

  return [
    {
      key: 'invoiceVendorName',
      titleFa: 'فروشندهٔ فاکتورها',
      type: 'text',
      path: at('vendorSnapshot.name'),
      sortable: false,
      width: 35,
    },
    {
      key: 'invoiceVendorIdentifier',
      titleFa: 'شماره اقتصادی / کد ملی فروشنده',
      type: 'text',
      path: at('vendorSnapshot.economicCode'),
      sortable: false,
    },
    {
      key: 'invoiceKinds',
      titleFa: 'نوع فاکتورها',
      type: 'enum',
      path: at('invoiceKind'),
      enumValues: INVOICE_KIND_VALUES,
      sortable: false,
    },
    {
      key: 'budgetCategory',
      titleFa: 'گروه بودجه',
      type: 'enum',
      path: at('chapter.category.key'),
      enumValues: BUDGET_CATEGORY_VALUES,
      sortable: false,
    },
    {
      key: 'invoiceChapterTitle',
      titleFa: 'فصل بودجهٔ فاکتورها',
      type: 'text',
      path: at('chapterTitleSnapshot'),
      sortable: false,
      width: 30,
    },
    {
      key: 'invoiceNumbers',
      titleFa: 'شماره صورتحساب فاکتورها',
      type: 'text',
      path: at('invoiceNumber'),
      sortable: false,
    },
    {
      key: 'invoiceDescriptions',
      titleFa: 'شرح فاکتورها',
      type: 'text',
      path: at('description'),
      sortable: false,
      width: 45,
    },
    {
      key: 'itemDescriptions',
      titleFa: 'شرح ردیف فاکتورها',
      type: 'text',
      path: at('items[].description'),
      sortable: false,
      width: 45,
    },
    {
      key: 'schoolTitle',
      titleFa: 'مدرسه (انشعابات)',
      type: 'text',
      path: at('utilityDetail.schoolTitleSnapshot'),
      sortable: false,
      width: 30,
    },
    {
      key: 'districtTitle',
      titleFa: 'ناحیه (انشعابات)',
      type: 'text',
      path: at('utilityDetail.districtTitleSnapshot'),
      sortable: false,
    },
    {
      key: 'utilityTypeTitle',
      titleFa: 'نوع انشعاب',
      type: 'text',
      path: at('utilityDetail.utilityTypeTitleSnapshot'),
      sortable: false,
    },
    {
      key: 'vehiclePlate',
      titleFa: 'پلاک خودرو (سوخت)',
      type: 'text',
      path: at('fuelDetail.plateNumberSnapshot'),
      sortable: false,
    },
    {
      key: 'fuelTypeTitle',
      titleFa: 'نوع سوخت',
      type: 'text',
      path: at('fuelDetail.fuelTypeTitleSnapshot'),
      sortable: false,
    },
    {
      key: 'paymentMethodKinds',
      titleFa: 'روش پرداخت فاکتورها',
      type: 'enum',
      path: at('payment.methodKind'),
      enumValues: PAYMENT_KIND_VALUES,
      sortable: false,
    },
    {
      key: 'paymentIbans',
      titleFa: 'شبای پرداخت‌ها',
      type: 'text',
      path: at('payment.ibanSnapshot'),
      sortable: false,
    },
    {
      key: 'paymentIdentifiers',
      titleFa: 'شناسه پرداخت‌ها',
      type: 'text',
      path: at('payment.paymentIdentifier'),
      sortable: false,
    },
    {
      key: 'billIdentifiers',
      titleFa: 'شناسه قبض‌ها',
      type: 'text',
      path: at('payment.billIdentifier'),
      sortable: false,
    },
    {
      key: 'payeeNames',
      titleFa: 'نام صاحب حساب قبض‌ها',
      type: 'text',
      path: at('payment.payeeName'),
      sortable: false,
    },
    {
      key: 'pettyCashHolderNames',
      titleFa: 'تنخواه‌دارها',
      type: 'text',
      path: at('payment.pettyCashHolderNameSnapshot'),
      sortable: false,
    },
  ];
}

const VENDORS: DatasetDefinition = {
  key: 'vendors',
  titleFa: 'فروشندگان',
  description: 'یک ردیف برای هر فروشنده، با شناسه‌ها و تعداد فاکتورها.',
  kind: 'rows',
  model: 'vendor',
  requiredPermissions: ['vendor:read'],
  documentScope: 'none',
  defaultColumns: ['name', 'personType', 'economicCode', 'phone', 'invoiceCount'],
  defaultSort: [{ field: 'name', dir: 'asc' }],
  fields: [
    { key: 'id', titleFa: 'شناسه', type: 'uuid', path: 'id', filterable: false, sortable: false },
    { key: 'name', titleFa: 'نام', type: 'text', path: 'name', width: 35 },
    {
      key: 'personType',
      titleFa: 'نوع شخص',
      type: 'enum',
      path: 'personType',
      enumValues: PERSON_TYPE_VALUES,
    },
    { key: 'representativeName', titleFa: 'نام نماینده', type: 'text', path: 'representativeName' },
    { key: 'economicCode', titleFa: 'شماره اقتصادی', type: 'text', path: 'economicCode' },
    { key: 'nationalId', titleFa: 'کد ملی', type: 'text', path: 'nationalId' },
    { key: 'registrationNumber', titleFa: 'شماره ثبت', type: 'text', path: 'registrationNumber' },
    { key: 'phone', titleFa: 'تلفن', type: 'text', path: 'phone' },
    { key: 'postalCode', titleFa: 'کد پستی', type: 'text', path: 'postalCode' },
    { key: 'fax', titleFa: 'نمابر', type: 'text', path: 'fax' },
    { key: 'addressLine', titleFa: 'نشانی', type: 'text', path: 'addressLine', width: 40 },
    { key: 'notes', titleFa: 'یادداشت', type: 'text', path: 'notes', width: 40 },
    { key: 'isActive', titleFa: 'فعال', type: 'boolean', path: 'isActive' },

    /*
      شباهای فروشنده.

      یک فروشنده چند حساب دارد، پس این‌ها رابطهٔ یک‌به‌چندند: فیلتر یعنی «فروشنده‌ای
      که دست‌کم یکی از شباهایش…» و ستون، همه را کنار هم می‌گذارد.
    */
    {
      key: 'ibans',
      titleFa: 'شباها',
      type: 'text',
      path: 'bankAccounts[].iban',
      sortable: false,
      width: 40,
    },
    {
      key: 'bankTitles',
      titleFa: 'بانک‌ها',
      type: 'text',
      path: 'bankAccounts[].bank.titleFa',
      sortable: false,
    },
    {
      key: 'accountTitles',
      titleFa: 'عنوان حساب‌ها',
      type: 'text',
      path: 'bankAccounts[].accountTitle',
      sortable: false,
    },
    /** تعداد فاکتور از `_count` می‌آید، نه از یک کوئری جدا به‌ازای هر ردیف. */
    {
      key: 'invoiceCount',
      titleFa: 'تعداد فاکتور',
      type: 'integer',
      path: '_count.invoices',
      countWhere: { document: { deletedAt: null } },
      filterable: false,
      sortable: true,
    },
    { key: 'createdAt', titleFa: 'تاریخ ثبت', type: 'jalaliDate', path: 'createdAt' },
    { key: 'updatedAt', titleFa: 'آخرین تغییر', type: 'jalaliDate', path: 'updatedAt' },
  ],
};

const PAYMENTS: DatasetDefinition = {
  key: 'payments',
  titleFa: 'پرداخت‌ها',
  description: 'روش پرداخت هر فاکتور، با شبا و شناسه پرداخت و قبض.',
  kind: 'rows',
  model: 'invoicePayment',
  requiredPermissions: ['document:read'],
  documentScope: 'relation',
  documentPath: 'invoice.document',
  defaultColumns: ['documentTitle', 'vendorName', 'methodKind', 'totalAmount', 'invoiceDate'],
  defaultSort: [{ field: 'invoiceDate', dir: 'desc' }],
  fields: [
    {
      key: 'invoiceId',
      titleFa: 'شناسه فاکتور',
      type: 'uuid',
      path: 'invoiceId',
      filterable: false,
      sortable: false,
    },
    { key: 'documentTitle', titleFa: 'سند', type: 'text', path: 'invoice.document.title', width: 35 },
    {
      key: 'documentNumber',
      titleFa: 'شماره سند',
      type: 'text',
      path: 'invoice.document.documentNumber',
    },
    {
      key: 'documentStatus',
      titleFa: 'وضعیت سند',
      type: 'enum',
      path: 'invoice.document.status',
      enumValues: DOCUMENT_STATUS_VALUES,
    },
    { key: 'fiscalYear', titleFa: 'سال مالی', type: 'integer', path: 'invoice.document.fiscalYear' },
    {
      key: 'chapterTitle',
      titleFa: 'فصل بودجه',
      type: 'text',
      path: 'invoice.chapterTitleSnapshot',
      width: 25,
    },
    {
      key: 'invoiceKind',
      titleFa: 'نوع فاکتور',
      type: 'enum',
      path: 'invoice.invoiceKind',
      enumValues: INVOICE_KIND_VALUES,
    },
    {
      key: 'invoiceDescription',
      titleFa: 'شرح فاکتور',
      type: 'text',
      path: 'invoice.description',
      width: 40,
    },
    {
      key: 'itemDescriptions',
      titleFa: 'شرح ردیف‌ها',
      type: 'text',
      path: 'invoice.items[].description',
      sortable: false,
      width: 45,
    },
    {
      key: 'schoolTitle',
      titleFa: 'مدرسه (انشعابات)',
      type: 'text',
      path: 'invoice.utilityDetail.schoolTitleSnapshot',
      width: 30,
    },
    { key: 'vendorName', titleFa: 'فروشنده', type: 'text', path: 'invoice.vendorSnapshot.name', width: 30 },
    {
      key: 'methodKind',
      titleFa: 'روش پرداخت',
      type: 'enum',
      path: 'methodKind',
      enumValues: PAYMENT_KIND_VALUES,
    },
    { key: 'methodTitle', titleFa: 'عنوان روش', type: 'text', path: 'paymentMethod.titleFa' },
    { key: 'bankTitle', titleFa: 'بانک', type: 'text', path: 'bankTitleSnapshot' },
    { key: 'iban', titleFa: 'شبا', type: 'text', path: 'ibanSnapshot' },
    { key: 'accountTitle', titleFa: 'عنوان حساب', type: 'text', path: 'accountTitleSnapshot' },
    { key: 'paymentIdentifier', titleFa: 'شناسه پرداخت', type: 'text', path: 'paymentIdentifier' },
    { key: 'billIdentifier', titleFa: 'شناسه قبض', type: 'text', path: 'billIdentifier' },
    { key: 'payeeName', titleFa: 'نام صاحب حساب قبض', type: 'text', path: 'payeeName' },
    // اطلاعات تنخواه از snapshot خوانده می‌شود، نه از اطلاعات پایهٔ امروز: گزارش
    // باید همان نامی را بدهد که روز پرداخت ثبت شده است.
    {
      key: 'pettyCashHolderName',
      titleFa: 'تنخواه‌دار',
      type: 'text',
      path: 'pettyCashHolderNameSnapshot',
    },
    {
      key: 'pettyCashAccountHolder',
      titleFa: 'صاحب حساب تنخواه',
      type: 'text',
      path: 'pettyCashAccountHolderSnapshot',
    },
    {
      key: 'pettyCashBankTitle',
      titleFa: 'بانک تنخواه',
      type: 'text',
      path: 'pettyCashBankTitleSnapshot',
    },
    { key: 'pettyCashIban', titleFa: 'شبای تنخواه', type: 'text', path: 'pettyCashIbanSnapshot' },
    // سهم هر مقصد در پرداخت ترکیبی؛ در بقیهٔ روش‌ها خالی است.
    {
      key: 'beneficiaryAmount',
      titleFa: 'سهم ذی‌نفع',
      type: 'money',
      path: 'beneficiaryAmount',
    },
    { key: 'pettyCashAmount', titleFa: 'سهم کارپرداز', type: 'money', path: 'pettyCashAmount' },
    { key: 'invoiceNumber', titleFa: 'شماره صورتحساب', type: 'text', path: 'invoice.invoiceNumber' },
    { key: 'invoiceDate', titleFa: 'تاریخ صورتحساب', type: 'jalaliDate', path: 'invoice.invoiceDate' },
    { key: 'totalAmount', titleFa: 'مبلغ فاکتور', type: 'money', path: 'invoice.totalAmount' },
  ],
};

const AMOUNTS: DatasetDefinition = {
  key: 'amounts',
  titleFa: 'مبالغ و مالیات',
  description:
    'جمع مبالغ فاکتورها بر اساس بُعد انتخابی (سال مالی، فصل، فروشنده، نوع فاکتور، وضعیت سند).',
  kind: 'grouped',
  model: 'invoice',
  requiredPermissions: ['document:read'],
  documentScope: 'relation',
  documentPath: 'document',
  defaultColumns: ['group', 'rowCount', 'sumGross', 'sumDiscount', 'sumNet', 'sumTax', 'sumTotal'],
  defaultSort: [{ field: 'sumTotal', dir: 'desc' }],
  groupBy: [
    { key: 'fiscalYear', titleFa: 'سال مالی' },
    { key: 'chapterTitle', titleFa: 'فصل بودجه' },
    { key: 'vendorName', titleFa: 'فروشنده' },
    { key: 'invoiceKind', titleFa: 'نوع فاکتور' },
    { key: 'documentStatus', titleFa: 'وضعیت سند' },
  ],
  fields: [
    { key: 'group', titleFa: 'گروه', type: 'text', path: 'group', filterable: false, width: 35 },
    { key: 'rowCount', titleFa: 'تعداد فاکتور', type: 'integer', path: 'rowCount', filterable: false },
    /*
      ستون‌های تجمیعی **پیشوند** دارند.

      بدون آن، کلیدشان با فیلدهای فیلترِ فاکتور یکی می‌شد و چون جست‌وجوی کلید اولین
      تطبیق را برمی‌دارد، فیلتر روی «مبلغ کالا» در این گزارش به ستونِ تجمیعیِ
      فیلترناپذیر می‌خورد و رد می‌شد — یعنی پنج فیلد، خاموش و بی‌دلیل، غیرقابل
      استفاده بودند.
    */
    { key: 'sumGross', titleFa: 'جمع مبلغ کالا', type: 'money', path: 'sumGross', filterable: false },
    { key: 'sumDiscount', titleFa: 'جمع تخفیف', type: 'money', path: 'sumDiscount', filterable: false },
    { key: 'sumNet', titleFa: 'جمع خالص', type: 'money', path: 'sumNet', filterable: false },
    { key: 'sumTax', titleFa: 'جمع مالیات و عوارض', type: 'money', path: 'sumTax', filterable: false },
    { key: 'sumTotal', titleFa: 'جمع کل', type: 'money', path: 'sumTotal', filterable: false },
  ],
};

/**
 * فیلترهای مجموعه‌داده تجمیعی روی **فاکتورها** اعمال می‌شوند، نه روی گروه‌ها.
 *
 * یعنی «جمع مالیات فاکتورهای سال ۱۴۰۵ به تفکیک فصل» یک درخواست است: فیلتر روی سال،
 * گروه‌بندی روی فصل. فیلتر روی ستون‌های تجمیعی (`HAVING`) در دامنه این فاز نیست و
 * فیلدهای تجمیعی صریحاً `filterable: false` اعلام شده‌اند.
 */
export const AMOUNT_FILTER_FIELDS: readonly ReportFieldDefinition[] = INVOICES.fields.filter(
  (field) => field.filterable !== false,
);

const ARCHIVE: DatasetDefinition = {
  key: 'archive',
  titleFa: 'بایگانی',
  description: 'وضعیت فرایند بایگانی هر سند، از لحظه ارجاع تا تکمیل.',
  kind: 'rows',
  model: 'archiveMetadata',
  requiredPermissions: ['archive:read'],
  documentScope: 'relation',
  documentPath: 'document',
  defaultColumns: ['documentTitle', 'status', 'receivedAt', 'archivedAt', 'archivedByName'],
  defaultSort: [{ field: 'receivedAt', dir: 'desc' }],
  fields: [
    {
      key: 'documentId',
      titleFa: 'شناسه سند',
      type: 'uuid',
      path: 'documentId',
      filterable: false,
      sortable: false,
    },
    { key: 'documentTitle', titleFa: 'سند', type: 'text', path: 'document.title', width: 35 },
    { key: 'documentNumber', titleFa: 'شماره سند', type: 'text', path: 'document.documentNumber' },
    { key: 'fiscalYear', titleFa: 'سال مالی', type: 'integer', path: 'document.fiscalYear' },
    {
      key: 'documentType',
      titleFa: 'نوع سند',
      type: 'enum',
      path: 'document.type',
      enumValues: DOCUMENT_TYPE_VALUES,
    },
    {
      key: 'documentStatus',
      titleFa: 'وضعیت سند',
      type: 'enum',
      path: 'document.status',
      enumValues: DOCUMENT_STATUS_VALUES,
    },
    {
      key: 'documentPaymentStatus',
      titleFa: 'وضعیت پرداخت سند',
      type: 'enum',
      path: 'document.paymentStatus',
      enumValues: PAYMENT_SETTLEMENT_VALUES,
    },
    {
      key: 'status',
      titleFa: 'وضعیت بایگانی',
      type: 'enum',
      path: 'status',
      enumValues: ARCHIVE_STATUS_VALUES,
    },
    { key: 'notes', titleFa: 'یادداشت', type: 'text', path: 'notes', width: 40 },
    { key: 'receivedAt', titleFa: 'تاریخ ارجاع', type: 'jalaliDate', path: 'receivedAt' },
    { key: 'archivedAt', titleFa: 'تاریخ تکمیل', type: 'jalaliDate', path: 'archivedAt' },
    { key: 'archivedByName', titleFa: 'تکمیل‌کننده', type: 'text', path: 'archivedBy.fullName' },
    { key: 'updatedAt', titleFa: 'آخرین تغییر', type: 'jalaliDate', path: 'updatedAt' },
    { key: 'totalAmount', titleFa: 'جمع کل سند', type: 'money', path: 'document.totalAmount' },
    { key: 'paidAmount', titleFa: 'مبلغ پرداخت‌شده', type: 'money', path: 'document.paidAmount' },
    {
      key: 'outstandingAmount',
      titleFa: 'مبلغ شناسایی',
      type: 'money',
      path: 'document.outstandingAmount',
    },
  ],
};

const FEEDBACKS: DatasetDefinition = {
  key: 'feedbacks',
  titleFa: 'بازخوردها',
  description: 'بازخوردهای ناظر روی اسناد و اجزایشان، با وضعیت رسیدگی.',
  kind: 'rows',
  model: 'reviewFeedback',
  requiredPermissions: ['feedback:read'],
  documentScope: 'relation',
  documentPath: 'document',
  defaultColumns: ['documentTitle', 'targetKind', 'status', 'authorName', 'createdAt'],
  defaultSort: [{ field: 'createdAt', dir: 'desc' }],
  fields: [
    { key: 'id', titleFa: 'شناسه', type: 'uuid', path: 'id', filterable: false, sortable: false },
    { key: 'documentTitle', titleFa: 'سند', type: 'text', path: 'document.title', width: 35 },
    {
      key: 'status',
      titleFa: 'وضعیت',
      type: 'enum',
      path: 'status',
      enumValues: FEEDBACK_STATUS_VALUES,
    },
    {
      key: 'targetKind',
      titleFa: 'موضوع',
      type: 'enum',
      path: 'targetKind',
      enumValues: [
        { value: 'DOCUMENT', label: 'سند' },
        { value: 'STAD_META', label: 'اطلاعات ستاد' },
        { value: 'VENDOR', label: 'فروشنده' },
        { value: 'INVOICE', label: 'فاکتور' },
        { value: 'INVOICE_ITEM', label: 'ردیف فاکتور' },
        { value: 'PAYMENT', label: 'پرداخت' },
        { value: 'ARCHIVE', label: 'بایگانی' },
        { value: 'TAX_REPORT', label: 'گزارش مالیات' },
      ],
    },
    { key: 'body', titleFa: 'متن بازخورد', type: 'text', path: 'body', width: 50 },
    {
      key: 'replyBodies',
      titleFa: 'متن پاسخ‌ها',
      type: 'text',
      path: 'replies[].body',
      sortable: false,
      width: 50,
    },
    {
      key: 'documentNumber',
      titleFa: 'شماره سند',
      type: 'text',
      path: 'document.documentNumber',
    },
    { key: 'fiscalYear', titleFa: 'سال مالی', type: 'integer', path: 'document.fiscalYear' },
    { key: 'sectionKey', titleFa: 'بخش سند', type: 'text', path: 'sectionKey' },
    {
      key: 'invoiceNumber',
      titleFa: 'شماره صورتحساب',
      type: 'text',
      path: 'invoice.invoiceNumber',
    },
    { key: 'authorName', titleFa: 'ثبت‌کننده', type: 'text', path: 'createdBy.fullName' },
    { key: 'createdAt', titleFa: 'تاریخ ثبت', type: 'jalaliDate', path: 'createdAt' },
    { key: 'updatedAt', titleFa: 'آخرین تغییر', type: 'jalaliDate', path: 'updatedAt' },
    { key: 'resolvedAt', titleFa: 'تاریخ رسیدگی', type: 'jalaliDate', path: 'resolvedAt' },
  ],
};

const ACTIVITY: DatasetDefinition = {
  key: 'activity',
  titleFa: 'فعالیت کاربران',
  description: 'ردپای حسابرسی: چه کسی، چه زمانی، روی چه چیزی چه کرد.',
  kind: 'rows',
  model: 'auditLog',
  requiredPermissions: ['audit:read'],
  /*
   * ردپای حسابرسی **عمداً** دامنه دسترسی سند نمی‌گیرد: مجوز `audit:read` خودش
   * محدودکننده است (فقط مدیر و مدیر سیستم دارند) و حسابرسی‌ای که بخشی از رویدادها
   * را نشان ندهد، کار حسابرسی نمی‌کند.
   */
  documentScope: 'none',
  defaultColumns: ['createdAt', 'actorName', 'action', 'entityType'],
  defaultSort: [{ field: 'createdAt', dir: 'desc' }],
  fields: [
    { key: 'id', titleFa: 'شناسه', type: 'uuid', path: 'id', filterable: false, sortable: false },
    { key: 'createdAt', titleFa: 'زمان', type: 'jalaliDate', path: 'createdAt' },
    { key: 'actorName', titleFa: 'کاربر', type: 'text', path: 'actor.fullName' },
    { key: 'actorUsername', titleFa: 'نام کاربری', type: 'text', path: 'actor.username' },
    { key: 'action', titleFa: 'اقدام', type: 'text', path: 'action', width: 30 },
    { key: 'entityType', titleFa: 'نوع موجودیت', type: 'text', path: 'entityType' },
    { key: 'documentId', titleFa: 'شناسه سند', type: 'uuid', path: 'documentId' },
    { key: 'entityId', titleFa: 'شناسه موجودیت', type: 'uuid', path: 'entityId' },
    /*
      شناسهٔ پیگیری — همان چیزی که در پیام خطای کاربر چاپ می‌شود.

      بدون آن، رسیدن از یک شکایت («خطا داد، کدش این بود») به رویداد واقعی، یعنی
      گشتن دستی در لاگ.
    */
    { key: 'traceId', titleFa: 'شناسه پیگیری', type: 'text', path: 'traceId' },
    { key: 'reason', titleFa: 'دلیل', type: 'text', path: 'reason', width: 40 },
    /** IP در ردپای حسابرسی هست ولی دیدنش مجوز جداگانه می‌خواهد. */
    { key: 'ip', titleFa: 'نشانی IP', type: 'text', path: 'ip', requiredPermissions: ['audit:read'] },
  ],
};

/**
 * برچسب فارسی مقدارهای enum، برای ابعاد گزارش تجمیعی.
 *
 * گزارش تجمیعی مقدار بُعد را به‌عنوان **نام گروه** برمی‌گرداند و نام گروه چیزی است
 * که کاربر می‌خواند؛ `NORMAL` نام گروه نیست. برچسب‌ها از همان فهرست‌های بالا می‌آیند
 * تا دو جدول برچسب نداشته باشیم.
 */
export const ENUM_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  invoiceKind: Object.fromEntries(INVOICE_KIND_VALUES.map((item) => [item.value, item.label])),
  documentStatus: Object.fromEntries(DOCUMENT_STATUS_VALUES.map((item) => [item.value, item.label])),
};

/*
  گزارش انشعابات.

  همان مدل فاکتور است، ولی فقط فاکتورهای انشعابات — و این شرط در **تعریف** نشسته،
  نه در فیلتر کاربر: گزارشی که با پاک کردن یک شرط، قبض سوخت هم نشان بدهد، گزارش
  انشعابات نیست.

  چرا یک گزارش جدا، وقتی همین فیلدها در «فاکتورها» هم هستند: کاربری که دنبال قبض
  یک مدرسه است، باید اول نوع فاکتور را روی انشعابات بگذارد و بعد از میان ده‌ها فیلدِ
  بی‌ربط (پلاک خودرو، نوع سوخت) دنبال «مدرسه» بگردد. اینجا فیلدهای انشعابات اولِ
  فهرست‌اند، ستون‌های پیش‌فرض همان چیزی است که در عمل نگاه می‌شود، و سه فیلد کلیدی
  فهرست انتخاب دارند و نه جعبهٔ متن خالی.
*/
const UTILITY_ONLY_KEYS = new Set([
  'vehiclePlate',
  'vehicleTypeTitle',
  'fuelTypeTitle',
  'fuelJalaliYear',
  'fuelJalaliMonth',
  // نوع فاکتور اینجا همیشه «انشعابات» است؛ فیلتری که همیشه یک جواب دارد، فیلتر نیست.
  'invoiceKind',
]);

/** سه فیلد اصلی انشعابات، با فهرست گزینه از خودِ داده. */
const UTILITY_KEY_FIELDS: ReportFieldDefinition[] = [
  {
    key: 'schoolTitle',
    titleFa: 'مدرسه',
    type: 'text',
    path: 'utilityDetail.schoolTitleSnapshot',
    width: 30,
    optionsFrom: {
      model: 'invoiceUtilityDetail',
      column: 'schoolTitleSnapshot',
      documentPath: 'invoice.document',
    },
  },
  {
    key: 'districtTitle',
    titleFa: 'ناحیه',
    type: 'text',
    path: 'utilityDetail.districtTitleSnapshot',
    width: 20,
    optionsFrom: {
      model: 'invoiceUtilityDetail',
      column: 'districtTitleSnapshot',
      documentPath: 'invoice.document',
    },
  },
  {
    key: 'utilityTypeTitle',
    titleFa: 'نوع انشعاب',
    type: 'text',
    path: 'utilityDetail.utilityTypeTitleSnapshot',
    width: 18,
    optionsFrom: {
      model: 'invoiceUtilityDetail',
      column: 'utilityTypeTitleSnapshot',
      documentPath: 'invoice.document',
    },
  },
];

const UTILITIES: DatasetDefinition = {
  key: 'utilities',
  titleFa: 'انشعابات',
  description: 'یک ردیف برای هر قبض انشعاب، با مدرسه و ناحیه و نوع انشعاب و مبلغ و پرداخت.',
  kind: 'rows',
  model: 'invoice',
  requiredPermissions: ['document:read'],
  documentScope: 'relation',
  documentPath: 'document',
  baseWhere: { invoiceKind: 'UTILITY' },
  defaultColumns: [
    'schoolTitle',
    'districtTitle',
    'utilityTypeTitle',
    'invoiceNumber',
    'invoiceDate',
    'totalAmount',
    'documentTitle',
  ],
  defaultSort: [{ field: 'invoiceDate', dir: 'desc' }],
  fields: [
    ...UTILITY_KEY_FIELDS,
    ...INVOICES.fields.filter(
      (field) =>
        !UTILITY_ONLY_KEYS.has(field.key) &&
        !UTILITY_KEY_FIELDS.some((key) => key.key === field.key),
    ),
  ],
};


export const DATASETS: readonly DatasetDefinition[] = [
  DOCUMENTS,
  INVOICES,
  UTILITIES,
  AMOUNTS,
  VENDORS,
  PAYMENTS,
  ARCHIVE,
  FEEDBACKS,
  ACTIVITY,
];

export const DATASET_BY_KEY: ReadonlyMap<string, DatasetDefinition> = new Map(
  DATASETS.map((dataset) => [dataset.key, dataset]),
);

export function fieldsOf(dataset: DatasetDefinition): readonly ReportFieldDefinition[] {
  return dataset.kind === 'grouped' ? [...dataset.fields, ...AMOUNT_FILTER_FIELDS] : dataset.fields;
}

export function findField(
  dataset: DatasetDefinition,
  key: string,
): ReportFieldDefinition | undefined {
  return fieldsOf(dataset).find((field) => field.key === key);
}

/** فیلدهایی که این کاربر حق دیدنشان را دارد. */
export function visibleFields(
  dataset: DatasetDefinition,
  permissions: readonly Permission[],
): readonly ReportFieldDefinition[] {
  return fieldsOf(dataset).filter((field) =>
    (field.requiredPermissions ?? []).every((permission) => permissions.includes(permission)),
  );
}

export function allowedOperators(field: ReportFieldDefinition): readonly FilterOperator[] {
  const operators = OPERATORS_BY_TYPE[field.type];
  if (!hasListHop(field.path)) return operators;

  /*
    «خالی است» روی یک رابطهٔ یک‌به‌چند، دو معنای متفاوت دارد — «هیچ ردیفی ندارد» و
    «ردیفی با مقدار خالی دارد» — و هرکدام جواب دیگری می‌دهد. به‌جای انتخاب یکی و
    پنهان کردن دیگری، هر دو بسته‌اند.
  */
  return operators.filter(
    (operator) => operator !== 'isEmpty' && operator !== 'isNotEmpty',
  );
}
