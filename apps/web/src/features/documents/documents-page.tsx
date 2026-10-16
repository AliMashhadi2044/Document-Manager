import { useEffect, useState } from 'react';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS, type DocumentStatus } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { formatIsoAsJalali, formatMoney, toPersianDigits } from '../../shared/format/money';
import { useDocuments, type DocumentRow } from './documents.api';
import { useCurrentUser } from '../auth/auth.api';
import { DocumentDetailView } from './document-detail';
import { CreateDocumentForm } from './create-document-form';

const STATUS_STYLES: Record<DocumentStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  FINALIZED: 'bg-primary/10 text-primary',
  PENDING_ARCHIVE: 'bg-warning/10 text-warning',
  ARCHIVED: 'bg-success/10 text-success',
  NEEDS_REVISION: 'bg-destructive/10 text-destructive',
  REOPENED: 'bg-warning/10 text-warning',
};

export function DocumentsPage({
  /** سندی که از بیرون (اعلان) باید باز شود. */
  openDocumentId = null,
  onOpenedDocument,
}: {
  openDocumentId?: string | null;
  onOpenedDocument?: () => void;
} = {}): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useDocuments(page, search);
  const { data: user } = useCurrentUser();
  // بایگان و ناظر سند نمی‌سازند؛ دکمه‌ای که به ۴۰۳ ختم می‌شود، فقط کاربر را سردرگم
  // می‌کند. مرجع همچنان سرور است، نه این شرط.
  const canCreate = user?.permissions.includes('document:create') ?? false;

  // درخواست بیرونی یک‌بار اثر می‌گذارد و بعد پاک می‌شود، تا کاربر بتواند برگردد.
  useEffect(() => {
    if (openDocumentId !== null) {
      setSelected(openDocumentId);
      onOpenedDocument?.();
    }
  }, [openDocumentId, onOpenedDocument]);

  if (selected) {
    return <DocumentDetailView documentId={selected} onBack={() => setSelected(null)} />;
  }

  const columns: Column<DocumentRow>[] = [
    {
      key: 'title',
      header: 'شرح سند',
      cell: (row) => (
        <button
          type="button"
          className="text-start font-medium text-primary hover:underline"
          onClick={() => setSelected(row.id)}
        >
          {row.title}
        </button>
      ),
    },
    {
      key: 'type',
      header: 'نوع',
      align: 'center',
      width: '8rem',
      cell: (row) => DOCUMENT_TYPE_LABELS[row.type],
    },
    {
      key: 'year',
      header: 'سال مالی',
      align: 'center',
      width: '6rem',
      sortKey: 'fiscalYear',
      cell: (row) => toPersianDigits(String(row.fiscalYear)),
    },
    {
      key: 'number',
      header: 'شماره سند',
      align: 'center',
      width: '7rem',
      cell: (row) => (row.documentNumber ? toPersianDigits(row.documentNumber) : '—'),
    },
    {
      key: 'invoices',
      header: 'فاکتور',
      align: 'center',
      width: '5rem',
      cell: (row) => toPersianDigits(String(row._count?.invoices ?? 0)),
    },
    {
      key: 'total',
      header: 'جمع کل',
      align: 'end',
      width: '13rem',
      sortKey: 'totalAmount',
      cell: (row) => <span className="tabular-nums">{formatMoney(row.totalAmount)}</span>,
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      width: '8rem',
      cell: (row) => (
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[row.status]}`}>
          {DOCUMENT_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'تاریخ ایجاد',
      align: 'center',
      width: '7rem',
      sortKey: 'createdAt',
      cell: (row) => formatIsoAsJalali(row.createdAt),
    },
  ];

  return (
    <div className="space-y-5">
      {creating ? <CreateDocumentForm onClose={() => setCreating(false)} /> : null}

      <DataTable
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={list.isPending}
        error={list.isError ? 'دریافت فهرست اسناد ناموفق بود' : undefined}
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
        emptyTitle="سندی ثبت نشده است"
        emptyDescription="برای شروع، اولین سند را ایجاد کنید."
        emptyAction={
          canCreate ? <Button onClick={() => setCreating(true)}>ایجاد سند</Button> : undefined
        }
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Input
                label="جست‌وجو"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="شرح سند یا شماره سند"
              />
            </div>
            {canCreate ? (
              <Button onClick={() => setCreating((value) => !value)}>
                {creating ? 'بستن فرم' : 'ایجاد سند'}
              </Button>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
