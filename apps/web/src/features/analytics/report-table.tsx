import type { ReportSort } from '@dm/shared';

import { formatIsoAsJalali, formatMoney, toPersianDigits } from '../../shared/format/money';
import { Button } from '../../shared/ui/button';
import type { ReportResultDto } from './analytics.api';

/**
 * جدول نتیجه گزارش.
 *
 * هیچ مرتب‌سازی و صفحه‌بندی‌ای اینجا انجام نمی‌شود: کلیک روی سرستون یک **درخواست
 * تازه** به سرور است و ردیف‌های این صفحه همان‌هایی‌اند که سرور فرستاده. جدولی که
 * خودش مرتب کند، روی صفحه دوم نتیجه‌ای می‌دهد که با صفحه اول نمی‌خواند.
 */
export function ReportTable({
  result,
  sort,
  onSortChange,
  onPageChange,
  sortableKeys,
  enumLabels,
  isLoading,
}: {
  result: ReportResultDto;
  sort: readonly ReportSort[];
  onSortChange: (next: readonly ReportSort[]) => void;
  onPageChange: (page: number) => void;
  sortableKeys: readonly string[];
  /**
   * برچسب فارسی مقدارهای enum، به‌ازای هر ستون.
   *
   * سرور مقدار **خام** را می‌فرستد (`DRAFT`) چون همان چیزی است که در فیلتر و خروجی
   * معنا دارد؛ ترجمه‌اش برای نمایش کار همین لایه است و از توصیف مجموعه‌داده می‌آید،
   * نه از یک جدول دستیِ دوم.
   */
  enumLabels: Readonly<Record<string, Readonly<Record<string, string>>>>;
  isLoading: boolean;
}): JSX.Element {
  const activeSort = sort[0];

  function toggleSort(key: string): void {
    if (!sortableKeys.includes(key)) return;
    if (activeSort?.field !== key) {
      onSortChange([{ field: key, dir: 'asc' }]);
      return;
    }
    onSortChange(
      activeSort.dir === 'asc' ? [{ field: key, dir: 'desc' }] : [],
    );
  }

  const start = (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.total);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              {result.columns.map((column) => {
                const sortable = sortableKeys.includes(column.key);
                const isActive = activeSort?.field === column.key;

                return (
                  <th key={column.key} className="whitespace-nowrap px-3 py-2 text-start text-xs">
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        aria-sort={
                          isActive ? (activeSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                      >
                        {column.titleFa}
                        <span aria-hidden="true" className="text-[10px] text-muted-foreground">
                          {isActive ? (activeSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      <span className="font-medium text-muted-foreground">{column.titleFa}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={result.columns.length}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  هیچ ردیفی با این فیلترها پیدا نشد.
                </td>
              </tr>
            ) : null}

            {result.rows.map((row, index) => (
              <tr key={`row-${index}`} className="border-t border-border">
                {result.columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      'px-3 py-1.5',
                      column.type === 'money' ? 'text-end tabular-nums' : '',
                      column.type === 'text' ? 'max-w-80 truncate' : 'whitespace-nowrap',
                    ].join(' ')}
                    title={column.type === 'text' ? String(row[column.key] ?? '') : undefined}
                  >
                    {renderCell(
                      column.type,
                      row[column.key] ?? null,
                      enumLabels[column.key],
                      // ستون «گروه» در گزارش تجمیعی می‌تواند یک سال مالی باشد؛
                      // ارقامش هم مثل بقیه اعداد سامانه فارسی نوشته می‌شود.
                      column.key === 'group',
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          {Object.keys(result.totals).length > 0 && result.rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                {result.columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 ${column.type === 'money' ? 'text-end tabular-nums' : ''}`}
                  >
                    {column.key in result.totals
                      ? formatMoney(result.totals[column.key] as string, { withUnit: false })
                      : index === 0
                        ? 'جمع همه ردیف‌های فیلترشده'
                        : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {result.total === 0
            ? 'بدون نتیجه'
            : `نمایش ${toPersianDigits(String(start))} تا ${toPersianDigits(String(end))} از ${toPersianDigits(String(result.total))} ردیف`}
          {isLoading ? ' · در حال به‌روزرسانی…' : ''}
        </p>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={result.page <= 1}
            onClick={() => onPageChange(result.page - 1)}
          >
            صفحه قبل
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحه {toPersianDigits(String(result.page))} از {toPersianDigits(String(result.pageCount))}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={result.page >= result.pageCount}
            onClick={() => onPageChange(result.page + 1)}
          >
            صفحه بعد
          </Button>
        </div>
      </div>
    </div>
  );
}

function renderCell(
  type: string,
  value: string | number | boolean | null,
  labels: Readonly<Record<string, string>> | undefined,
  persianDigits = false,
): string {
  if (value === null || value === '') return '—';
  if (persianDigits) return toPersianDigits(String(value));

  switch (type) {
    case 'enum':
      return labels?.[String(value)] ?? String(value);
    case 'money':
      return formatMoney(String(value), { withUnit: false });
    case 'integer':
      return toPersianDigits(String(value));
    case 'boolean':
      return value === true || value === 'true' ? 'بله' : 'خیر';
    case 'date':
    case 'jalaliDate':
      return formatIsoAsJalali(String(value));
    default:
      return String(value);
  }
}
