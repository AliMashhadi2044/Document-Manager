import type { ReactNode } from 'react';

import { cn } from './cn';
import { Button } from './button';
import { EmptyState, ErrorState, LoadingState, Skeleton } from './states';

/**
 * جدول داده عمومی.
 *
 * صفحه‌بندی، مرتب‌سازی و فیلتر **سمت سرور** انجام می‌شوند؛ این کامپوننت فقط نمایش و
 * کنترل‌هاست و هرگز کل داده را در مرورگر نگه نمی‌دارد (الزام بهینگی، پاسخ Q12).
 */

export interface Column<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  /** کلید مرتب‌سازی سمت سرور؛ نبودنش یعنی ستون قابل مرتب‌سازی نیست. */
  readonly sortKey?: string;
  readonly align?: 'start' | 'center' | 'end';
  readonly width?: string;
}

export interface PageInfo {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly page?: PageInfo | undefined;
  readonly onPageChange?: ((page: number) => void) | undefined;
  readonly sortBy?: string | undefined;
  readonly sortDir?: 'asc' | 'desc' | undefined;
  readonly onSortChange?: ((sortBy: string, sortDir: 'asc' | 'desc') => void) | undefined;
  readonly isLoading?: boolean | undefined;
  readonly error?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly emptyTitle?: string | undefined;
  readonly emptyDescription?: string | undefined;
  readonly emptyAction?: ReactNode | undefined;
  /** فشردگی جدول — تنظیم شخصی کاربر. */
  readonly density?: 'comfortable' | 'compact' | undefined;
  readonly toolbar?: ReactNode | undefined;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  onPageChange,
  sortBy,
  sortDir = 'asc',
  onSortChange,
  isLoading = false,
  error,
  onRetry,
  emptyTitle = 'موردی یافت نشد',
  emptyDescription,
  emptyAction,
  density = 'comfortable',
  toolbar,
}: DataTableProps<T>): JSX.Element {
  const cellPadding = density === 'compact' ? 'px-3 py-1.5' : 'px-3 py-2.5';

  if (error) {
    return <ErrorState message={error} {...(onRetry ? { onRetry } : {})} />;
  }

  return (
    <div className="space-y-3">
      {toolbar}

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="w-full border-collapse text-sm">
          {/* سرستون چسبان: در جدول بلند، بدون آن کاربر بعد از چند ردیف نمی‌داند
              هر ستون چیست. */}
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr>
              {columns.map((column) => {
                const sortable = column.sortKey !== undefined && onSortChange !== undefined;
                const active = sortable && sortBy === column.sortKey;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      cellPadding,
                      'whitespace-nowrap border-b border-border text-xs font-medium text-muted-foreground',
                      alignClass(column.align),
                    )}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          onSortChange(
                            column.sortKey as string,
                            active && sortDir === 'asc' ? 'desc' : 'asc',
                          )
                        }
                      >
                        {column.header}
                        <span aria-hidden="true" className="text-[10px]">
                          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className="border-b border-border last:border-0">
                    {columns.map((column) => (
                      <td key={column.key} className={cellPadding}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          cellPadding,
                          alignClass(column.align),
                          // ستون‌های عددی هم‌عرض و کمی جمع‌تر؛ مبلغ بلند باید در
                          // ستون جا شود و ارقام ردیف‌ها زیر هم بنشینند.
                          column.align === 'end' || column.align === 'center' ? 'money' : null,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          {...(emptyDescription ? { description: emptyDescription } : {})}
          {...(emptyAction ? { action: emptyAction } : {})}
        />
      ) : null}

      {page && onPageChange ? <Pagination page={page} onPageChange={onPageChange} /> : null}
    </div>
  );
}

function Pagination({
  page,
  onPageChange,
}: {
  page: PageInfo;
  onPageChange: (page: number) => void;
}): JSX.Element {
  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        نمایش {from.toLocaleString('fa-IR')} تا {to.toLocaleString('fa-IR')} از{' '}
        {page.total.toLocaleString('fa-IR')} مورد
      </p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page.page <= 1}
          onClick={() => onPageChange(page.page - 1)}
        >
          قبلی
        </Button>
        <span className="text-muted-foreground">
          صفحه {page.page.toLocaleString('fa-IR')} از {page.pageCount.toLocaleString('fa-IR')}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={page.page >= page.pageCount}
          onClick={() => onPageChange(page.page + 1)}
        >
          بعدی
        </Button>
      </div>
    </div>
  );
}

function alignClass(align: Column<unknown>['align']): string {
  switch (align) {
    case 'center':
      return 'text-center';
    case 'end':
      return 'text-end';
    default:
      return 'text-start';
  }
}

export { LoadingState };
