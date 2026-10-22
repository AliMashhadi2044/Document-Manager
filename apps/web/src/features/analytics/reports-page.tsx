import { useEffect, useMemo, useState } from 'react';
import { EMPTY_FILTER, type FilterGroup, type ReportSort } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import type { CurrentUser } from '../auth/auth.api';
import {
  downloadReportExport,
  useDatasets,
  useDeleteView,
  useExportPlan,
  useMyExports,
  useQueueExport,
  useReportQuery,
  useSaveView,
  useSavedViews,
  type DatasetDto,
  type ReportRequest,
} from './analytics.api';
import { ExportJobs } from './export-jobs';
import { FilterBuilder } from './filter-builder';
import { ReportTable } from './report-table';

/**
 * صفحه گزارش‌گیری عمومی (فاز ۸).
 *
 * ساختارش از یک قاعده می‌آید: **درخواست گزارش یک شیء است** (ستون‌ها، فیلتر،
 * مرتب‌سازی، صفحه) و همان شیء هم به جدول می‌رود، هم به خروجی Excel، هم در نمای
 * ذخیره‌شده می‌نشیند. پس خروجی نمی‌تواند با جدول اختلاف پیدا کند — نه به‌خاطر
 * انضباط، بلکه چون چیز دیگری برای فرستادن وجود ندارد.
 */
export function ReportsPage({ user }: { user: CurrentUser }): JSX.Element {
  const datasets = useDatasets();
  const [datasetKey, setDatasetKey] = useState<string | null>(null);

  useEffect(() => {
    if (datasetKey === null && datasets.data && datasets.data.length > 0) {
      setDatasetKey(datasets.data[0]?.key ?? null);
    }
  }, [datasets.data, datasetKey]);

  if (datasets.isPending) return <LoadingState label="در حال خواندن گزارش‌ها…" />;
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

  const dataset = datasets.data.find((item) => item.key === datasetKey) ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">گزارش‌گیری</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          فیلتر، مرتب‌سازی و صفحه‌بندی همه سمت سرور انجام می‌شوند و خروجی Excel دقیقاً همان برشی است
          که روی صفحه می‌بینید. ستون‌هایی که مجوزشان را ندارید در فهرست نمی‌آیند.
        </p>

        <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="گزارش‌ها">
          {datasets.data.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setDatasetKey(item.key)}
              aria-current={item.key === datasetKey ? 'page' : undefined}
              title={item.description}
              className={
                item.key === datasetKey
                  ? 'rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary'
                  : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted'
              }
            >
              {item.titleFa}
            </button>
          ))}
        </nav>
      </section>

      {dataset ? <DatasetReport key={dataset.key} dataset={dataset} user={user} /> : null}
    </div>
  );
}

function DatasetReport({ dataset, user }: { dataset: DatasetDto; user: CurrentUser }): JSX.Element {
  const [columns, setColumns] = useState<readonly string[]>(dataset.defaultColumns);
  const [filter, setFilter] = useState<FilterGroup>(EMPTY_FILTER);
  const [sort, setSort] = useState<readonly ReportSort[]>(dataset.defaultSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [groupBy, setGroupBy] = useState<string | undefined>(
    dataset.groupBy?.[0]?.key ?? undefined,
  );
  /*
    سه تابلوی تنظیمات، و هر بار **یکی**.

    پیش از این فیلترها و ستون‌ها هرکدام کلید خودشان را داشتند و نماهای ذخیره‌شده
    همیشه باز بود؛ با باز بودن دو تا، جدول به ته صفحه می‌رفت. حالا بازکردن یکی،
    بقیه را می‌بندد.
  */
  const [panel, setPanel] = useState<'filter' | 'columns' | 'views' | null>(null);
  const toggle = (next: 'filter' | 'columns' | 'views'): void =>
    setPanel((current) => (current === next ? null : next));
  const [viewName, setViewName] = useState('');
  const [shareView, setShareView] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    پیش‌نویس در برابر آنچه اجرا شده.

    گزارش با **دکمه** اجرا می‌شود، نه با هر تغییر. فیلتر و ستون و گروه‌بندی در
    `draft` می‌نشینند و تا فشرده نشدن «اجرای گزارش» به سرور نمی‌روند؛ یک گزارش روی
    صدها هزار ردیف می‌دود و کاربری که سه فیلتر پشت هم تنظیم می‌کند، سه اجرای کامل
    را هدر می‌داد.

    صفحه و مرتب‌سازی از این قاعده بیرون‌اند: آن‌ها روی **نتیجهٔ همین اجرا** کار
    می‌کنند و واداشتن کاربر به زدن دوبارهٔ دکمه برای رفتن به صفحهٔ بعد، آزاردهنده
    است.

    اجرای اول خودکار است: صفحهٔ خالی، کاربر را پیش از دیدن هیچ داده‌ای به تنظیم
    فیلتر وادار می‌کند.
  */
  const draft = useMemo(() => ({ columns, filter, groupBy }), [columns, filter, groupBy]);
  const [applied, setApplied] = useState(draft);

  const request: ReportRequest = useMemo(
    () => ({
      columns: [...applied.columns],
      filter: applied.filter,
      sort: [...sort],
      page,
      pageSize,
      groupBy: applied.groupBy,
    }),
    [applied, sort, page, pageSize],
  );

  /** پیش‌نویسی که هنوز اجرا نشده — دکمه با همین برجسته می‌شود. */
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  function runReport(): void {
    setApplied(draft);
    setPage(1);
  }

  const result = useReportQuery(dataset.key, request);
  const views = useSavedViews(dataset.key);
  const saveView = useSaveView();
  const deleteView = useDeleteView(dataset.key);
  const plan = useExportPlan();
  const queueExport = useQueueExport();
  const canExport = user.permissions.includes('report:export');
  const exports = useMyExports(canExport);

  const sortableKeys = useMemo(
    () => dataset.fields.filter((field) => field.sortable).map((field) => field.key),
    [dataset.fields],
  );

  /** نگاشت مقدار خام enum به برچسب فارسی‌اش، از توصیف مجموعه‌داده. */
  const enumLabels = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const field of dataset.fields) {
      if (!field.enumValues) continue;
      map[field.key] = Object.fromEntries(
        field.enumValues.map((option) => [option.value, option.label]),
      );
    }
    return map;
  }, [dataset.fields]);

  /** شمار شرط‌های فعال، شامل گروه‌های تودرتو — عددی که روی دکمهٔ فیلترها می‌نشیند. */
  const filterCount = useMemo(() => countConditions(filter), [filter]);

  /** هر تغییر فیلتر یا ستون، صفحه را به اول برمی‌گرداند. */
  function changeFilter(next: FilterGroup): void {
    setFilter(next);
    setPage(1);
  }

  async function runExport(): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      const decision = await plan.mutateAsync({ dataset: dataset.key, request });

      if (decision.queued) {
        const job = await queueExport.mutateAsync({ dataset: dataset.key, request });
        setMessage(
          `این خروجی ${toPersianDigits(String(decision.rowCount))} ردیف دارد و به صف رفت. ` +
            `پس از آماده شدن، از فهرست «خروجی‌های من» دانلودش کنید (شناسه ${job.id.slice(0, 8)}).`,
        );
        return;
      }

      const rowCount = await downloadReportExport(dataset.key, request, `${dataset.titleFa}.xlsx`);
      setMessage(`خروجی با ${toPersianDigits(String(rowCount))} ردیف دانلود شد.`);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? formatServerMessage(caught.message) : 'ساخت خروجی ناموفق بود',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={panel === 'filter' ? 'primary' : 'secondary'}
            onClick={() => toggle('filter')}
          >
            فیلترها
            {filterCount > 0 ? ` (${toPersianDigits(String(filterCount))})` : ''}
          </Button>
          <Button
            size="sm"
            variant={panel === 'columns' ? 'primary' : 'secondary'}
            onClick={() => toggle('columns')}
          >
            ستون‌ها ({toPersianDigits(String(columns.length))})
          </Button>
          <Button
            size="sm"
            variant={panel === 'views' ? 'primary' : 'secondary'}
            onClick={() => toggle('views')}
          >
            نماها
            {views.data && views.data.length > 0
              ? ` (${toPersianDigits(String(views.data.length))})`
              : ''}
          </Button>

          {dataset.groupBy ? (
            <div className="w-48">
              <Select
                placeholder={null}
                aria-label="گروه‌بندی"
                value={groupBy ?? ''}
                onChange={(nextValue) => {
                  setGroupBy(nextValue);
                  setPage(1);
                }}
                options={dataset.groupBy.map((item) => ({
                  value: item.key,
                  label: `گروه‌بندی: ${item.titleFa}`,
                }))}
              />
            </div>
          ) : null}

          <div className="w-32">
            <Select
              placeholder={null}
              aria-label="تعداد ردیف هر صفحه"
              value={String(pageSize)}
              onChange={(nextValue) => {
                setPageSize(Number(nextValue));
                setPage(1);
              }}
              options={['10', '25', '50', '100', '200'].map((size) => ({
                value: size,
                label: `${toPersianDigits(size)} ردیف`,
              }))}
            />
          </div>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {/*
              تا وقتی تغییری اجرا نشده، دکمه برجسته است و یک خط هم می‌گوید چیزی
              منتظر مانده؛ وگرنه کاربر نمی‌فهمد چرا جدول با فیلتر تازه‌اش نمی‌خواند.
            */}
            {dirty ? (
              <span className="text-xs text-muted-foreground">تغییرها هنوز اجرا نشده‌اند</span>
            ) : null}
            <Button
              size="sm"
              variant={dirty ? 'primary' : 'secondary'}
              loading={result.isFetching}
              onClick={runReport}
            >
              <Icon name="search" size={15} />
              اجرای گزارش
            </Button>
            {canExport ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                disabled={dirty}
                title={dirty ? 'ابتدا گزارش را اجرا کنید' : undefined}
                onClick={() => void runExport()}
              >
                خروجی Excel
              </Button>
            ) : null}
          </div>
        </div>

        {panel === 'filter' ? (
          <FilterBuilder fields={dataset.fields} value={filter} onChange={changeFilter} />
        ) : null}

        {panel === 'columns' ? (
          <ColumnPicker
            dataset={dataset}
            columns={columns}
            onChange={(next) => {
              setColumns(next);
              setPage(1);
            }}
          />
        ) : null}

        {panel === 'views' ? (
          <SavedViews
            datasetKey={dataset.key}
            views={views.data ?? []}
            viewName={viewName}
            shareView={shareView}
            onViewNameChange={setViewName}
            onShareChange={setShareView}
            onApply={(view) => {
              setColumns(view.columns);
              setFilter(view.filter);
              setSort(view.sort);
              setPageSize(view.pageSize);
              setPage(1);
              // نما خودش اجرا می‌شود: کاربر با انتخابش همان را خواسته است. نما
              // گروه‌بندی را نگه نمی‌دارد، پس همان گروه‌بندی فعلی می‌ماند.
              setApplied({ columns: view.columns, filter: view.filter, groupBy });
              setViewName(view.name);
              setShareView(view.isShared);
              setMessage(`نمای «${view.name}» اعمال شد.`);
            }}
            onSave={() => {
              setError(null);
              setMessage(null);
              saveView.mutate(
                {
                  dataset: dataset.key,
                  name: viewName.trim(),
                  isShared: shareView,
                  // آنچه ذخیره می‌شود **پیش‌نویس** است، نه آخرین اجرا: کاربر همان
                  // چیزی را می‌بیند که تنظیم کرده.
                  request: {
                    columns: [...draft.columns],
                    filter: draft.filter,
                    sort: [...sort],
                    pageSize,
                    page: 1,
                    groupBy: draft.groupBy,
                  },
                },
                {
                  onSuccess: () => setMessage(`نمای «${viewName.trim()}» ذخیره شد.`),
                  onError: (caught) =>
                    setError(
                      caught instanceof ApiError
                        ? formatServerMessage(caught.message)
                        : 'ذخیره نما ناموفق بود',
                    ),
                },
              );
            }}
            onDelete={(viewId) => deleteView.mutate({ viewId })}
            saving={saveView.isPending}
          />
        ) : null}

        {message ? (
          <p role="status" className="rounded-md bg-primary/10 p-2.5 text-sm text-primary">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      {result.isError ? (
        <ErrorState
          title="اجرای گزارش ناموفق بود"
          message={
            result.error instanceof ApiError
              ? formatServerMessage(result.error.message)
              : 'خطای نامشخص'
          }
          onRetry={() => void result.refetch()}
        />
      ) : null}

      {result.data ? (
        <ReportTable
          result={result.data}
          sort={sort}
          sortableKeys={sortableKeys}
          enumLabels={enumLabels}
          isLoading={result.isFetching}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          onPageChange={setPage}
        />
      ) : result.isPending ? (
        <LoadingState label="در حال اجرای گزارش…" />
      ) : null}

      {canExport ? <ExportJobs jobs={exports.data ?? []} /> : null}
    </div>
  );
}

function ColumnPicker({
  dataset,
  columns,
  onChange,
}: {
  dataset: DatasetDto;
  columns: readonly string[];
  onChange: (next: readonly string[]) => void;
}): JSX.Element {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium">ستون‌های جدول</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => onChange(dataset.defaultColumns)}
          >
            بازگشت به پیش‌فرض
          </button>
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => onChange(dataset.fields.map((field) => field.key))}
          >
            انتخاب همه
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {dataset.fields.map((field) => {
          const index = columns.indexOf(field.key);
          const selected = index >= 0;

          return (
            <button
              key={field.key}
              type="button"
              onClick={() =>
                onChange(
                  selected ? columns.filter((key) => key !== field.key) : [...columns, field.key],
                )
              }
              className={
                selected
                  ? 'rounded border border-primary bg-primary/10 px-2 py-0.5 text-xs text-primary'
                  : 'rounded border border-border px-2 py-0.5 text-xs hover:bg-muted'
              }
            >
              {field.titleFa}
              {selected ? (
                <span className="ms-1 text-[10px] opacity-70">
                  {toPersianDigits(String(index + 1))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        ترتیب انتخاب، ترتیب ستون‌ها در جدول و در خروجی Excel است. فقط ستون‌های انتخاب‌شده از پایگاه
        داده خوانده می‌شوند.
      </p>
    </div>
  );
}

function SavedViews({
  views,
  viewName,
  shareView,
  onViewNameChange,
  onShareChange,
  onApply,
  onSave,
  onDelete,
  saving,
}: {
  datasetKey: string;
  views: readonly import('./analytics.api').SavedViewDto[];
  viewName: string;
  shareView: boolean;
  onViewNameChange: (name: string) => void;
  onShareChange: (shared: boolean) => void;
  onApply: (view: import('./analytics.api').SavedViewDto) => void;
  onSave: () => void;
  onDelete: (viewId: string) => void;
  saving: boolean;
}): JSX.Element {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <h3 className="text-xs font-medium">نماهای ذخیره‌شده</h3>

      {views.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          هنوز نمایی ذخیره نکرده‌اید. تنظیمات فعلی (ستون‌ها، فیلترها، مرتب‌سازی) را با یک نام ذخیره
          کنید تا بعداً با یک کلیک برگردد.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {views.map((view) => (
            <li
              key={view.id}
              className="flex items-center gap-1 rounded border border-border px-2 py-1"
            >
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => onApply(view)}
              >
                {view.name}
              </button>
              {view.isShared ? (
                <span
                  title={`اشتراکی — سازنده: ${view.owner?.fullName ?? '—'}`}
                  className="text-[10px] text-muted-foreground"
                >
                  (اشتراکی)
                </span>
              ) : null}
              {view.isOwn ? (
                <button
                  type="button"
                  aria-label={`حذف نمای ${view.name}`}
                  className="text-[11px] text-destructive hover:underline"
                  onClick={() => onDelete(view.id)}
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input
            label="نام نما"
            value={viewName}
            maxLength={120}
            onChange={(event) => onViewNameChange(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs">
          <input
            type="checkbox"
            checked={shareView}
            onChange={(event) => onShareChange(event.target.checked)}
          />
          اشتراکی
        </label>
        <Button size="sm" loading={saving} disabled={viewName.trim() === ''} onClick={onSave}>
          ذخیره نما
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        نمای اشتراکی دسترسی اضافه نمی‌دهد: هر کاربری که بازش کند، گزارش با مجوزهای خودش اجرا می‌شود.
      </p>
    </div>
  );
}

/** شمار شرط‌های یک گروه و همهٔ گروه‌های درونش. */
function countConditions(group: FilterGroup): number {
  return (
    group.conditions.length +
    (group.groups ?? []).reduce((total, nested) => total + countConditions(nested), 0)
  );
}
