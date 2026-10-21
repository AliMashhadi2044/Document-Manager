import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { cn } from './cn';
import { Button } from './button';
import { Icon } from './icon';
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
  /**
   * ترتیب تازهٔ ردیف‌های دیده‌شده. دادنش، دستگیرهٔ جابه‌جایی را روشن می‌کند.
   *
   * جابه‌جایی فقط وقتی معنا دارد که ترتیبِ دیده‌شده همان ترتیبِ ذخیره‌شده باشد؛
   * مصرف‌کننده با `reorderBlockedReason` می‌گوید چرا فعلاً ممکن نیست.
   */
  readonly onReorder?: ((orderedKeys: readonly string[]) => void) | undefined;
  readonly reorderBlockedReason?: string | undefined;
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
  onReorder,
  reorderBlockedReason,
}: DataTableProps<T>): JSX.Element {
  const cellPadding = density === 'compact' ? 'px-3 py-1.5' : 'px-3 py-2.5';
  const tableId = useId();

  const reorderable = onReorder !== undefined && reorderBlockedReason === undefined;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /** آخرین جابه‌جایی، برای اعلام به صفحه‌خوان و برگرداندن فوکوس. */
  const [announcement, setAnnouncement] = useState('');
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  const rowNodes = useRef<(HTMLTableRowElement | null)[]>([]);

  const move = (from: number, to: number): void => {
    if (!onReorder || from === to || to < 0 || to >= rows.length) return;

    const keys = rows.map((row) => rowKey(row));
    const [moved] = keys.splice(from, 1);
    if (moved === undefined) return;
    keys.splice(to, 0, moved);

    onReorder(keys);
    setAnnouncement(`ردیف به جایگاه ${(to + 1).toLocaleString('fa-IR')} منتقل شد.`);
    // فوکوس باید با خودِ ردیف جابه‌جا شود؛ وگرنه فشردن دوبارهٔ کلید، ردیف دیگری را تکان
    // می‌دهد. نشاندن فوکوس به رندر بعدی سپرده می‌شود، چون همین حالا دستگیرهٔ
    // جایگاه تازه هنوز ساخته نشده است.
    setFocusIndex(to);
  };

  useEffect(() => {
    if (focusIndex === null) return;
    handles.current[focusIndex]?.focus();
    setFocusIndex(null);
  }, [focusIndex, rows]);

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, index + 1);
    }
  };

  /**
   * کشیدن با رویدادهای pointer، نه HTML5 drag-and-drop.
   *
   * دو دلیل: HTML5 DnD روی لمس کار نمی‌کند، و با رویدادهای ساختگی (همانی که ابزار
   * آزمون تولید می‌کند) اصلاً شروع نمی‌شود — یعنی قابلیتی که نمی‌شود آزمود.
   *
   * مقصد، ردیفی است که مکان‌نما درون محدوده‌اش است؛ بیرون از جدول، نزدیک‌ترین لبه.
   */
  const indexAt = (clientY: number): number | null => {
    let nearest: { index: number; distance: number } | null = null;

    for (let index = 0; index < rows.length; index += 1) {
      const node = rowNodes.current[index];
      if (!node) continue;

      const rect = node.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return index;

      const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
      if (nearest === null || distance < nearest.distance) nearest = { index, distance };
    }

    return nearest?.index ?? null;
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, index: number): void => {
    if (!reorderable) return;
    // جلوگیری از انتخاب متن هنگام کشیدن.
    //
    // همین preventDefault، فوکوسِ پیش‌فرضِ دکمه را هم می‌گیرد؛ پس فوکوس صریح نشانده
    // می‌شود — وگرنه پس از یک کلیک ساده، کلیدهای بالا و پایین به هیچ دستگیره‌ای
    // نمی‌رسند و جابه‌جایی با صفحه‌کلید بی‌صدا از کار می‌افتد.
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragIndex(index);
    setOverIndex(index);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (dragIndex === null) return;
    setOverIndex(indexAt(event.clientY));
  };

  const onHandlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragIndex !== null && overIndex !== null) move(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  };

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
              {onReorder ? (
                <th
                  scope="col"
                  style={{ width: '2.75rem' }}
                  className={cn(cellPadding, 'border-b border-border')}
                >
                  <span className="sr-only">جابه‌جایی ترتیب</span>
                </th>
              ) : null}
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
                    {onReorder ? (
                      <td className={cellPadding}>
                        <Skeleton className="h-4 w-4" />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td key={column.key} className={cellPadding}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, rowIndex) => (
                  <tr
                    key={rowKey(row)}
                    ref={(node) => {
                      rowNodes.current[rowIndex] = node;
                    }}
                    className={cn(
                      'border-b border-border transition-colors last:border-0 hover:bg-muted/40',
                      dragIndex === rowIndex && 'opacity-40',
                      overIndex === rowIndex && dragIndex !== rowIndex && 'bg-primary/10',
                    )}
                  >
                    {onReorder ? (
                      <td className={cellPadding}>
                        <button
                          type="button"
                          ref={(node) => {
                            handles.current[rowIndex] = node;
                          }}
                          disabled={!reorderable}
                          title={reorderBlockedReason ?? 'بکشید یا با کلید بالا/پایین جابه‌جا کنید'}
                          aria-label={`جابه‌جایی ردیف ${(rowIndex + 1).toLocaleString('fa-IR')}`}
                          aria-describedby={`${tableId}-reorder-help`}
                          onKeyDown={(event) => onHandleKeyDown(event, rowIndex)}
                          onPointerDown={(event) => onHandlePointerDown(event, rowIndex)}
                          onPointerMove={onHandlePointerMove}
                          onPointerUp={onHandlePointerUp}
                          onPointerCancel={onHandlePointerUp}
                          style={{ touchAction: 'none' }}
                          className={cn(
                            'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground',
                            'transition-colors hover:bg-muted hover:text-foreground',
                            reorderable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-40',
                          )}
                        >
                          <Icon name="grip" size={16} />
                        </button>
                      </td>
                    ) : null}
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

      {onReorder ? (
        <>
          <p id={`${tableId}-reorder-help`} className="sr-only">
            برای جابه‌جایی، ردیف را بکشید یا روی این دکمه کلید بالا و پایین را فشار دهید.
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {reorderBlockedReason ? (
            <p className="text-xs text-muted-foreground">{reorderBlockedReason}</p>
          ) : null}
        </>
      ) : null}

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
