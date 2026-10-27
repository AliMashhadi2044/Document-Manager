import { DOCUMENT_STATUS_LABELS, PAYMENT_SETTLEMENT_LABELS, type DocumentStatus } from '@dm/shared';

import { Icon, type IconName } from '../../shared/ui/icon';
import { cn } from '../../shared/ui/cn';
import { formatMoney, toPersianDigits } from '../../shared/format/money';

/**
 * مسیر سند، از پیش‌نویس تا تسویهٔ پرداخت.
 *
 * چرا این نما به جدول وضعیت‌ها اضافه شده: جدول می‌گوید «چند سند در هر وضعیت است»،
 * ولی نمی‌گوید **ترتیب** وضعیت‌ها چیست. برای کسی که تازه با سامانه کار می‌کند،
 * همین ترتیب مهم‌ترین چیزی است که باید بفهمد؛ و برای کاربر روزمره، گلوگاه را نشان
 * می‌دهد: مرحله‌ای که اسناد در آن تلنبار شده‌اند.
 *
 * **مسیر به بایگانی ختم نمی‌شود.** سندی که به بایگانی رسیده هنوز ممکن است پولش
 * نرفته باشد؛ پس دو کارت آخر، وضعیت پرداخت‌اند.
 *
 * این دو کارت **بُعد دیگری** از همان اسنادند، نه مرحلهٔ پنجم و ششم: بایگان وضعیت
 * پرداخت را از لحظهٔ ارجاع سند می‌تواند ثبت کند، پس یک سند هم در «در انتظار
 * بایگانی» دیده می‌شود و هم در «شناسایی». جمعِ شش کارت، تعداد اسناد نیست — و
 * راهنمای همین کارت صریحاً می‌گویدش، چون عددی که توضیح ندارد، حدس می‌شود.
 *
 * وضعیت‌های خارج از مسیر اصلی (نیازمند اصلاح، بازگشایی‌شده) اینجا نمی‌آیند؛ آن‌ها
 * انشعاب‌اند نه مرحله، و در فهرست وضعیت‌ها دیده می‌شوند.
 */

/** مرحله‌های گردش کار — زنجیره‌ای، با پیکان بینشان. */
const STAGES: readonly { readonly status: DocumentStatus; readonly icon: IconName }[] = [
  { status: 'DRAFT', icon: 'edit' },
  { status: 'FINALIZED', icon: 'check' },
  { status: 'PENDING_ARCHIVE', icon: 'clock' },
  { status: 'ARCHIVED', icon: 'archive' },
];

export interface SettlementStages {
  readonly fullyPaid: { readonly count: number; readonly total: string };
  readonly outstanding: { readonly count: number; readonly total: string };
  readonly unset: { readonly count: number; readonly total: string };
}

export function DocumentPipeline({
  byStatus,
  settlement,
}: {
  byStatus: readonly { readonly status: string; readonly count: number; readonly total: string }[];
  /** وضعیت پرداخت در **همان دامنه‌ای** که بقیهٔ اعداد صفحه حساب شده‌اند. */
  settlement: SettlementStages;
}): JSX.Element {
  const rowFor = (status: DocumentStatus) => byStatus.find((row) => row.status === status);

  const workflow = STAGES.map((stage) => ({
    key: stage.status,
    icon: stage.icon,
    label: DOCUMENT_STATUS_LABELS[stage.status],
    caption: null as string | null,
    count: rowFor(stage.status)?.count ?? 0,
    amount: rowFor(stage.status)?.total ?? '0',
    tone: 'default' as 'default' | 'success' | 'danger',
  }));

  /*
    دو کارت پرداخت.

    «تعیین‌نشده» کارتِ خودش را ندارد و عمداً: این ردیف دربارهٔ **کارِ انجام‌شده**
    است و «هنوز تعیین نشده» کاری نیست که انجام شده باشد. شمارش کاملش در کاشی
    جداگانهٔ بالای صفحه می‌آید.
  */
  const payment = [
    {
      key: 'FULLY_PAID',
      icon: 'money' as IconName,
      label: PAYMENT_SETTLEMENT_LABELS.FULLY_PAID,
      caption: null,
      count: settlement.fullyPaid.count,
      amount: settlement.fullyPaid.total,
      tone: 'success' as const,
    },
    {
      key: 'OUTSTANDING',
      icon: 'alert' as IconName,
      label: PAYMENT_SETTLEMENT_LABELS.OUTSTANDING,
      caption: 'مبلغ باقی‌مانده',
      count: settlement.outstanding.count,
      amount: settlement.outstanding.total,
      tone: 'danger' as const,
    },
  ];

  const stages = [...workflow, ...payment];

  // شلوغ‌ترین مرحله، فقط میان مرحله‌های گردش کار: «گلوگاه» دربارهٔ کار است، نه پول.
  const busiest = workflow.reduce(
    (top, stage) => (stage.count > top.count ? { key: stage.key, count: stage.count } : top),
    { key: '', count: 0 },
  );

  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {stages.map((stage, index) => {
        const highlighted = busiest.key === stage.key && stage.count > 0;

        return (
          <li key={stage.key} className="relative">
            {/*
              پیکان فقط **میان مرحله‌های گردش کار**.

              میان «بایگانی» و «پرداخت کامل» پیکان نمی‌آید: آن دو کارت، بُعد دیگری
              از همان اسنادند و نه گام بعدی؛ پیکان، ترتیبی را می‌گفت که وجود ندارد.
            */}
            {index > 0 && index < workflow.length ? (
              <span
                aria-hidden="true"
                className="absolute -start-2.5 top-1/2 hidden -translate-y-1/2 text-border 2xl:block"
              >
                <Icon name="chevron-start" size={18} />
              </span>
            ) : null}

            <div
              className={cn(
                'h-full rounded-xl border p-4 transition-shadow',
                highlighted
                  ? 'border-primary/40 bg-primary/5 shadow-[var(--shadow-soft)]'
                  : stage.tone === 'success'
                    ? 'border-success/30 bg-success/5'
                    : stage.tone === 'danger' && stage.count > 0
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-border bg-card',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    highlighted
                      ? 'bg-primary/15 text-primary'
                      : stage.tone === 'success'
                        ? 'bg-success/15 text-success'
                        : stage.tone === 'danger' && stage.count > 0
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon name={stage.icon} size={16} />
                </span>
                <p className="min-w-0 truncate text-xs font-medium">{stage.label}</p>
              </div>

              <p className="money mt-3 text-2xl font-bold leading-none">
                {toPersianDigits(String(stage.count))}
              </p>
              <p className="money mt-1.5 truncate text-[11px] text-muted-foreground">
                {formatMoney(stage.amount, { withUnit: false })} ریال
                {stage.caption === null ? '' : ` · ${stage.caption}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
