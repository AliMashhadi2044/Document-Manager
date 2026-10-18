import { useEffect, useState } from 'react';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS, type DocumentStatus } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { formatIsoAsJalali, formatMoney, toPersianDigits } from '../../shared/format/money';
import { useDocuments, type DocumentRow } from './documents.api';
import { useCurrentUser } from '../auth/auth.api';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { DocumentDetailView } from './document-detail';
import { CreateDocumentForm } from './create-document-form';

/** آهنگ رنگی هر وضعیت. نقشه **کامل** است: افزودن وضعیت تازه، اینجا خطای تایپ می‌دهد. */
const STATUS_TONES: Record<DocumentStatus, BadgeTone> = {
  DRAFT: 'neutral',
  FINALIZED: 'primary',
  PENDING_ARCHIVE: 'warning',
  ARCHIVED: 'success',
  NEEDS_REVISION: 'danger',
  REOPENED: 'warning',
};

export function DocumentsPage({
  /** سندی که از بیرون (اعلان) باید باز شود. */
  openDocumentId = null,
  onOpenedDocument,
  /** درخواست بیرونی برای باز کردن مستقیم فرم ایجاد (از دکمه داشبورد). */
  startCreating = false,
  onStartedCreating,
}: {
  openDocumentId?: string | null;
  onOpenedDocument?: () => void;
  startCreating?: boolean;
  onStartedCreating?: () => void;
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

  useEffect(() => {
    if (!startCreating) return;
    setCreating(true);
    onStartedCreating?.();
  }, [startCreating, onStartedCreating]);

  if (selected) {
    return <DocumentDetailView documentId={selected} onBack={() => setSelected(null)} />;
  }

  const columns: Column<DocumentRow>[] = [
    {
      key: 'title',
      header: 'شرح سند',
      // عنوان بلند در یک خط کوتاه می‌شود و متن کاملش در tooltip می‌آید: ردیف‌های
      // دو خطی، ارتفاع جدول را ناهماهنگ و پویش چشمی ستون‌های عددی را سخت می‌کنند.
      cell: (row) => (
        <button
          type="button"
          title={row.title}
          className="block max-w-[28ch] truncate text-start font-medium text-primary hover:underline"
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
      // واحد یک‌بار در سرستون می‌آید، نه در هر سلول: تکرار «ریال» در هر ردیف،
      // ستون را پهن و مبلغ را دو خطی می‌کند، بی‌آنکه چیزی به کاربر بگوید.
      header: 'جمع کل (ریال)',
      align: 'end',
      width: '13rem',
      sortKey: 'totalAmount',
      cell: (row) => (
        <span className="money" title={formatMoney(row.totalAmount)}>
          {formatMoney(row.totalAmount, { withUnit: false })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      // جای کافی برای بلندترین برچسب («در انتظار بایگانی»)؛ با عرض کمتر نشان به دو
      // خط می‌شکند و ارتفاع ردیف‌ها ناهماهنگ می‌شود.
      width: '10.5rem',
      cell: (row) => (
        <Badge tone={STATUS_TONES[row.status]} dot>
          {DOCUMENT_STATUS_LABELS[row.status]}
        </Badge>
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
