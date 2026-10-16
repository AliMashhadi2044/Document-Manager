import { useState } from 'react';

import { Select } from '../../shared/ui/select';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useDashboard, useFiscalYears } from './analytics.api';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  FINALIZED: 'ثبت نهایی',
  PENDING_ARCHIVE: 'در انتظار بایگانی',
  ARCHIVED: 'بایگانی‌شده',
  NEEDS_REVISION: 'نیازمند اصلاح',
};

const TYPE_LABELS: Record<string, string> = { NORMAL: 'عادی', STAD: 'ستاد' };

/**
 * داشبورد.
 *
 * همه اعداد از کوئری‌های تجمیعی سرور می‌آیند و همه در **دامنه دسترسی همان کاربر**
 * حساب شده‌اند: کاربری که پیش‌نویس‌ها را در فهرست اسناد نمی‌بیند، جمعشان را اینجا هم
 * نمی‌بیند. داشبورد یک نمای خلاصه است، نه یک در پشتی.
 */
export function DashboardPage(): JSX.Element {
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const years = useFiscalYears();
  const dashboard = useDashboard(fiscalYear);

  if (dashboard.isPending) return <LoadingState label="در حال خواندن داشبورد…" />;
  if (dashboard.isError) {
    return (
      <ErrorState
        title="خواندن داشبورد ناموفق بود"
        message={
          dashboard.error instanceof ApiError
            ? formatServerMessage(dashboard.error.message)
            : 'خطای نامشخص'
        }
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const data = dashboard.data;

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">داشبورد</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            همه اعداد در دامنه دسترسی شما و با کوئری تجمیعی سرور حساب شده‌اند.
          </p>
        </div>

        <div className="w-44">
          <Select
            label="سال مالی"
            placeholder="همه سال‌ها"
            value={fiscalYear === null ? '' : String(fiscalYear)}
            onChange={(event) =>
              setFiscalYear(event.target.value === '' ? null : Number(event.target.value))
            }
            options={(years.data ?? []).map((year) => ({
              value: String(year),
              label: toPersianDigits(String(year)),
            }))}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile title="تعداد اسناد" value={toPersianDigits(String(data.documentCount))} />
        <Tile title="تعداد فاکتورها" value={toPersianDigits(String(data.invoiceCount))} />
        <Tile
          title="بازخورد باز"
          value={toPersianDigits(String(data.openFeedbackCount))}
          tone={data.openFeedbackCount > 0 ? 'warning' : 'normal'}
        />
        <Tile
          title="در انتظار بایگانی"
          value={toPersianDigits(String(data.pendingArchiveCount))}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile title="جمع مبلغ کالا" value={formatMoney(data.totals.gross)} />
        <Tile title="جمع تخفیف" value={formatMoney(data.totals.discount)} />
        <Tile title="جمع خالص" value={formatMoney(data.totals.net)} />
        <Tile title="جمع مالیات و عوارض" value={formatMoney(data.totals.tax)} />
        <Tile title="جمع کل" value={formatMoney(data.totals.total)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="اسناد بر اساس وضعیت"
          rows={data.byStatus.map((row) => ({
            label: STATUS_LABELS[row.status] ?? row.status,
            count: row.count,
            total: row.total,
          }))}
        />
        <Breakdown
          title="اسناد بر اساس نوع"
          rows={data.byType.map((row) => ({
            label: TYPE_LABELS[row.type] ?? row.type,
            count: row.count,
            total: row.total,
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="ده فروشنده با بیشترین مبلغ"
          countLabel="فاکتور"
          rows={data.topVendors.map((row) => ({
            label: row.name,
            count: row.invoiceCount,
            total: row.total,
            extra: row.tax,
          }))}
          extraLabel="مالیات"
        />
        <Breakdown
          title="ده فصل بودجه با بیشترین مبلغ"
          countLabel="فاکتور"
          rows={data.byChapter.map((row) => ({
            label: row.chapterTitle,
            count: row.invoiceCount,
            total: row.total,
            extra: row.tax,
          }))}
          extraLabel="مالیات"
        />
      </div>
    </div>
  );
}

function Tile({
  title,
  value,
  tone = 'normal',
}: {
  title: string;
  value: string;
  tone?: 'normal' | 'warning';
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p
        className={`mt-1 truncate text-base font-bold tabular-nums ${
          tone === 'warning' ? 'text-warning' : ''
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  countLabel = 'سند',
  extraLabel,
}: {
  title: string;
  rows: readonly {
    readonly label: string;
    readonly count: number;
    readonly total: string;
    readonly extra?: string;
  }[];
  countLabel?: string;
  extraLabel?: string;
}): JSX.Element {
  // سهم هر ردیف از بزرگ‌ترین ردیف — نوار نسبی، بدون کتابخانه نمودار.
  const max = rows.reduce((top, row) => {
    const value = BigInt(row.total || '0');
    return value > top ? value : top;
  }, 0n);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">داده‌ای برای نمایش نیست.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row, index) => {
            const value = BigInt(row.total || '0');
            const share = max === 0n ? 0 : Number((value * 1000n) / max) / 10;

            return (
              <li key={`${row.label}-${index}`} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate" title={row.label}>
                    {row.label}
                  </span>
                  <span className="text-muted-foreground">
                    {toPersianDigits(String(row.count))} {countLabel}
                  </span>
                  <span className="tabular-nums">{formatMoney(row.total, { withUnit: false })}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary/60" style={{ width: `${share}%` }} />
                </div>
                {extraLabel && row.extra !== undefined ? (
                  <p className="text-[11px] text-muted-foreground">
                    {extraLabel}: {formatMoney(row.extra, { withUnit: false })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
