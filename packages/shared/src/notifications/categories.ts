/**
 * دسته‌بندی اعلان‌ها.
 *
 * انگیزه‌اش مشخص است: کارپردازی که روزی ده اعلان «ارجاع به بایگانی» می‌گیرد،
 * نباید برای پیدا کردن یک **نیازمندی پرداخت** فهرست را بالا و پایین کند. پیگیری
 * پرداخت دستهٔ خودش را دارد.
 *
 * نگاشت اینجاست و نه در رابط، چون **سرور** هم با همین فیلتر می‌کند: اگر هر طرف
 * فهرست خودش را می‌داشت، شمارندهٔ یک دسته و محتوایش می‌توانستند با هم نخوانند.
 */

export const NOTIFICATION_KINDS = [
  'DOCUMENT_SENT_TO_ARCHIVE',
  'DOCUMENT_ARCHIVED',
  'DOCUMENT_NEEDS_REVISION',
  'FEEDBACK_CREATED',
  'FEEDBACK_REPLIED',
  'FEEDBACK_RESOLVED',
  'DOCUMENT_PAYMENT_OUTSTANDING',
  'DOCUMENT_PAYMENT_SETTLED',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_CATEGORIES = ['PAYMENT', 'WORKFLOW', 'FEEDBACK'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  PAYMENT: 'پیگیری پرداخت',
  WORKFLOW: 'گردش سند',
  FEEDBACK: 'بازخوردها',
};

/**
 * هر نوع، دقیقاً یک دسته.
 *
 * `Record<NotificationKind, …>` عمدی است: نوع تازه باید **کامپایل را بشکند** تا
 * کسی یادش نرود بگوید این اعلان کجا می‌نشیند.
 */
export const NOTIFICATION_KIND_CATEGORY: Record<NotificationKind, NotificationCategory> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'WORKFLOW',
  DOCUMENT_ARCHIVED: 'WORKFLOW',
  DOCUMENT_NEEDS_REVISION: 'WORKFLOW',
  FEEDBACK_CREATED: 'FEEDBACK',
  FEEDBACK_REPLIED: 'FEEDBACK',
  FEEDBACK_RESOLVED: 'FEEDBACK',
  DOCUMENT_PAYMENT_OUTSTANDING: 'PAYMENT',
  DOCUMENT_PAYMENT_SETTLED: 'PAYMENT',
};

/** نوع‌های یک دسته — ورودی فیلتر `kind in (…)` سمت سرور. */
export function kindsOfCategory(category: NotificationCategory): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((kind) => NOTIFICATION_KIND_CATEGORY[kind] === category);
}
