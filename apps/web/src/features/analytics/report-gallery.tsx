import { useMemo, useState } from 'react';

import { ApiError } from '../../shared/api/client';
import { Badge } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { formatIsoAsJalali, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useDatasets, useSharedReports, type DatasetDto } from './analytics.api';

/**
 * فهرست گزارش‌ها — ویترینِ ورودیِ گزارش‌گیری.
 *
 * تا پیش از این تنها راه رسیدن به یک گزارش، نواری از ده دکمهٔ هم‌شکل در بالای
 * صفحهٔ گزارش‌گیری بود: نه می‌شد فهمید هر گزارش چه می‌دهد (توضیحش فقط در
 * `title` مرورگر بود)، نه گزارش‌های ارسال‌شده جایی جدی داشتند — یک ردیف تراشهٔ
 * ریز، با نام فرستنده‌ای که کنار عنوان گم می‌شد.
 *
 * اینجا هر گزارش یک کارت است با عنوان، شرح و اندازه‌اش؛ و گزارش‌های ارسال‌شده
 * **بالاتر از همه** می‌نشینند، چون کسی که برایش گزارشی فرستاده شده برای همان
 * آمده. کلیک، گزارش‌گیری را روی همان گزارش باز می‌کند — این صفحه خودش جدولی
 * نشان نمی‌دهد و حالتی نگه نمی‌دارد.
 */
export function ReportGallery({
  onOpenDataset,
  onOpenSharedReport,
}: {
  onOpenDataset: (datasetKey: string) => void;
  onOpenSharedReport: (sharedReportId: string) => void;
}): JSX.Element {
  const datasets = useDatasets();
  const shared = useSharedReports();
  const [search, setSearch] = useState('');

  /*
    جست‌وجو روی عنوان، شرح **و نام فیلدها**.

    کاربری که «پلاک» را می‌جوید نمی‌داند اسم گزارشش «انشعابات» است یا «سوخت»؛
    فیلدها همان چیزی‌اند که او در ذهن دارد.
  */
  const filtered = useMemo(() => {
    const needle = search.trim();
    if (needle === '' || !datasets.data) return (datasets.data ?? []) as readonly DatasetDto[];

    return datasets.data.filter(
      (dataset) =>
        dataset.titleFa.includes(needle) ||
        dataset.description.includes(needle) ||
        dataset.fields.some((field) => field.titleFa.includes(needle)),
    );
  }, [datasets.data, search]);

  if (datasets.isPending) return <LoadingState label="در حال خواندن فهرست گزارش‌ها…" />;
  if (datasets.isError) {
    return (
      <ErrorState
        title="خواندن فهرست گزارش‌ها ناموفق بود"
        message={
          datasets.error instanceof ApiError
            ? formatServerMessage(datasets.error.message)
            : 'خطای نامشخص'
        }
        onRetry={() => void datasets.refetch()}
      />
    );
  }

  const inbox = (shared.data ?? []).filter((item) => !item.isMine);
  const outbox = (shared.data ?? []).filter((item) => item.isMine);

  return (
    <div className="space-y-5">
      {inbox.length > 0 ? (
        <section>
          <SectionHeading
            icon="bell"
            title="گزارش‌های ارسال‌شده برای شما"
            hint="با یک کلیک همان فیلترها اعمال می‌شوند — ردیف‌ها با دسترسی خودِ شما خوانده می‌شوند، نه دسترسی فرستنده."
          />
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {inbox.map((item) => (
              <li key={item.id}>
                <SharedCard
                  title={item.title}
                  description={item.description}
                  byline={`از ${item.sender?.fullName ?? 'نامشخص'}`}
                  createdAt={item.createdAt}
                  onOpen={() => onOpenSharedReport(item.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading
            icon="chart"
            title="گزارش‌ها"
            hint="هر کارت یک گزارش است؛ بازش کنید تا ستون‌ها، فیلترها و خروجی Excel در اختیارتان باشد."
          />
          <div className="w-60">
            <Input
              label="جست‌وجو در گزارش‌ها"
              placeholder="نام گزارش یا نام یک فیلد"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            گزارشی با «{search.trim()}» پیدا نشد.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((dataset) => (
              <li key={dataset.key}>
                <DatasetCard dataset={dataset} onOpen={() => onOpenDataset(dataset.key)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {outbox.length > 0 ? (
        <section>
          <SectionHeading
            icon="upload"
            title="گزارش‌هایی که فرستاده‌اید"
            hint="همان تنظیماتی که برای بررسی ارسال کرده‌اید."
          />
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {outbox.map((item) => (
              <li key={item.id}>
                <SharedCard
                  title={item.title}
                  description={item.description}
                  byline="ارسالی شما"
                  createdAt={item.createdAt}
                  onOpen={() => onOpenSharedReport(item.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  hint,
}: {
  icon: 'bell' | 'chart' | 'upload';
  title: string;
  hint: string;
}): JSX.Element {
  return (
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon name={icon} size={16} className="text-primary" />
        {title}
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

/** کارت یک مجموعه‌داده. */
function DatasetCard({
  dataset,
  onOpen,
}: {
  dataset: DatasetDto;
  onOpen: () => void;
}): JSX.Element {
  const filterable = dataset.fields.filter((field) => field.filterable).length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col gap-2 rounded-lg border border-border bg-card p-4 text-start transition-all duration-150 hover:border-primary/60 hover:bg-primary/5 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold group-hover:text-primary">{dataset.titleFa}</h3>
        <Badge tone="neutral">{dataset.kind === 'grouped' ? 'تجمیعی' : 'ردیفی'}</Badge>
      </div>

      <p className="line-clamp-3 flex-1 text-xs leading-5 text-muted-foreground">
        {dataset.description}
      </p>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>
          {toPersianDigits(String(dataset.fields.length))} ستون ·{' '}
          {toPersianDigits(String(filterable))} فیلتر
        </span>
        <span className="font-medium text-primary">باز کردن ←</span>
      </div>
    </button>
  );
}

/** کارت یک گزارش ارسالی. */
function SharedCard({
  title,
  description,
  byline,
  createdAt,
  onOpen,
}: {
  title: string;
  description: string | null;
  byline: string;
  createdAt: string;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4 text-start transition-all duration-150 hover:border-primary hover:bg-primary/10 active:scale-[0.99]"
    >
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {description ? (
        <p className="line-clamp-3 flex-1 whitespace-pre-wrap text-xs leading-5">{description}</p>
      ) : (
        <p className="flex-1 text-xs text-muted-foreground">بدون شرح</p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-primary/20 pt-2 text-[11px] text-muted-foreground">
        <span>{byline}</span>
        <span className="money">{formatIsoAsJalali(createdAt)}</span>
      </div>
    </button>
  );
}
