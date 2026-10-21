import { useEffect, useMemo, useState } from 'react';
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
import { AreaChart, BarChart, DonutChart, Gauge, RankedBars, Sparkline } from '../../shared/ui/charts';
import { DashboardHero } from './dashboard-hero';
import { DocumentPipeline } from './document-pipeline';
import type { CurrentUser } from '../auth/auth.api';
import { ErrorState } from '../../shared/ui/states';
import { DashboardSkeleton } from './dashboard-skeleton';
import { ApiError } from '../../shared/api/client';
import { cn } from '../../shared/ui/cn';
import { formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { AnimatedValue, Updating, UpdatingBar } from '../../shared/ui/animated-value';
import { useDashboard, useDashboardYears, type YearBasis } from './analytics.api';

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
export function DashboardPage({
  user,
  onCreateDocument,
  onOpenReports,
}: {
  user: CurrentUser;
  onCreateDocument?: (() => void) | undefined;
  onOpenReports?: (() => void) | undefined;
}): JSX.Element {
  const [basis, setBasis] = useState<YearBasis>('fiscal');
  const [year, setYear] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  const years = useDashboardYears();
  const dashboard = useDashboard(basis, year);

  const yearList = useMemo(
    () => (basis === 'jalali' ? (years.data?.jalali ?? []) : (years.data?.fiscal ?? [])),
    [basis, years.data],
  );

  /**
   * پیش‌فرض: تازه‌ترین سالِ همان مبنا — نه «همه سال‌ها».
   *
   * چرا نه همه سال‌ها: جمع چندساله در یک سامانه مالی کمتر به کار می‌آید؛ آنچه کاربر
   * روز اول می‌خواهد ببیند، سال جاری است. `touched` جلوی بازگرداندن انتخابِ خودِ کاربر
   * را می‌گیرد — اگر عمداً «همه سال‌ها» را زده، نباید دوباره پر شود.
   */
  useEffect(() => {
    if (touched || yearList.length === 0) return;
    setYear(yearList[0] ?? null);
  }, [touched, yearList]);

  const changeBasis = (next: YearBasis): void => {
    setBasis(next);
    // سال مالی ۱۴۰۵ و سال شمسی ۱۴۰۵ یک چیز نیستند، ولی فهرست‌ها تقریباً هم‌پوشانند؛
    // نگه داشتن همان عدد از تهی شدن ناگهانی داشبورد جلوگیری می‌کند.
    const available = next === 'jalali' ? (years.data?.jalali ?? []) : (years.data?.fiscal ?? []);
    if (year !== null && !available.includes(year)) setYear(available[0] ?? null);
  };

  /** بار اول اسکلت دارد؛ به‌روزرسانی‌های بعدی عدد قبلی را نگه می‌دارند. */
  const updating = dashboard.isFetching && dashboard.data !== undefined;

  if (dashboard.data === undefined && dashboard.isPending) return <DashboardSkeleton />;

  if (dashboard.isError && dashboard.data === undefined) {
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

  const data = dashboard.data as NonNullable<typeof dashboard.data>;
  const canCreateDocument = user.permissions.includes('document:create');

  /**
   * دایرهٔ وضعیت، بر اساس **تعداد سند** است، نه مبلغ.
   *
   * پیش از این سهم‌ها از مبلغ حساب می‌شد و نتیجه‌اش گمراه‌کننده بود: پیش‌نویس‌ها هنوز
   * فاکتوری ندارند، پس مبلغشان صفر است و ده‌ها سند سهم ۰٪ می‌گرفتند — دایره یک‌دست
   * تک‌رنگ می‌شد در حالی که کارت عنوانش «اسناد بر اساس وضعیت» است. مبلغ همانجا به‌عنوان
   * متن کمکی می‌آید، پس چیزی از دست نمی‌رود.
   */
  const statusData = data.byStatus.map((row) => ({
    label: statusLabel(row.status),
    value: row.count,
    hint: `${formatMoney(row.total, { withUnit: false })} ریال`,
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

  const monthTotals = (data.byMonth ?? []).map((row) => row.total);
  const monthCounts = (data.byMonth ?? []).map((row) => row.invoiceCount);

  // سهم مالیات و عوارض از مبلغ نهایی. محاسبه با bigint انجام می‌شود و فقط نسبتِ
  // حاصل — که همیشه بین صفر و یک است — به عدد ممیز شناور می‌رسد (ADR-0003).
  const totalAmount = BigInt(data.totals.total || '0');
  const taxAmount = BigInt(data.totals.tax || '0');
  const taxShare = totalAmount === 0n ? 0 : Number((taxAmount * 10_000n) / totalAmount) / 10_000;

  const discountAmount = BigInt(data.totals.discount || '0');
  const grossAmount = BigInt(data.totals.gross || '0');
  const discountShare =
    grossAmount === 0n ? 0 : Number((discountAmount * 10_000n) / grossAmount) / 10_000;

  /**
   * درصد خوانا.
   *
   * زیر ۱۰٪ یک رقم اعشار می‌گیرد: سهمی که گرد شود به «۰٪»، به کاربر می‌گوید «هیچ»
   * در حالی که مقدارش صفر نیست — و این در یک سامانه مالی، اطلاعات غلط است.
   */
  const percent = (share: number): string => {
    const value = share * 100;
    const text = value > 0 && value < 10 ? value.toFixed(1) : String(Math.round(value));
    return `${toPersianDigits(text)}٪`;
  };

  return (
    <div className="space-y-4">
      {/* ───────────── خوشامد و کنش‌های پرتکرار ───────────── */}
      <DashboardHero
        user={user}
        onCreateDocument={canCreateDocument ? onCreateDocument : undefined}
        onOpenReports={onOpenReports}
      />

      {/* ───────────── فیلتر سال ───────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">نمای کلی</p>
          {updating ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 animate-[var(--animate-ping-ring)] rounded-full bg-primary" />
              در حال به‌روزرسانی…
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              label="بر اساس"
              prefsKey={null}
              placeholder={null}
              value={basis}
              onChange={(nextValue) => changeBasis(nextValue as YearBasis)}
              options={[
                { value: 'fiscal', label: 'سال مالی' },
                { value: 'jalali', label: 'سال شمسی' },
              ]}
            />
          </div>

          <div className="w-44">
            <Select
              label={basis === 'jalali' ? 'سال شمسی' : 'سال مالی'}
              prefsKey={null}
              placeholder="همه سال‌ها"
              value={year === null ? '' : String(year)}
              onChange={(nextValue) => {
                setTouched(true);
                setYear(nextValue === '' ? null : Number(nextValue));
              }}
              options={yearList.map((item) => ({
                value: String(item),
                label: toPersianDigits(String(item)),
              }))}
              emptyLabel="سالی در دسترس شما ثبت نشده است"
            />
          </div>
        </div>
      </div>

      {/* ───────────── شمارنده‌های کلیدی ───────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          updating={updating}
          icon="documents"
          title="اسناد"
          value={toPersianDigits(String(data.documentCount))}
          caption={`${toPersianDigits(String(data.invoiceCount))} فاکتور`}
          tone="primary"
          spark={monthCounts}
          sparkTitle="روند تعداد فاکتورهای ماهانه"
        />
        <StatTile
          updating={updating}
          icon="money"
          title="جمع کل"
          value={formatMoney(data.totals.total, { withUnit: false })}
          caption="ریال، شامل مالیات و عوارض"
          tone="info"
          spark={monthTotals}
          sparkTitle="روند مبلغ ماهانه"
        />
        <StatTile
          updating={updating}
          icon="clock"
          title="در انتظار بایگانی"
          value={toPersianDigits(String(data.pendingArchiveCount))}
          caption="سند منتظر اقدام بایگان"
          tone={data.pendingArchiveCount > 0 ? 'warning' : 'neutral'}
        />
        <StatTile
          updating={updating}
          icon="alert"
          title="بازخورد باز"
          value={toPersianDigits(String(data.openFeedbackCount))}
          caption="نیازمند پاسخ یا رسیدگی"
          tone={data.openFeedbackCount > 0 ? 'danger' : 'success'}
        />
      </section>

      {/* ───────────── مسیر سند ───────────── */}
      <Updating active={updating} className="space-y-4">
      <Card>
        <CardHeader
          icon="layers"
          title="مسیر سند"
          description="ترتیب مرحله‌ها از پیش‌نویس تا بایگانی؛ مرحله‌ای که بیشترین سند را دارد، برجسته است."
        />
        <CardBody className="pt-3">
          <DocumentPipeline byStatus={data.byStatus} />
        </CardBody>
      </Card>

      {/* ───────────── تفکیک مبالغ ───────────── */}
      <Card>
        <CardHeader
          icon="trend-up"
          title="تفکیک مبالغ"
          description="از مبلغ کالا تا مبلغ نهایی؛ همان ترتیبی که در محاسبه فاکتور طی می‌شود."
        />
        <CardBody className="grid gap-5 pt-3 lg:grid-cols-[1fr_auto]">
          {/* مبالغ این سامانه می‌توانند از ۲^۵۳ هم بزرگ‌تر باشند؛ پنج ستون در عرض
              متوسط یعنی عددِ بریده. ستون‌ها فقط روی صفحه خیلی پهن پنج‌تا می‌شوند. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <AmountCell title="مبلغ کالا" value={data.totals.gross} />
            <AmountCell title="تخفیف" value={data.totals.discount} sign="−" />
            <AmountCell title="خالص" value={data.totals.net} />
            <AmountCell title="مالیات و عوارض" value={data.totals.tax} sign="+" />
            <AmountCell title="جمع کل" value={data.totals.total} emphasis />
          </div>

          {/* دو نسبتی که از خود اعداد بالا درمی‌آیند و خواندنشان از روی ارقام سخت است. */}
          <div className="flex items-center justify-center gap-6 border-border lg:border-s lg:ps-6">
            <Gauge
              ratio={taxShare}
              title="سهم مالیات و عوارض از مبلغ نهایی"
              label="سهم مالیات"
              value={percent(taxShare)}
            />
            <Gauge
              ratio={discountShare}
              title="سهم تخفیف از مبلغ کالا"
              label="سهم تخفیف"
              value={percent(discountShare)}
              tone="var(--color-chart-3)"
            />
          </div>
        </CardBody>
      </Card>

      {/* ───────────── روند ماهانه ───────────── */}
      <Card>
        <CardHeader
          icon="chart"
          title="روند ماهانه فاکتورها"
          description={
            data.year === null
              ? 'بر اساس تازه‌ترین سال موجود در دامنه دسترسی شما'
              : `${data.basis === 'jalali' ? 'سال شمسی' : 'سال مالی'} ${toPersianDigits(String(data.year))}`
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
            description="سهم هر وضعیت از تعداد اسناد؛ مبلغ هر وضعیت کنار برچسبش می‌آید."
          />
          <CardBody className="pt-4">
            <DonutChart
              data={statusData}
              money={false}
              title="سهم هر وضعیت از تعداد اسناد"
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
                value: row.count,
                hint: `${formatMoney(row.total, { withUnit: false })} ریال`,
              }))}
              money={false}
              title="سهم هر نوع سند از تعداد اسناد"
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
      </Updating>
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
  spark,
  sparkTitle,
  updating = false,
}: {
  icon: IconName;
  title: string;
  value: string;
  caption: string;
  tone: keyof typeof TILE_TONES;
  /** روند ماهانه برای خط کوچک زیر کاشی؛ نبودنش کاشی را خراب نمی‌کند. */
  spark?: readonly (string | number)[];
  sparkTitle?: string;
  /** عدد فعلی کهنه است و پاسخ تازه در راه است. */
  updating?: boolean;
}): JSX.Element {
  return (
    <Card interactive className="relative overflow-hidden p-4">
      <UpdatingBar active={updating} />
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            TILE_TONES[tone],
          )}
        >
          <Icon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="money mt-0.5 truncate text-xl font-bold">
            <AnimatedValue value={value} title={value} />
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{caption}</p>
        </div>
      </div>

      {spark && spark.length > 1 ? (
        <div className="-mx-4 -mb-4 mt-3">
          <Sparkline values={spark} title={sparkTitle ?? title} />
        </div>
      ) : null}
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
      <p className={cn('money mt-1 truncate text-lg font-bold text-center', emphasis && 'text-primary')}>
        <AnimatedValue value={formatMoney(value, { withUnit: false })} title={formatMoney(value)} />
      </p>
    </div>
  );
}
