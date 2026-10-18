import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '@dm/shared';

import { Icon, type IconName } from '../../shared/ui/icon';
import { cn } from '../../shared/ui/cn';
import { formatMoney, toPersianDigits } from '../../shared/format/money';

/**
 * مسیر سند، از پیش‌نویس تا بایگانی.
 *
 * چرا این نما به جدول وضعیت‌ها اضافه شده: جدول می‌گوید «چند سند در هر وضعیت است»،
 * ولی نمی‌گوید **ترتیب** وضعیت‌ها چیست. برای کسی که تازه با سامانه کار می‌کند،
 * همین ترتیب مهم‌ترین چیزی است که باید بفهمد؛ و برای کاربر روزمره، گلوگاه را نشان
 * می‌دهد: مرحله‌ای که اسناد در آن تلنبار شده‌اند.
 *
 * وضعیت‌های خارج از مسیر اصلی (نیازمند اصلاح، بازگشایی‌شده) اینجا نمی‌آیند؛ آن‌ها
 * انشعاب‌اند نه مرحله، و در فهرست وضعیت‌ها دیده می‌شوند.
 */
const STAGES: readonly { readonly status: DocumentStatus; readonly icon: IconName }[] = [
  { status: 'DRAFT', icon: 'edit' },
  { status: 'FINALIZED', icon: 'check' },
  { status: 'PENDING_ARCHIVE', icon: 'clock' },
  { status: 'ARCHIVED', icon: 'archive' },
];

export function DocumentPipeline({
  byStatus,
}: {
  byStatus: readonly { readonly status: string; readonly count: number; readonly total: string }[];
}): JSX.Element {
  const rowFor = (status: DocumentStatus) => byStatus.find((row) => row.status === status);
  const busiest = STAGES.reduce(
    (top, stage) => {
      const count = rowFor(stage.status)?.count ?? 0;
      return count > top.count ? { status: stage.status, count } : top;
    },
    { status: null as DocumentStatus | null, count: 0 },
  );

  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((stage, index) => {
        const row = rowFor(stage.status);
        const count = row?.count ?? 0;
        const isBusiest = busiest.status === stage.status && count > 0;

        return (
          <li key={stage.status} className="relative">
            {/* پیکان بین مرحله‌ها — فقط روی صفحه پهن، وگرنه کارت‌ها زیر هم‌اند. */}
            {index < STAGES.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute -start-2.5 top-1/2 hidden -translate-y-1/2 text-border xl:block"
              >
                <Icon name="chevron-start" size={18} />
              </span>
            ) : null}

            <div
              className={cn(
                'h-full rounded-xl border p-4 transition-shadow',
                isBusiest
                  ? 'border-primary/40 bg-primary/5 shadow-[var(--shadow-soft)]'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    isBusiest ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon name={stage.icon} size={16} />
                </span>
                <p className="min-w-0 truncate text-xs font-medium">
                  {DOCUMENT_STATUS_LABELS[stage.status]}
                </p>
              </div>

              <p className="money mt-3 text-2xl font-bold leading-none">
                {toPersianDigits(String(count))}
              </p>
              <p className="money mt-1.5 truncate text-[11px] text-muted-foreground">
                {formatMoney(row?.total ?? '0', { withUnit: false })} ریال
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
