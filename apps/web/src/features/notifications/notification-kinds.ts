import type { IconName } from '../../shared/ui/icon';
import type { BadgeTone } from '../../shared/ui/badge';
import type { NotificationKind } from './notifications.api';

/**
 * برچسب، آیکون و رنگ هر نوع اعلان — یک جا.
 *
 * `Record<NotificationKind, …>` عمدی است و نه یک شیء ساده: افزودن نوع تازه به enum
 * باید **کامپایل را بشکند**، نه اینکه کد خام نوع در رابط دیده شود. همین اشتباه
 * یک‌بار در داشبورد با وضعیت «بازگشایی‌شده» رخ داد.
 */
export const KIND_LABELS: Record<NotificationKind, string> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'ارجاع به بایگانی',
  DOCUMENT_ARCHIVED: 'بایگانی نهایی',
  DOCUMENT_NEEDS_REVISION: 'ارجاع برای اصلاح',
  FEEDBACK_CREATED: 'بازخورد تازه',
  FEEDBACK_REPLIED: 'پاسخ بازخورد',
  FEEDBACK_RESOLVED: 'رسیدگی بازخورد',
};

export const KIND_ICONS: Record<NotificationKind, IconName> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'archive',
  DOCUMENT_ARCHIVED: 'check',
  DOCUMENT_NEEDS_REVISION: 'alert',
  FEEDBACK_CREATED: 'info',
  FEEDBACK_REPLIED: 'info',
  FEEDBACK_RESOLVED: 'check',
};

export const KIND_TONES: Record<NotificationKind, BadgeTone> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'warning',
  DOCUMENT_ARCHIVED: 'success',
  DOCUMENT_NEEDS_REVISION: 'danger',
  FEEDBACK_CREATED: 'info',
  FEEDBACK_REPLIED: 'info',
  FEEDBACK_RESOLVED: 'success',
};
