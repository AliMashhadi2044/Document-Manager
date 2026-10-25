import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  OUTSTANDING_FOLLOW_UP_DAYS,
  PAYMENT_SETTLEMENT_LABELS,
  outstandingAge,
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
import { InfoHint } from '../../shared/ui/info-hint';
import { Segmented } from '../../shared/ui/segmented';
import {
  useDashboard,
  useDashboardYears,
  type SettlementView,
  type YearBasis,
} from './analytics.api';

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
  const [settlement, setSettlement] = useState<SettlementView>('all');

  const years = useDashboardYears();
  const dashboard = useDashboard(basis, year, settlement);

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

  /*
    متن دامنه — یک جا، و در **هر** راهنما تکرار می‌شود.

    انگیزه‌اش یک سوءتفاهم واقعی است: کاربر عددی را می‌دید و نمی‌دانست مال کدام
    سال است، با کدام مبنا، و آیا فیلتر وضعیت پرداخت رویش خورده یا نه. نوشتن این
    سه در هر راهنما، همان سه سؤال را از پیش جواب می‌دهد.
  */
  const basisLabel = data.basis === 'jalali' ? 'سال شمسی' : 'سال مالی';
  const yearLabel =
    data.year === null
      ? 'همهٔ سال‌ها'
      : `${basisLabel} ${toPersianDigits(String(data.year))}`;
  const settlementLabel =
    settlement === 'all'
      ? 'همهٔ وضعیت‌های پرداخت'
      : settlement === 'UNSET'
        ? 'فقط اسنادی که وضعیت پرداختشان تعیین نشده'
        : `فقط اسناد با وضعیت «${PAYMENT_SETTLEMENT_LABELS[settlement]}»`;

  /** «این عدد روی چه مجموعه‌ای حساب شده» — پایانِ هر راهنما. */
  const scopeNote = (
    <>
      <span className="mt-1.5 block border-t border-border pt-1.5 text-muted-foreground">
        دامنه: {yearLabel} · {settlementLabel} · فقط اسنادی که شما اجازهٔ دیدنشان را دارید.
      </span>
    </>
  );

  const settlementSummary = data.settlementSummary;
  const followUps = data.outstandingFollowUps ?? [];
  const settledCount =
    settlementSummary.fullyPaid.count +
    settlementSummary.outstanding.count +
    settlementSummary.unset.count;

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

  /*
    برچسب ماه، و سالش در متن راهنما.

    در مبنای سال مالی، محور از مهر شروع می‌شود و شش ماه آخرش در سال شمسی بعدی است؛
    بدون نوشتن سال، «فروردین» در انتهای نمودارِ سال مالی ۱۴۰۴ گمراه‌کننده بود.
  */
  const monthData = (data.byMonth ?? []).map((row) => ({
    label: row.label,
    value: row.total,
    hint: `${row.label} ${toPersianDigits(String(row.jalaliYear))} · ${toPersianDigits(
      String(row.invoiceCount),
    )} فاکتور`,
  }));

  const firstMonth = data.byMonth?.[0];
  const lastMonth = data.byMonth?.[data.byMonth.length - 1];
  const monthRangeLabel =
    firstMonth && lastMonth
      ? `${firstMonth.label} ${toPersianDigits(String(firstMonth.jalaliYear))} تا ${
          lastMonth.label
        } ${toPersianDigits(String(lastMonth.jalaliYear))}`
      : null;

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

      {/*
        فیلتر وضعیت پرداخت — روی **همهٔ** اعداد داشبورد.

        نیمه‌فیلتر کردن (مثلاً فقط کاشی‌های پرداخت) بدتر از بی‌فیلتر بودن است:
        کاربر نمی‌داند کدام عدد فیلتر شده و کدام نه. تنها استثنا کارت «وضعیت
        پرداخت» است که باید همهٔ حالت‌ها را نشان دهد، و خودش می‌گویدش.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="وضعیت پرداخت"
          value={settlement}
          onChange={(next) => setSettlement(next as SettlementView)}
          options={[
            { value: 'all', label: 'همه وضعیت‌ها', icon: 'layers' },
            {
              value: 'OUTSTANDING',
              label: PAYMENT_SETTLEMENT_LABELS.OUTSTANDING,
              icon: 'alert',
              badge: toPersianDigits(String(settlementSummary.outstanding.count)),
            },
            {
              value: 'FULLY_PAID',
              label: PAYMENT_SETTLEMENT_LABELS.FULLY_PAID,
              icon: 'check',
              badge: toPersianDigits(String(settlementSummary.fullyPaid.count)),
            },
            {
              value: 'UNSET',
              label: 'تعیین‌نشده',
              icon: 'clock',
              badge: toPersianDigits(String(settlementSummary.unset.count)),
            },
          ]}
        />
        <InfoHint label="فیلتر وضعیت پرداخت">
          وضعیت پرداخت را <strong>بایگانی</strong> پس از ارجاع سند ثبت می‌کند. انتخاب هر گزینه،
          همهٔ اعداد این صفحه را به همان زیرمجموعه محدود می‌کند — جمع‌ها، روند ماهانه
          و رتبه‌بندی‌ها. «تعیین‌نشده» یعنی بایگان هنوز چیزی ثبت نکرده، و با «پرداخت
          کامل» یکی نیست.
        </InfoHint>
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
          help={
            <>
              تعداد <strong>همهٔ</strong> اسناد در دامنهٔ زیر، در هر وضعیت گردش کار — از پیش‌نویس تا
              بایگانی‌شده. عدد کوچک زیرش، تعداد فاکتورهای همان اسناد است. نمودار کوچک،
              تعداد فاکتور هر ماه شمسی است.
              {scopeNote}
            </>
          }
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
          help={
            <>
              جمع مبلغ نهایی اسناد (پس از تخفیف و با مالیات و عوارض) — همان ستون «جمع
              کل» سند. این <strong>مبلغ سند</strong> است و نه مبلغ پرداخت‌شده؛ آن را کارت «وضعیت
              پرداخت» می‌گوید.
              {scopeNote}
            </>
          }
        />
        <StatTile
          updating={updating}
          icon="clock"
          title="در انتظار بایگانی"
          value={toPersianDigits(String(data.pendingArchiveCount))}
          caption="سند منتظر اقدام بایگان"
          tone={data.pendingArchiveCount > 0 ? 'warning' : 'neutral'}
          help={
            <>
              اسنادی که وضعیتشان «در انتظار بایگانی» است: کارپردازی ارجاعشان داده و
              بایگانی هنوز نهایی نکرده. اسناد «نیازمند اصلاح» در این عدد نیستند.
              {scopeNote}
            </>
          }
        />
        <StatTile
          updating={updating}
          icon="alert"
          title="بازخورد باز"
          value={toPersianDigits(String(data.openFeedbackCount))}
          caption="نیازمند پاسخ یا رسیدگی"
          tone={data.openFeedbackCount > 0 ? 'danger' : 'success'}
          help={
            <>
              تعداد <strong>بازخوردها</strong> (نه اسناد) که وضعیتشان «باز» یا «پاسخ داده‌شده» است و
              هنوز رسیدگی نشده‌اند. یک سند می‌تواند چند بازخورد باز داشته باشد.
              {scopeNote}
            </>
          }
        />
      </section>

      {/* ───────────── وضعیت پرداخت ───────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          updating={updating}
          icon="check"
          title={PAYMENT_SETTLEMENT_LABELS.FULLY_PAID}
          value={toPersianDigits(String(settlementSummary.fullyPaid.count))}
          caption={`${formatMoney(settlementSummary.fullyPaid.total, { withUnit: false })} ریال`}
          tone="success"
          help={
            <>
              اسنادی که بایگانی وضعیتشان را «پرداخت کامل» ثبت کرده است. مبلغ زیر آن،
              جمع <strong>مبلغ سند</strong> این اسناد است. تاریخ پرداخت هر سند، همان لحظه‌ای است که
              بایگان این وضعیت را ثبت کرده.
              <span className="mt-1.5 block border-t border-border pt-1.5 text-muted-foreground">
                دامنه: {yearLabel} · این سه کاشی <strong>همیشه</strong> همهٔ وضعیت‌ها را می‌شمارند و
                فیلتر بالای صفحه رویشان اثر ندارد.
              </span>
            </>
          }
        />
        <StatTile
          updating={updating}
          icon="alert"
          title={PAYMENT_SETTLEMENT_LABELS.OUTSTANDING}
          value={toPersianDigits(String(settlementSummary.outstanding.count))}
          caption={`${formatMoney(settlementSummary.outstanding.remaining, {
            withUnit: false,
          })} ریال باقی‌مانده`}
          tone={settlementSummary.outstanding.count > 0 ? 'danger' : 'neutral'}
          help={
            <>
              اسنادی که بخشی از مبلغشان پرداخت شده و بخشی مانده. عدد زیر آن، جمعِ{' '}
              <strong>مبلغ باقی‌مانده</strong> است — نه مبلغ سند. از جمع مبلغ این اسناد (
              {formatMoney(settlementSummary.outstanding.total)})،{' '}
              {formatMoney(settlementSummary.outstanding.paid)} پرداخت شده است.
              <span className="mt-1.5 block border-t border-border pt-1.5 text-muted-foreground">
                دامنه: {yearLabel} · بدون اثر فیلتر وضعیت پرداخت.
              </span>
            </>
          }
        />
        <StatTile
          updating={updating}
          icon="clock"
          title="وضعیت پرداخت تعیین‌نشده"
          value={toPersianDigits(String(settlementSummary.unset.count))}
          caption={`${formatMoney(settlementSummary.unset.total, { withUnit: false })} ریال`}
          tone={settlementSummary.unset.count > 0 ? 'warning' : 'neutral'}
          help={
            <>
              اسنادی که بایگانی هنوز وضعیت پرداختشان را ثبت نکرده است. این با «پرداخت
              کامل» یکی <strong>نیست</strong> و عمداً جدا شمرده می‌شود؛ وگرنه سندی که کسی سراغش
              نرفته، پرداخت‌شده به حساب می‌آمد.
              <span className="mt-1.5 block border-t border-border pt-1.5 text-muted-foreground">
                دامنه: {yearLabel} · روی {toPersianDigits(String(settledCount))} سند.
              </span>
            </>
          }
        />
      </section>

      {/*
        کارتابل پیگیری.

        فهرست از **قدیمی‌ترین** نیازمندی شروع می‌شود و نه بزرگ‌ترین مبلغ: چیزی که
        دیر می‌شود، زمان است. فوریت هر ردیف همین حالا حساب می‌شود، پس با هر بار باز
        کردن صفحه تازه است و به هیچ کار شبانه‌ای وابسته نیست.
      */}
      {followUps.length > 0 ? (
        <Card>
          <CardHeader
            icon="alert"
            title="نیازمندی‌های در انتظار پیگیری"
            description={`قدیمی‌ترین‌ها اول؛ مهلت پیگیری ${toPersianDigits(
              String(OUTSTANDING_FOLLOW_UP_DAYS),
            )} روز است.`}
            help={
              <>
                اسنادی که بایگانی وضعیتشان را «نیازمندی» ثبت کرده و هنوز بسته نشده‌اند.
                رنگ هر ردیف از فاصلهٔ امروز تا مهلت{' '}
                {toPersianDigits(String(OUTSTANDING_FOLLOW_UP_DAYS))} روزه می‌آید: آبی
                تازه، زرد نزدیک مهلت، و قرمز فوری یا معوق. مبلغ نشان‌داده‌شده، مبلغ
                <strong> باقی‌مانده</strong> است نه مبلغ سند.
                <span className="mt-1.5 block border-t border-border pt-1.5 text-muted-foreground">
                  دامنه: {yearLabel} · حداکثر هشت سند · بدون اثر فیلتر وضعیت پرداخت.
                </span>
              </>
            }
            action={
              <Badge tone="danger">
                {formatMoney(settlementSummary.outstanding.remaining, { withUnit: false })} ریال
              </Badge>
            }
          />
          <CardBody className="pt-3">
            <ul className="divide-y divide-border">
              {followUps.map((row) => {
                const age = row.since === null ? null : outstandingAge(new Date(row.since));
                const tone: BadgeTone =
                  age === null
                    ? 'info'
                    : age.level === 'overdue' || age.level === 'urgent'
                      ? 'danger'
                      : age.level === 'due-soon'
                        ? 'warning'
                        : 'info';

                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={row.title}>
                        {row.title}
                      </p>
                      <p className="money mt-0.5 text-[11px] text-muted-foreground">
                        {row.documentNumber
                          ? `شماره ${toPersianDigits(row.documentNumber)} · `
                          : ''}
                        از {formatMoney(row.total, { withUnit: false })} ریال،{' '}
                        {formatMoney(row.paid, { withUnit: false })} پرداخت شده
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="money text-sm font-bold text-destructive">
                        {formatMoney(row.remaining, { withUnit: false })}
                      </span>
                      <Badge tone={tone} dot>
                        {age === null
                          ? 'نیازمندی'
                          : age.daysLeft <= 0
                            ? `${toPersianDigits(String(age.days))} روز گذشته`
                            : `${toPersianDigits(String(age.daysLeft))} روز تا مهلت`}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {/* ───────────── مسیر سند ───────────── */}
      <Updating active={updating} className="space-y-4">
      <Card>
        <CardHeader
          icon="layers"
          title="مسیر سند"
          description="از پیش‌نویس تا تسویهٔ پرداخت؛ مرحله‌ای که بیشترین سند را دارد، برجسته است."
          help={
            <>
              چهار کارت اول <strong>وضعیت گردش کار</strong>اند و پشت سر هم می‌آیند: هر سند
              در هر لحظه دقیقاً در یکی از آن‌هاست.
              <span className="mt-1.5 block">
                دو کارت آخر <strong>وضعیت پرداخت</strong>اند و بُعد دیگری از همان اسناد، نه
                مرحلهٔ پنجم و ششم. بایگان وضعیت پرداخت را از لحظهٔ ارجاع سند می‌تواند ثبت
                کند، پس یک سند می‌تواند هم در «در انتظار بایگانی» باشد و هم در
                «نیازمندی». <strong>جمع شش کارت، تعداد اسناد نیست.</strong>
              </span>
              <span className="mt-1.5 block text-muted-foreground">
                مبلغِ زیر «نیازمندی»، <strong>باقی‌مانده</strong> است و نه مبلغ سند.
                سندی که وضعیت پرداختش ثبت نشده در هیچ‌کدام از دو کارت آخر نمی‌آید؛
                شمارشش در کاشی «وضعیت پرداخت تعیین‌نشده» بالای صفحه است.
              </span>
              {scopeNote}
            </>
          }
        />
        <CardBody className="pt-3">
          <DocumentPipeline byStatus={data.byStatus} settlement={data.settlementInScope} />
        </CardBody>
      </Card>

      {/* ───────────── تفکیک مبالغ ───────────── */}
      <Card>
        <CardHeader
          icon="trend-up"
          title="تفکیک مبالغ"
          description="از مبلغ کالا تا مبلغ نهایی؛ همان ترتیبی که در محاسبه فاکتور طی می‌شود."
          help={
            <>
              مسیر محاسبه: مبلغ کالا − تخفیف = خالص، و خالص + مالیات و عوارض = جمع کل.
              هر عدد، جمعِ همان ستون روی اسناد دامنه است. دو عقربه، سهم مالیات از جمع
              کل و سهم تخفیف از مبلغ کالا را نشان می‌دهند.
              {scopeNote}
            </>
          }
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
          help={
            <>
              مبلغ نهایی فاکتورها به تفکیک <strong>ماه شمسی</strong>، بر مبنای
              <strong> تاریخ صورتحساب</strong> هر فاکتور و نه تاریخ ثبت سند. در مبنای سال
              مالی، محور از مهر شروع می‌شود و شش ماه آخرش در سال شمسی بعدی است. ماهِ
              بدون فاکتور با مقدار صفر می‌آید، پس جای خالی در نمودار نمی‌ماند.
              {scopeNote}
            </>
          }
          title="روند ماهانه فاکتورها"
          description={
            data.year === null
              ? 'بر اساس تازه‌ترین سال موجود در دامنه دسترسی شما'
              : `${data.basis === 'jalali' ? 'سال شمسی' : 'سال مالی'} ${toPersianDigits(
                  String(data.year),
                )}${monthRangeLabel === null ? '' : ` — ${monthRangeLabel}`}`
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
            help={
              <>
                سهم‌ها از <strong>تعداد سند</strong> حساب می‌شوند و نه از مبلغ: پیش‌نویس
                هنوز فاکتوری ندارد، پس مبلغش صفر است و با مبنای مبلغ، ده‌ها سند سهم ۰٪
                می‌گرفتند. مبلغ هر وضعیت در راهنمای همان بخش می‌آید.
                {scopeNote}
              </>
            }
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
          <CardHeader
            icon="documents"
            title="اسناد بر اساس نوع"
            description="عادی در برابر ستاد"
            help={
              <>
                سهم هر نوع سند از <strong>تعداد</strong> اسناد. سند ستاد فقط یک فاکتور
                می‌پذیرد، پس تعداد بیشتر لزوماً مبلغ بیشتر نیست.
                {scopeNote}
              </>
            }
          />
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
            help={
              <>
                جمع مبلغ نهایی <strong>فاکتورها</strong> به تفکیک فروشنده، ده تای اول.
                فاکتورهای بدون فروشنده در یک ردیف «بدون فروشنده» جمع می‌شوند. عدد کنار
                هر میله، تعداد فاکتور همان فروشنده است.
                {scopeNote}
              </>
            }
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
            help={
              <>
                گروه‌بندی روی <strong>عنوان فصل در لحظهٔ ثبت فاکتور</strong> است و نه
                عنوان امروز: تغییر نام یک فصل، گزارش‌های گذشته را عوض نمی‌کند — ولی اگر
                فصلی تغییر نام داده باشد، ممکن است دو ردیف با دو نام ببینید.
                {scopeNote}
              </>
            }
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
  help,
  updating = false,
}: {
  icon: IconName;
  title: string;
  value: string;
  caption: string;
  tone: keyof typeof TILE_TONES;
  /**
   * «این عدد دقیقاً چیست» — تعریف، دامنه و اینکه چه چیزی در آن **نیست**.
   *
   * عنوان کوتاهِ کاشی ناچار مبهم است («جمع کل» چه چیزی؟ مبلغ سند یا پرداخت‌شده؟)؛
   * این علامت همان ابهام را برمی‌دارد بی‌آنکه کاشی شلوغ شود.
   */
  help?: ReactNode;
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
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{title}</span>
            {help ? (
              <InfoHint label={title}>{help}</InfoHint>
            ) : null}
          </p>
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
