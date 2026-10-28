import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Badge } from '../../shared/ui/badge';
import { Icon, type IconName } from '../../shared/ui/icon';
import { Card } from '../../shared/ui/card';
import { EmptyState, ErrorState, LoadingState } from '../../shared/ui/states';
import { cn } from '../../shared/ui/cn';
import { formatIsoAsJalali, toPersianDigits } from '../../shared/format/money';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  KIND_ICONS,
  KIND_LABELS,
  KIND_TONES,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from './notification-kinds';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  type NotificationRow,
} from './notifications.api';

/**
 * صفحهٔ کامل اعلان‌ها.
 *
 * نشانِ سربرگ برای «همین حالا چه خبر شد» است و عمداً کوتاه می‌ماند؛ این صفحه برای
 * مرور کامل است: صفحه‌بندی سمت سرور، فیلتر خوانده‌نشده‌ها و جزئیات هر اعلان
 * (نوع، زمان، متن و سندِ مربوط) در یک نگاه.
 *
 * **دسته‌ها** از همین‌جا شروع شدند: کارپردازی که روزی ده اعلان «ارجاع به بایگانی»
 * می‌گیرد، نباید برای پیدا کردن یک شناسایی پرداخت فهرست را بالا و پایین کند.
 * شمارندهٔ کنار هر دسته روی **همهٔ** اعلان‌های کاربر است و نه دستهٔ باز، وگرنه
 * کسی که در «پیگیری پرداخت» ایستاده هرگز نمی‌دید در «بازخوردها» چیزی منتظرش است.
 */
export function NotificationsPage({
  onOpenDocument,
  onOpenSharedReport,
}: {
  onOpenDocument?: ((documentId: string) => void) | undefined;
  onOpenSharedReport?: ((sharedReportId: string) => void) | undefined;
}): JSX.Element {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | null>(null);

  const list = useNotificationList(page, unreadOnly, category);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = list.data?.unread ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={unreadOnly ? 'secondary' : 'primary'}
            aria-pressed={!unreadOnly}
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
          >
            همه
          </Button>
          <Button
            size="sm"
            variant={unreadOnly ? 'primary' : 'secondary'}
            aria-pressed={unreadOnly}
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
          >
            خوانده‌نشده
            {unread > 0 ? (
              <span className="money ms-1">({toPersianDigits(String(unread))})</span>
            ) : null}
          </Button>
        </div>

        {unread > 0 ? (
          <Button size="sm" variant="ghost" loading={markAll.isPending} onClick={() => markAll.mutate()}>
            <Icon name="check" size={15} />
            خواندن همه
          </Button>
        ) : null}
      </div>

      {/* ───────────── دسته‌ها ───────────── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <CategoryTab
          active={category === null}
          label="همه دسته‌ها"
          count={list.data?.unread ?? 0}
          onClick={() => {
            setCategory(null);
            setPage(1);
          }}
        />
        {NOTIFICATION_CATEGORIES.map((name) => (
          <CategoryTab
            key={name}
            active={category === name}
            icon={CATEGORY_ICONS[name]}
            label={CATEGORY_LABELS[name]}
            count={list.data?.unreadByCategory?.[name] ?? 0}
            onClick={() => {
              setCategory(name);
              setPage(1);
            }}
          />
        ))}
      </div>

      {list.isPending ? <LoadingState label="در حال خواندن اعلان‌ها…" /> : null}

      {list.isError ? (
        <ErrorState message="دریافت اعلان‌ها ناموفق بود" onRetry={() => void list.refetch()} />
      ) : null}

      {list.data && list.data.items.length === 0 ? (
        <EmptyState
          title={
            category === null
              ? unreadOnly
                ? 'اعلان خوانده‌نشده‌ای ندارید'
                : 'اعلانی ندارید'
              : `در «${CATEGORY_LABELS[category]}» اعلانی ندارید`
          }
          description="اعلان‌ها هنگام ارجاع سند، بایگانی، بازخورد و ثبت شناسایی پرداخت ساخته می‌شوند."
        />
      ) : null}

      {list.data && list.data.items.length > 0 ? (
        <ul className="space-y-2">
          {list.data.items.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              onMarkRead={() => markRead.mutate(item.id)}
              onOpenDocument={onOpenDocument}
              onOpenSharedReport={onOpenSharedReport}
            />
          ))}
        </ul>
      ) : null}

      {list.data && list.data.pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            صفحه {toPersianDigits(String(list.data.page))} از{' '}
            {toPersianDigits(String(list.data.pageCount))}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={list.data.page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              قبلی
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={list.data.page >= list.data.pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              بعدی
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** کلید یک دسته، با شمارندهٔ خوانده‌نشده‌هایش. */
function CategoryTab({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  icon?: IconName;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 font-semibold text-primary'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {label}
      {count > 0 ? (
        <span className="money rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
          {toPersianDigits(String(count))}
        </span>
      ) : null}
    </button>
  );
}

function NotificationCard({
  item,
  onMarkRead,
  onOpenDocument,
  onOpenSharedReport,
}: {
  item: NotificationRow;
  onMarkRead: () => void;
  onOpenDocument?: ((documentId: string) => void) | undefined;
  onOpenSharedReport?: ((sharedReportId: string) => void) | undefined;
}): JSX.Element {
  const isUnread = item.readAt === null;

  return (
    <li>
      <Card
        className={cn(
          'flex flex-wrap items-start gap-3 p-4 transition-colors',
          // خط رنگی کنارِ اعلان خوانده‌نشده: تفاوت باید از یک نگاه پیدا باشد، نه با
          // مقایسه‌ی ضخامت قلم دو ردیف کنار هم.
          isUnread ? 'border-s-2 border-s-primary bg-primary/5' : '',
        )}
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon name={KIND_ICONS[item.kind] ?? 'bell'} size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn('text-sm', isUnread ? 'font-semibold' : 'text-muted-foreground')}>
              {item.title}
            </p>
            <Badge tone={KIND_TONES[item.kind] ?? 'neutral'}>
              {KIND_LABELS[item.kind] ?? item.kind}
            </Badge>
            {isUnread ? <Badge tone="primary" dot>خوانده‌نشده</Badge> : null}
          </div>

          {item.body ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p>
          ) : null}

          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {formatIsoAsJalali(item.createdAt)}
            {item.document ? ` · سند: ${item.document.title}` : ''}
            {item.readAt !== null ? ` · خوانده‌شده در ${formatIsoAsJalali(item.readAt)}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {isUnread ? (
            <Button size="sm" variant="ghost" onClick={onMarkRead}>
              خواندم
            </Button>
          ) : null}
          {item.sharedReportId && onOpenSharedReport ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpenSharedReport(item.sharedReportId as string)}
            >
              نمایش گزارش
            </Button>
          ) : null}
          {item.documentId && onOpenDocument ? (
            <Button size="sm" variant="secondary" onClick={() => onOpenDocument(item.documentId as string)}>
              نمایش سند
            </Button>
          ) : null}
        </div>
      </Card>
    </li>
  );
}
