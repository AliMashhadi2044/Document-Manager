import { useState } from 'react';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { Badge } from '../../shared/ui/badge';
import { Button } from '../../shared/ui/button';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { formatIsoAsJalali, formatMoney, formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useDebouncedValue } from '../../shared/hooks/use-debounced-value';
import { useCurrentUser } from '../auth/auth.api';
import { TrashDetailDialog } from './trash-detail-dialog';
import { useTrash, type TrashRow } from './documents.api';

/**
 * سطل زباله اسناد.
 *
 * سندی که اینجاست، **هیچ‌جای دیگری نیست**: نه در فهرست اسناد، نه در داشبورد، نه در
 * گزارش‌ها، و نه در قاعده‌های کنترلی مثل «یک مدرسه دوبار برای یک انشعاب فاکتور
 * نخورد». ولی هنوز کامل است و با جزئیاتش دیده می‌شود — همین است که سطل زباله را از
 * حذف جدا می‌کند.
 *
 * از اینجا دو راه بیرون هست: بازگرداندن (اگر تداخلی نباشد) و حذف دائمی.
 */
export function TrashPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<TrashRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const list = useTrash(page, debouncedSearch);
  const { data: user } = useCurrentUser();

  const columns: Column<TrashRow>[] = [
    {
      key: 'title',
      header: 'سند',
      cell: (row) => (
        <div className="max-w-[40ch]">
          <div className="truncate font-medium" title={row.title}>
            {row.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {DOCUMENT_TYPE_LABELS[row.type]} · {row.buyerSnapshot.name} · سال مالی{' '}
            {toPersianDigits(String(row.fiscalYear))}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت هنگام حذف',
      width: '10rem',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.status === 'DRAFT' ? 'neutral' : 'warning'}>
          {DOCUMENT_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'invoices',
      header: 'فاکتور',
      width: '6rem',
      align: 'center',
      cell: (row) => <span className="money">{toPersianDigits(String(row._count.invoices))}</span>,
    },
    {
      key: 'totalAmount',
      header: 'جمع کل',
      width: '11rem',
      align: 'end',
      cell: (row) => <span className="money">{formatMoney(row.totalAmount)}</span>,
    },
    {
      key: 'deletedAt',
      header: 'حذف‌شده',
      width: '14rem',
      sortKey: 'deletedAt',
      cell: (row) => (
        <div className="max-w-[22ch]">
          <div className="money text-sm">{formatIsoAsJalali(row.deletedAt)}</div>
          <div className="truncate text-xs text-muted-foreground" title={row.deleteReason ?? ''}>
            {row.deletedBy?.fullName ?? '—'}
            {row.deleteReason ? ` · ${row.deleteReason}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'اقدام',
      align: 'end',
      width: '7rem',
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setOpen(row)}>
          بررسی
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
        سندهای اینجا در هیچ فهرست، گزارش، داشبورد یا قاعدهٔ کنترلی دیده نمی‌شوند؛ انگار
        وجود ندارند. ولی داده‌شان دست‌نخورده است و تا وقتی حذف دائمی نشده‌اند، قابل
        بازگرداندن‌اند.
      </p>

      {message ? (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={list.isPending}
        error={list.isError ? 'دریافت فهرست سطل زباله ناموفق بود' : undefined}
        onRetry={() => void list.refetch()}
        page={
          list.data
            ? {
                page: list.data.page,
                pageSize: list.data.pageSize,
                total: list.data.total,
                pageCount: list.data.pageCount,
              }
            : undefined
        }
        onPageChange={setPage}
        emptyTitle="سطل زباله خالی است"
        emptyDescription="سندی که حذف شود اینجا می‌آید و از آنجا قابل بازگرداندن است."
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                label="جست‌وجو"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="شرح سند"
              />
            </div>
            <div className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
              <Icon name="trash" size={14} />
              {toPersianDigits(String(list.data?.total ?? 0))} سند
            </div>
          </div>
        }
      />

      {open ? (
        <TrashDetailDialog
          row={open}
          canRestore={user?.permissions.includes('document:restore') ?? false}
          canPurge={user?.permissions.includes('document:purge') ?? false}
          onClose={() => setOpen(null)}
          onDone={(text) => {
            setOpen(null);
            setMessage(text);
          }}
          onError={(caught) =>
            setMessage(
              caught instanceof ApiError ? formatServerMessage(caught.message) : 'انجام نشد',
            )
          }
        />
      ) : null}
    </div>
  );
}
