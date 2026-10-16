import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { formatIsoAsJalali, toPersianDigits } from '../../shared/format/money';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
  type NotificationKind,
} from './notifications.api';

const KIND_LABELS: Record<NotificationKind, string> = {
  DOCUMENT_SENT_TO_ARCHIVE: 'ارجاع به بایگانی',
  DOCUMENT_ARCHIVED: 'بایگانی نهایی',
  DOCUMENT_NEEDS_REVISION: 'ارجاع برای اصلاح',
  FEEDBACK_CREATED: 'بازخورد تازه',
  FEEDBACK_REPLIED: 'پاسخ بازخورد',
  FEEDBACK_RESOLVED: 'رسیدگی بازخورد',
};

/**
 * نشان اعلان‌ها در سربرگ.
 *
 * فهرست فقط وقتی باز می‌شود خوانده می‌شود، ولی شمارنده خوانده‌نشده‌ها دوره‌ای
 * به‌روز می‌شود — چون همان یک عدد است که کاربر را خبر می‌کند و خواندن کل فهرست برای
 * نمایش یک عدد، هزینه بی‌مورد است.
 *
 * رفتن به سند مربوط، کار این نشان نیست: اعلان فقط خبر می‌دهد. پیمایش به سند در فاز
 * بعد با مسیر‌یابی واقعی (URL) اضافه می‌شود؛ تا آن وقت ادعای لینک‌دار بودن نمی‌کند.
 */
export function NotificationBell({ onOpenDocument }: { onOpenDocument?: (documentId: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const count = unread.data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={count > 0 ? `اعلان‌ها، ${count} خوانده‌نشده` : 'اعلان‌ها'}
        className="relative rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
      >
        اعلان‌ها
        {count > 0 ? (
          <span className="absolute -top-2 -start-2 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-bold text-destructive-foreground">
            {toPersianDigits(String(count))}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="اعلان‌ها"
          className="absolute end-0 z-20 mt-2 w-[min(28rem,90vw)] rounded-lg border border-border bg-card p-4 shadow-lg"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">اعلان‌ها</h3>
            <div className="flex gap-1">
              {count > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={markAll.isPending}
                  onClick={() => markAll.mutate()}
                >
                  خواندن همه
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                بستن
              </Button>
            </div>
          </div>

          {notifications.isPending ? <LoadingState label="در حال خواندن اعلان‌ها…" /> : null}
          {notifications.isError ? (
            <ErrorState
              message="دریافت اعلان‌ها ناموفق بود"
              onRetry={() => void notifications.refetch()}
            />
          ) : null}

          {notifications.data ? (
            notifications.data.items.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">اعلانی ندارید.</p>
            ) : (
              <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
                {notifications.data.items.map((item) => (
                  <li key={item.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={
                            item.readAt === null ? 'text-sm font-semibold' : 'text-sm text-muted-foreground'
                          }
                        >
                          {item.title}
                        </p>
                        {item.body ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {KIND_LABELS[item.kind] ?? item.kind} · {formatIsoAsJalali(item.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {item.readAt === null ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markRead.mutate(item.id)}
                          >
                            خواندم
                          </Button>
                        ) : null}
                        {item.documentId && onOpenDocument ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onOpenDocument(item.documentId as string);
                              setOpen(false);
                            }}
                          >
                            نمایش سند
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
