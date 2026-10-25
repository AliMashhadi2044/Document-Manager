import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_KIND_CATEGORY,
  type NotificationCategory,
} from '@dm/shared';

import type { IconName } from '../../shared/ui/icon';
import type { BadgeTone } from '../../shared/ui/badge';
import type { NotificationKind } from './notifications.api';

/**
 * برچسب، آیکون و رنگ هر نوع اعلان — یک جا.
 *
 * `Record<NotificationKind, …>` عمدی است و نه یک شیء ساده: افزودن نوع تازه به enum
 * باید **کامپایل را بشکند**، نه اینکه کد خام نوع در رابط دیده شود. همین اشتباه
 * یک‌بار در داشبورد با وضعیت «بازگشایی‌شده» رخ داد.
 *
 * **دسته‌بندی** اما اینجا تعریف نمی‌شود: از `@dm/shared` می‌آید، چون سرور هم با
 * همان فیلتر می‌کند و دو فهرست جدا دیر یا زود با هم نمی‌خواندند.
 */
export const KIND_LABELS: Record<NotificationKind, string> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'ارجاع به بایگانی',
  DOCUMENT_ARCHIVED: 'بایگانی نهایی',
  DOCUMENT_NEEDS_REVISION: 'ارجاع برای اصلاح',
  FEEDBACK_CREATED: 'بازخورد تازه',
  FEEDBACK_REPLIED: 'پاسخ بازخورد',
  FEEDBACK_RESOLVED: 'رسیدگی بازخورد',
  DOCUMENT_PAYMENT_OUTSTANDING: 'نیازمندی پرداخت',
  DOCUMENT_PAYMENT_SETTLED: 'پرداخت کامل شد',
};

export const KIND_ICONS: Record<NotificationKind, IconName> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'archive',
  DOCUMENT_ARCHIVED: 'check',
  DOCUMENT_NEEDS_REVISION: 'alert',
  FEEDBACK_CREATED: 'info',
  FEEDBACK_REPLIED: 'info',
  FEEDBACK_RESOLVED: 'check',
  DOCUMENT_PAYMENT_OUTSTANDING: 'money',
  DOCUMENT_PAYMENT_SETTLED: 'check',
};

export const KIND_TONES: Record<NotificationKind, BadgeTone> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'warning',
  DOCUMENT_ARCHIVED: 'success',
  DOCUMENT_NEEDS_REVISION: 'danger',
  FEEDBACK_CREATED: 'info',
  FEEDBACK_REPLIED: 'info',
  FEEDBACK_RESOLVED: 'success',
  DOCUMENT_PAYMENT_OUTSTANDING: 'danger',
  DOCUMENT_PAYMENT_SETTLED: 'success',
};

export const CATEGORY_ICONS: Record<NotificationCategory, IconName> = {
  PAYMENT: 'money',
  WORKFLOW: 'archive',
  FEEDBACK: 'info',
};

export {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS as CATEGORY_LABELS,
  NOTIFICATION_KIND_CATEGORY as KIND_CATEGORIES,
  type NotificationCategory,
};
