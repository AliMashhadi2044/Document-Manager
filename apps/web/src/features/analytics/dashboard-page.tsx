import { useState } from 'react';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  type DocumentStatus,
  type DocumentType,
} from '@dm/shared';

import { Select } from '../../shared/ui/select';
import { Card, CardBody, CardHeader } from '../../shared/ui/card';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { Icon, type IconName } from '../../shared/ui/icon';
import { AreaChart, BarChart, DonutChart, RankedBars } from '../../shared/ui/charts';
import { ErrorState } from '../../shared/ui/states';
import { DashboardSkeleton } from './dashboard-skeleton';
import { ApiError } from '../../shared/api/client';
import { cn } from '../../shared/ui/cn';
import { formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useDashboard, useFiscalYears } from './analytics.api';

/**
 * برچسب‌ها از `@dm/shared` می‌آیند، نه از فهرستی در همین فایل.
 *
 * فهرست دستی اینجا یک‌بار هزینه داد: وضعیت «بازگشایی‌شده» به enum اضافه شده بود ولی
 * این فهرست به‌روز نشد و داشبورد کد خام `REOPENED` را به کاربر نشان می‌داد.
 */
const statusLabel = (status: string): string =>
  DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status;

const typeLabel = (type: string): string =>
  DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;

const STATUS_TONES: Record<DocumentStatus, BadgeTone> = {
  DRAFT: 'neutral',
  FINALIZED: 'info',
  PENDING_ARCHIVE: 'warning',
  ARCHIVED: 'success',
  NEEDS_REVISION: 'danger',
  REOPENED: 'warning',
};



/**
 * داشبورد.
 *
 * همه اعداد از کوئری‌های تجمیعی سرور می‌آیند و همه در **دامنه دسترسی همان کاربر**
 * حساب شده‌اند: کاربری که پیش‌نویس‌ها را در فهرست اسناد نمی‌بیند، جمعشان را اینجا هم
 * نمی‌بیند. داشبورد یک نمای خلاصه است، نه یک در پشتی.
 *
 * چیدمان از بالا به پایین، از «چقدر» به «چرا» می‌رود: اول چند عدد کلیدی، بعد روند
 * زمانی، بعد ترکیب‌ها و در آخر رتبه‌بندی‌ها. کاربری که فقط ده ثانیه نگاه می‌کند،
 * همان ده ثانیه را به مهم‌ترین اعداد می‌دهد.
 */
export function DashboardPage(): JSX.Element {
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const years = useFiscalYears();
  const dashboard = useDashboard(fiscalYear);

  if (dashboard.isPending) return <DashboardSkeleton />;

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

  const statusData = data.byStatus.map((row) => ({
    label: statusLabel(row.status),
    value: row.total,
    hint: toPersianDigits(String(row.count)),
  }));

  const monthData = (data.byMonth ?? []).map((row) => ({
    label: row.label,
    value: row.total,
    hint: toPersianDigits(String(row.invoiceCount)),
  }));

  const monthlyTotal = (data.byMonth ?? []).reduce(
    (sum, row) => sum + BigInt(row.total || '0'),
    0n,
  );

  return (
    <div className="space-y-4">
      {/* ───────────── نوار عنوان و فیلتر ───────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            همه اعداد در دامنه دسترسی شما و با کوئری تجمیعی سرور حساب شده‌اند.
          </p>
        </div>

        <div className="w-48">
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
      </div>

      {/* ───────────── شمارنده‌های کلیدی ───────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon="documents"
          title="اسناد"
          value={toPersianDigits(String(data.documentCount))}
          caption={`${toPersianDigits(String(data.invoiceCount))} فاکتور`}
          tone="primary"
        />
        <StatTile
          icon="money"
          title="جمع کل"
          value={formatMoney(data.totals.total, { withUnit: false })}
          caption="ریال، شامل مالیات و عوارض"
          tone="info"
        />
        <StatTile
          icon="clock"
          title="در انتظار بایگانی"
          value={toPersianDigits(String(data.pendingArchiveCount))}
          caption="سند منتظر اقدام بایگان"
          tone={data.pendingArchiveCount > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          icon="alert"
          title="بازخورد باز"
          value={toPersianDigits(String(data.openFeedbackCount))}
          caption="نیازمند پاسخ یا رسیدگی"
          tone={data.openFeedbackCount > 0 ? 'danger' : 'success'}
        />
      </section>

      {/* ───────────── تفکیک مبالغ ───────────── */}
      <Card>
        <CardHeader
          icon="trend-up"
          title="تفکیک مبالغ"
          description="از مبلغ کالا تا مبلغ نهایی؛ همان ترتیبی که در محاسبه فاکتور طی می‌شود."
        />
        <CardBody className="grid gap-3 pt-3 sm:grid-cols-3 xl:grid-cols-5">
          <AmountCell title="مبلغ کالا" value={data.totals.gross} />
          <AmountCell title="تخفیف" value={data.totals.discount} sign="−" />
          <AmountCell title="خالص" value={data.totals.net} />
          <AmountCell title="مالیات و عوارض" value={data.totals.tax} sign="+" />
          <AmountCell title="جمع کل" value={data.totals.total} emphasis />
        </CardBody>
      </Card>

      {/* ───────────── روند ماهانه ───────────── */}
      <Card>
        <CardHeader
          icon="chart"
          title="روند ماهانه فاکتورها"
          description={
            data.fiscalYear === null
              ? 'بر اساس تازه‌ترین سال مالی موجود در دامنه دسترسی شما'
              : `سال مالی ${toPersianDigits(String(data.fiscalYear))}`
          }
          action={
            <Badge tone="primary">
              جمع سال: {formatMoney(monthlyTotal.toString(), { withUnit: false })}
            </Badge>
          }
        />
        <CardBody className="pt-4">
          {monthData.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              برای این دامنه، فاکتوری با تاریخ صورتحساب ثبت نشده است.
            </p>
          ) : (
            <div className="space-y-6">
              <BarChart data={monthData} title="مبلغ فاکتورهای هر ماه شمسی" />
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs text-muted-foreground">روند پیوسته همان داده</p>
                <AreaChart data={monthData} title="روند مبلغ ماهانه" />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ───────────── ترکیب‌ها ───────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon="layers"
            title="اسناد بر اساس وضعیت"
            description="سهم هر وضعیت از مبلغ کل اسناد"
          />
          <CardBody className="pt-4">
            <DonutChart
              data={statusData}
              title="سهم وضعیت‌ها از مبلغ کل"
              centerLabel="سند"
              centerValue={toPersianDigits(String(data.documentCount))}
            />
            <ul className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
              {data.byStatus.map((row) => (
                <li key={row.status}>
                  <Badge tone={STATUS_TONES[row.status as DocumentStatus] ?? 'neutral'} dot>
                    {statusLabel(row.status)}
                    <span className="money ms-1">{toPersianDigits(String(row.count))}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon="documents" title="اسناد بر اساس نوع" description="عادی در برابر ستاد" />
          <CardBody className="pt-4">
            <DonutChart
              data={data.byType.map((row) => ({
                label: typeLabel(row.type),
                value: row.total,
              }))}
              title="سهم نوع سند از مبلغ کل"
              centerLabel="نوع سند"
              centerValue={toPersianDigits(String(data.byType.length))}
            />
            <ul className="mt-5 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
              {data.byType.map((row) => (
                <li
                  key={row.type}
                  className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                >
                  <span>{typeLabel(row.type)}</span>
                  <span className="money font-medium">
                    {toPersianDigits(String(row.count))} سند
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* ───────────── رتبه‌بندی‌ها ───────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon="store"
            title="ده فروشنده با بیشترین مبلغ"
            description="مبلغ نهایی فاکتورها، به ترتیب نزولی"
          />
          <CardBody className="pt-4">
            <RankedBars
              title="ده فروشنده با بیشترین مبلغ"
              countLabel="فاکتور"
              data={data.topVendors.map((row) => ({
                label: row.name,
                value: row.total,
                hint: toPersianDigits(String(row.invoiceCount)),
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon="database"
            title="ده فصل بودجه با بیشترین مبلغ"
            description="بر اساس عنوان فصل در لحظه ثبت فاکتور (snapshot)"
          />
          <CardBody className="pt-4">
            <RankedBars
              title="ده فصل بودجه با بیشترین مبلغ"
              countLabel="فاکتور"
              data={data.byChapter.map((row) => ({
                label: row.chapterTitle,
                value: row.total,
                hint: toPersianDigits(String(row.invoiceCount)),
              }))}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  success: 'bg-success/10 text-success',
  neutral: 'bg-muted text-muted-foreground',
};

function StatTile({
  icon,
  title,
  value,
  caption,
  tone,
}: {
  icon: IconName;
  title: string;
  value: string;
  caption: string;
  tone: keyof typeof TILE_TONES;
}): JSX.Element {
  return (
    <Card interactive className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            TILE_TONES[tone],
          )}
        >
          <Icon name={icon} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="money mt-0.5 truncate text-xl font-bold" title={value}>
            {value}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{caption}</p>
        </div>
      </div>
    </Card>
  );
}

function AmountCell({
  title,
  value,
  sign,
  emphasis = false,
}: {
  title: string;
  value: string;
  sign?: string;
  emphasis?: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        emphasis ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30',
      )}
    >
      <p className="text-[11px] text-muted-foreground">
        {sign ? <span aria-hidden="true">{sign} </span> : null}
        {title}
      </p>
      <p
        className={cn('money mt-1 truncate text-sm font-bold', emphasis && 'text-primary')}
        title={formatMoney(value)}
      >
        {formatMoney(value, { withUnit: false })}
      </p>
    </div>
  );
}
