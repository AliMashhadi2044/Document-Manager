/**
 * شمارش‌های دامنه و برچسب فارسی آن‌ها.
 *
 * مقادیر در دیتابیس **انگلیسی و پایدار** هستند؛ ترجمه فارسی فقط اینجا نگهداری می‌شود
 * تا متن نمایشی در کد پراکنده نشود (الزام §۴ پرامپت).
 */

export const DOCUMENT_TYPES = ['NORMAL', 'STAD'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  NORMAL: 'عادی',
  STAD: 'سامانه ستاد',
};

export const DOCUMENT_STATUSES = [
  'DRAFT',
  'FINALIZED',
  'PENDING_ARCHIVE',
  'ARCHIVED',
  'NEEDS_REVISION',
  'REOPENED',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'پیش‌نویس',
  FINALIZED: 'ثبت‌شده',
  PENDING_ARCHIVE: 'در انتظار بایگانی',
  ARCHIVED: 'بایگانی‌شده',
  NEEDS_REVISION: 'نیازمند اصلاح',
  REOPENED: 'بازگشایی‌شده',
};

export const INVOICE_KINDS = ['NORMAL', 'STAD', 'UTILITY', 'FUEL'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  NORMAL: 'فاکتور عادی',
  STAD: 'فاکتور سامانه ستاد',
  UTILITY: 'فاکتور انشعابات',
  FUEL: 'فاکتور سوخت',
};

export const PERSON_TYPES = ['NATURAL', 'LEGAL'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  NATURAL: 'حقیقی',
  LEGAL: 'حقوقی',
};

export const PAYMENT_METHOD_KINDS = [
  'BENEFICIARY_ACCOUNT',
  'PETTY_CASH',
  'BILL',
  'SPLIT',
] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export const PAYMENT_METHOD_KIND_LABELS: Record<PaymentMethodKind, string> = {
  BENEFICIARY_ACCOUNT: 'حساب ذی‌نفع',
  PETTY_CASH: 'کارپرداز / تنخواه',
  BILL: 'قبض',
  SPLIT: 'ترکیبی: کارپرداز و ذی‌نفع',
};

/**
 * خانواده‌هایی که پرداخت در آن‌ها **بین دو مقصد تقسیم** می‌شود.
 *
 * جدا نگه داشته شده تا هر جای دیگری که باید دو مبلغ را با هم ببیند، از همین‌جا
 * بپرسد و نه با مقایسهٔ رشته‌ای با `'SPLIT'`.
 */
export function isSplitPayment(kind: PaymentMethodKind | string): boolean {
  return kind === 'SPLIT';
}

export const BUDGET_CATEGORY_KEYS = ['CURRENT', 'CAPITAL'] as const;
export type BudgetCategoryKey = (typeof BUDGET_CATEGORY_KEYS)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategoryKey, string> = {
  CURRENT: 'جاری',
  CAPITAL: 'عمرانی',
};

export const FEEDBACK_STATUSES = ['OPEN', 'ANSWERED', 'RESOLVED', 'REJECTED'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: 'باز',
  ANSWERED: 'پاسخ داده‌شده',
  RESOLVED: 'رسیدگی‌شده',
  REJECTED: 'رد‌شده',
};

export const FEEDBACK_TARGET_KINDS = [
  'DOCUMENT',
  'STAD_META',
  'VENDOR',
  'INVOICE',
  'INVOICE_ITEM',
  'PAYMENT',
  'ARCHIVE',
  'TAX_REPORT',
] as const;
export type FeedbackTargetKind = (typeof FEEDBACK_TARGET_KINDS)[number];

export const FEEDBACK_TARGET_LABELS: Record<FeedbackTargetKind, string> = {
  DOCUMENT: 'مشخصات سند',
  STAD_META: 'اطلاعات سامانه ستاد',
  VENDOR: 'مشخصات فروشنده',
  INVOICE: 'فاکتور',
  INVOICE_ITEM: 'ردیف فاکتور',
  PAYMENT: 'روش پرداخت',
  ARCHIVE: 'اطلاعات بایگانی',
  TAX_REPORT: 'خروجی مالیات',
};

export const REVISION_TRIGGERS = ['FINALIZE', 'REOPEN', 'ARCHIVE', 'CORRECTION'] as const;
export type RevisionTrigger = (typeof REVISION_TRIGGERS)[number];

export const ATTACHMENT_KINDS = ['SCAN', 'OTHER', 'REPORT_OUTPUT'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const SCAN_STATUSES = ['SKIPPED', 'PENDING', 'CLEAN', 'INFECTED'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const REPORT_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
] as const;
export type ReportRunStatus = (typeof REPORT_RUN_STATUSES)[number];

export const TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
