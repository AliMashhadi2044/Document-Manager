import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { formatIsoAsJalali, toPersianDigits } from '../../shared/format/money';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from './notifications.api';
import { KIND_LABELS } from './notification-kinds';

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
export function NotificationBell({
  onOpenDocument,
  onOpenAll,
}: {
  onOpenDocument?: (documentId: string) => void;
  /** رفتن به صفحهٔ کامل اعلان‌ها. */
  onOpenAll?: (() => void) | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * مختصات پانل، گرفته‌شده از دکمه.
   *
   * پانل هم مثل پوشش در پورتال بدنه ساخته می‌شود. اگر در سربرگ بماند،
   * `z-index` اش درون زمینهٔ چینشِ سربرگ محبوس می‌شود و پوششِ سطح بدنه رویش
   * می‌افتد — یعنی کلیک روی دکمه‌های خود پانل هم به پوشش می‌خورد.
   */
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const measure = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      /*
       * پانل به لبهٔ دکمه چسبیده است، ولی باید **داخل پنجره** بماند.
       *
       * در چیدمان باریک، دکمهٔ اعلان نزدیک لبهٔ چپ است و چسباندن بی‌قید، پانل را
       * از صفحه بیرون می‌برد — دکمه‌هایش دیده می‌شوند ولی قابل کلیک نیستند.
       */
      const width = Math.min(448, window.innerWidth * 0.9);
      const edge = 8;
      const preferred = window.innerWidth - rect.right;
      const right = Math.min(Math.max(edge, preferred), Math.max(edge, window.innerWidth - width - edge));

      setAnchor({ top: rect.bottom + 8, right });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  /*
   * بستن با Escape و برگشت فوکوس.
   *
   * بدون برگرداندن فوکوس، کاربر کیبورد پس از بستن، فوکوسش به ابتدای صفحه می‌پرد.
   */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
  const unread = useUnreadCount();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const count = unread.data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={count > 0 ? `اعلان‌ها، ${count} خوانده‌نشده` : 'اعلان‌ها'}
        className={
          count > 0
            ? 'relative inline-flex size-9 items-center justify-center rounded-lg text-destructive transition-all duration-150 hover:bg-muted active:scale-95'
            : 'relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-95'
        }
      >
        <Icon name="bell" />
        {count > 0 ? (
          <>
            {/*
              دو لایه روی هم: حلقه‌ای که بیرون می‌زند و محو می‌شود (نبض)، و خودِ عدد.
              نبض فقط وقتی هست که اعلان خوانده‌نشده‌ای باشد — انیمیشن همیشگی، بعد از
              چند دقیقه دیگر دیده نمی‌شود و فقط حواس را پرت می‌کند.
            */}
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -start-0.5 size-4 rounded-full bg-destructive/70 animate-[var(--animate-ping-ring)] motion-reduce:hidden"
            />
            <span className="absolute -top-0.5 -start-0.5 min-w-4 rounded-full bg-destructive px-1 py-px text-center text-[10px] font-bold leading-4 text-destructive-foreground ring-2 ring-card">
              {toPersianDigits(String(count))}
            </span>
            <span className="sr-only">خوانده‌نشده</span>
          </>
        ) : null}
      </button>

      {open ? (
        <>
          {/*
            پوشش پشت پاپاپ: هم تمرکز را روی فهرست می‌برد و هم همان عنصری است که
            کلیک بیرون را می‌گیرد.

            در پورتال ساخته می‌شود و نه در جای خود: سربرگ `backdrop-blur` دارد و هر عنصری
            که فیلتر یا ترانسفورم داشته باشد، برای فرزندان `fixed` خود یک ظرف تازه می‌سازد —
            پوششی که فقط سربرگ را می‌پوشاند، کلیک بیرون را نمی‌گیرد.
          */}
          {createPortal(
            <>
              <div
                aria-hidden="true"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-[2px] animate-[var(--animate-fade-in)]"
              />

              <div
                role="dialog"
                aria-label="اعلان‌ها"
                aria-modal="true"
                style={{ position: 'fixed', top: anchor?.top ?? 0, right: anchor?.right ? anchor.right - 20 : 0  }}
                className="z-[61] w-[min(28rem,90vw)] rounded-xl border border-border bg-popover p-4 shadow-[var(--shadow-lift)] animate-[var(--animate-rise)]"
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
              {onOpenAll ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    onOpenAll();
                  }}
                >
                  همهٔ اعلان‌ها
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
            </>,
            document.body,
          )}
        </>
      ) : null}
    </div>
  );
}
