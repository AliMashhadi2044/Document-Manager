import { useState } from 'react';
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '@dm/shared';

import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { formatIsoAsJalali, formatMoney, toPersianDigits } from '../../shared/format/money';
import { ApiError } from '../../shared/api/client';
import { useArchiveInbox, type ArchiveInboxFilters, type ArchiveInboxRow } from './archive.api';
import { ArchiveWorkspace } from './archive-workspace';
import type { CurrentUser } from '../auth/auth.api';

const STATUS_STYLES: Partial<Record<DocumentStatus, string>> = {
  PENDING_ARCHIVE: 'bg-warning/10 text-warning',
  ARCHIVED: 'bg-success/10 text-success',
  NEEDS_REVISION: 'bg-destructive/10 text-destructive',
};

/**
 * کارتابل بایگانی.
 *
 * کارتابل عمداً **فقط اسناد در جریان بایگانی** را نشان می‌دهد و این محدودیت در سرور
 * است نه اینجا: دامنه دسترسی نقش بایگانی، پیش‌نویس و سند ثبت‌نشده را از کوئری بیرون
 * می‌گذارد. فیلترهای این صفحه روی همان مجموعه کار می‌کنند و چیزی به آن اضافه
 * نمی‌کنند.
 */
export function ArchivePage({ user }: { user: CurrentUser }): JSX.Element {
  const [filters, setFilters] = useState<ArchiveInboxFilters>({
    page: 1,
    search: '',
    status: '',
    fiscalYear: '',
    hasOpenFeedback: '',
  });
  const [selected, setSelected] = useState<string | null>(null);

  const inbox = useArchiveInbox(filters);

  if (selected) {
    return <ArchiveWorkspace documentId={selected} user={user} onBack={() => setSelected(null)} />;
  }

  function update(patch: Partial<ArchiveInboxFilters>): void {
    setFilters((previous) => ({ ...previous, page: 1, ...patch }));
  }

  const columns: Column<ArchiveInboxRow>[] = [
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
      key: 'number',
      header: 'شماره سند',
      align: 'center',
      width: '8rem',
      cell: (row) =>
        row.documentNumber ? (
          toPersianDigits(row.documentNumber)
        ) : (
          <span className="text-xs text-muted-foreground">ثبت نشده</span>
        ),
    },
    {
      key: 'documentDate',
      header: 'تاریخ سند',
      align: 'center',
      width: '7rem',
      sortKey: 'documentDate',
      cell: (row) => (row.documentDate ? formatIsoAsJalali(row.documentDate) : '—'),
    },
    {
      key: 'fiscalYear',
      header: 'سال مالی',
      align: 'center',
      width: '6rem',
      sortKey: 'fiscalYear',
      cell: (row) => toPersianDigits(String(row.fiscalYear)),
    },
    {
      key: 'attachments',
      header: 'فایل',
      align: 'center',
      width: '5rem',
      cell: (row) =>
        row._count.attachments === 0 ? (
          <span className="text-xs text-destructive">ندارد</span>
        ) : (
          toPersianDigits(String(row._count.attachments))
        ),
    },
    {
      key: 'feedback',
      header: 'بازخورد باز',
      align: 'center',
      width: '6rem',
      cell: (row) =>
        row.openFeedbackCount === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
            {toPersianDigits(String(row.openFeedbackCount))}
          </span>
        ),
    },
    {
      key: 'total',
      header: 'جمع کل',
      align: 'end',
      sortKey: 'totalAmount',
      cell: (row) => formatMoney(row.totalAmount),
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      width: '8rem',
      cell: (row) => (
        <span
          className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[row.status] ?? 'bg-muted text-muted-foreground'}`}
        >
          {DOCUMENT_STATUS_LABELS[row.status]}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold">کارتابل بایگانی</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          اسنادی که به بایگانی ارجاع شده‌اند. شماره و تاریخ سند، فایل اسکن و نهایی کردن بایگانی
          از همین‌جا انجام می‌شود. هیچ مبلغی از این مسیر قابل تغییر نیست.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="جست‌وجو"
          placeholder="شرح سند یا شماره سند"
          value={filters.search}
          onChange={(event) => update({ search: event.target.value })}
        />
        <Select
          label="وضعیت"
          placeholder="همه"
          value={filters.status}
          onChange={(event) => update({ status: event.target.value as ArchiveInboxFilters['status'] })}
          options={[
            { value: 'PENDING_ARCHIVE', label: DOCUMENT_STATUS_LABELS.PENDING_ARCHIVE },
            { value: 'ARCHIVED', label: DOCUMENT_STATUS_LABELS.ARCHIVED },
            { value: 'NEEDS_REVISION', label: DOCUMENT_STATUS_LABELS.NEEDS_REVISION },
          ]}
        />
        <Input
          label="سال مالی"
          inputMode="numeric"
          placeholder="۱۴۰۵"
          value={filters.fiscalYear}
          onChange={(event) => update({ fiscalYear: event.target.value.replace(/\D/gu, '') })}
        />
        <Select
          label="بازخورد رسیدگی‌نشده"
          placeholder="مهم نیست"
          value={filters.hasOpenFeedback}
          onChange={(event) =>
            update({ hasOpenFeedback: event.target.value as ArchiveInboxFilters['hasOpenFeedback'] })
          }
          options={[
            { value: 'true', label: 'دارد' },
            { value: 'false', label: 'ندارد' },
          ]}
        />
      </div>

      <DataTable
        columns={columns}
        rows={inbox.data?.items ?? []}
        rowKey={(row) => row.id}
        page={
          inbox.data
            ? {
                page: inbox.data.page,
                pageSize: inbox.data.pageSize,
                total: inbox.data.total,
                pageCount: inbox.data.pageCount,
              }
            : undefined
        }
        onPageChange={(next) => setFilters((previous) => ({ ...previous, page: next }))}
        isLoading={inbox.isPending}
        error={
          inbox.isError
            ? inbox.error instanceof ApiError
              ? inbox.error.message
              : 'دریافت کارتابل ناموفق بود'
            : undefined
        }
        onRetry={() => void inbox.refetch()}
        emptyTitle="سندی در کارتابل نیست"
        emptyDescription="سندی که کارپردازی به بایگانی ارجاع دهد، همین‌جا ظاهر می‌شود."
      />
    </div>
  );
}
