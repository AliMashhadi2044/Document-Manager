/**
 * رجیستری خانواده‌های ساختاری فاکتور.
 *
 * این فایل پاسخ معیار پذیرش فاز ۴ است: «انتخاب فصل انشعابات فرم انشعابات را می‌آورد …
 * **بدون هیچ `if` روی عنوان فصل در کد**».
 *
 * مسیر تصمیم‌گیری دقیقاً این است:
 *
 *   فصل  ──(جدول `chapter_invoice_types`، داده)──▶  نوع فاکتور
 *   نوع فاکتور ──(ستون `kind`، داده)──▶  خانواده ساختاری
 *   خانواده ساختاری ──(همین رجیستری، کد)──▶  فرم، schema و محاسبه‌گر
 *
 * پس عنوان فصل هیچ‌جا در شرط نمی‌آید؛ ساختن فصل یا نوع فاکتور جدید هم نیاز به کد ندارد.
 * فقط افزودن یک **خانواده ساختاری تازه** (ستون پنجم) نیاز به کد دارد، چون فرم و
 * محاسبه‌اش واقعاً جدید است.
 *
 * سرور و کلاینت هر دو از همین جدول می‌خوانند تا رفتارشان واگرا نشود (ریسک R1).
 */

import { INVOICE_KINDS, type InvoiceKind } from '../enums/enums.js';

/** مدل ردیف‌های مالی هر خانواده. */
export const INVOICE_LINE_MODELS = ['ITEMS', 'SINGLE_AMOUNT', 'DAILY_ENTRIES'] as const;
export type InvoiceLineModel = (typeof INVOICE_LINE_MODELS)[number];

export interface InvoiceKindDefinition {
  readonly kind: InvoiceKind;
  readonly titleFa: string;

  /**
   * ساختار ردیف‌ها:
   *  - `ITEMS`         ردیف‌های کالا/خدمت با تعداد و مبلغ واحد
   *  - `SINGLE_AMOUNT` یک مبلغ پایه (انشعابات)
   *  - `DAILY_ENTRIES` ردیف‌های «روز / مبلغ» در یک ماه شمسی (سوخت)
   */
  readonly lineModel: InvoiceLineModel;

  /** مالیات قابل ورود است؟ در سوخت پنهان و صفر است (تصمیم Q10). */
  readonly supportsTax: boolean;
  /** تخفیف قابل ورود است؟ */
  readonly supportsDiscount: boolean;
  /** شماره صورتحساب قابل ورود است؟ در همه انواع هست، ولی جایی اجباری نیست. */
  readonly supportsInvoiceNumber: boolean;

  /**
   * فیلدهای اختصاصی لازم این خانواده — نام‌ها در `details` ورودی API و در جدول
   * جزئیات همان خانواده‌اند. UI از همین فهرست می‌فهمد چه چیزی باید بپرسد.
   */
  readonly detailFields: readonly string[];
}

export const INVOICE_KIND_REGISTRY: Record<InvoiceKind, InvoiceKindDefinition> = {
  NORMAL: {
    kind: 'NORMAL',
    titleFa: 'فاکتور عادی',
    lineModel: 'ITEMS',
    supportsTax: true,
    supportsDiscount: true,
    supportsInvoiceNumber: true,
    detailFields: [],
  },
  STAD: {
    kind: 'STAD',
    titleFa: 'فاکتور سامانه ستاد',
    lineModel: 'ITEMS',
    supportsTax: true,
    supportsDiscount: true,
    supportsInvoiceNumber: true,
    detailFields: [],
  },
  UTILITY: {
    kind: 'UTILITY',
    titleFa: 'فاکتور انشعابات',
    lineModel: 'SINGLE_AMOUNT',
    // تخفیف و مالیات **اختیاری**اند، نه حذف‌شده (§۱۲ پرامپت).
    supportsTax: true,
    supportsDiscount: true,
    supportsInvoiceNumber: true,
    // ناحیه عمداً اینجا نیست: از مدرسه مشتق می‌شود و سرور آن را می‌نویسد، نه کلاینت.
    detailFields: ['schoolId', 'utilityTypeId', 'baseAmount'],
  },
  FUEL: {
    kind: 'FUEL',
    titleFa: 'فاکتور سوخت',
    lineModel: 'DAILY_ENTRIES',
    // تصمیم Q10: مالیات سوخت در فرم پنهان و مقدارش صفر است.
    supportsTax: false,
    supportsDiscount: false,
    supportsInvoiceNumber: true,
    // نوع خودرو از خود خودرو مشتق می‌شود؛ کلاینت فقط پلاک را می‌فرستد.
    detailFields: ['vehicleId', 'fuelTypeId', 'jalaliYear', 'jalaliMonth', 'entries'],
  },
};

export function invoiceKindDefinition(kind: InvoiceKind): InvoiceKindDefinition {
  return INVOICE_KIND_REGISTRY[kind];
}

/** آیا این خانواده مالیات دارد؟ مرجع واحد برای فرم، سرور و گزارش. */
export function invoiceKindSupportsTax(kind: InvoiceKind): boolean {
  return INVOICE_KIND_REGISTRY[kind].supportsTax;
}

export function invoiceKindLineModel(kind: InvoiceKind): InvoiceLineModel {
  return INVOICE_KIND_REGISTRY[kind].lineModel;
}

/** نگهبان کامل بودن رجیستری — اگر خانواده‌ای اضافه شود و اینجا نیاید، تست می‌شکند. */
export const REGISTERED_INVOICE_KINDS: readonly InvoiceKind[] = INVOICE_KINDS;
