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
    ...documentMoneyFields(),
    {
      key: 'openFeedbackCount',
      titleFa: 'بازخورد باز',
      type: 'integer',
      path: 'openFeedbackCount',
    },
    { key: 'createdByName', titleFa: 'ایجادکننده', type: 'text', path: 'createdBy.fullName' },
    { key: 'createdAt', titleFa: 'تاریخ ایجاد', type: 'jalaliDate', path: 'createdAt' },
    { key: 'finalizedAt', titleFa: 'تاریخ ثبت نهایی', type: 'jalaliDate', path: 'finalizedAt' },
    { key: 'archivedAt', titleFa: 'تاریخ بایگانی', type: 'jalaliDate', path: 'archivedAt' },

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
    { key: 'outstandingAmount', titleFa: 'مبلغ نیازمندی', type: 'money', path: 'outstandingAmount' },
    { key: 'paymentDate', titleFa: 'تاریخ پرداخت', type: 'jalaliDate', path: 'paymentDate' },
    {
      key: 'paymentStatusAt',
      titleFa: 'تاریخ ثبت وضعیت پرداخت',
      type: 'jalaliDate',
      path: 'paymentStatusAt',
    },
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
      key: 'documentStatus',
      titleFa: 'وضعیت سند',
      type: 'enum',
      path: 'document.status',
      enumValues: DOCUMENT_STATUS_VALUES,
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
    { key: 'invoiceTypeTitle', titleFa: 'عنوان نوع فاکتور', type: 'text', path: 'invoiceType.titleFa' },
    { key: 'chapterTitle', titleFa: 'فصل بودجه', type: 'text', path: 'chapterTitleSnapshot', width: 25 },
    { key: 'chapterCode', titleFa: 'کد فصل', type: 'text', path: 'chapterCodeSnapshot' },
    { key: 'vendorName', titleFa: 'فروشنده', type: 'text', path: 'vendorSnapshot.name', width: 30 },
    {
      key: 'vendorEconomicCode',
      titleFa: 'شماره اقتصادی فروشنده',
      type: 'text',
      path: 'vendorSnapshot.economicCode',
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
    { key: 'createdAt', titleFa: 'تاریخ ثبت', type: 'jalaliDate', path: 'createdAt' },
  ],
};

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
    { key: 'addressLine', titleFa: 'نشانی', type: 'text', path: 'addressLine', width: 40 },
    { key: 'isActive', titleFa: 'فعال', type: 'boolean', path: 'isActive' },
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
    { key: 'fiscalYear', titleFa: 'سال مالی', type: 'integer', path: 'invoice.document.fiscalYear' },
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
  defaultColumns: ['group', 'rowCount', 'grossAmount', 'discountAmount', 'netAmount', 'taxAmount', 'totalAmount'],
  defaultSort: [{ field: 'totalAmount', dir: 'desc' }],
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
    { key: 'grossAmount', titleFa: 'جمع مبلغ کالا', type: 'money', path: 'grossAmount', filterable: false },
    { key: 'discountAmount', titleFa: 'جمع تخفیف', type: 'money', path: 'discountAmount', filterable: false },
    { key: 'netAmount', titleFa: 'جمع خالص', type: 'money', path: 'netAmount', filterable: false },
    { key: 'taxAmount', titleFa: 'جمع مالیات و عوارض', type: 'money', path: 'taxAmount', filterable: false },
    { key: 'totalAmount', titleFa: 'جمع کل', type: 'money', path: 'totalAmount', filterable: false },
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
    { key: 'totalAmount', titleFa: 'جمع کل سند', type: 'money', path: 'document.totalAmount' },
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
    { key: 'authorName', titleFa: 'ثبت‌کننده', type: 'text', path: 'createdBy.fullName' },
    { key: 'createdAt', titleFa: 'تاریخ ثبت', type: 'jalaliDate', path: 'createdAt' },
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

export const DATASETS: readonly DatasetDefinition[] = [
  DOCUMENTS,
  INVOICES,
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
  return OPERATORS_BY_TYPE[field.type];
}
