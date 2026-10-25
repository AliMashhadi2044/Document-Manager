import { useState } from 'react';
import {
  DOCUMENT_STATUS_LABELS,
  PAYMENT_SETTLEMENT_LABELS,
  type DocumentStatus,
} from '@dm/shared';

import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { formatIsoAsJalali, formatMoney, toPersianDigits } from '../../shared/format/money';
import { ApiError } from '../../shared/api/client';
import { useArchiveInbox, type ArchiveInboxFilters, type ArchiveInboxRow } from './archive.api';
import { Badge, type BadgeTone } from '../../shared/ui/badge';
import { ArchiveWorkspace } from './archive-workspace';
import { SettlementBadge } from './payment-status-panel';
import type { CurrentUser } from '../auth/auth.api';

/** فقط وضعیت‌هایی که در کارتابل بایگانی ممکن‌اند؛ بقیه خنثی نمایش داده می‌شوند. */
const STATUS_TONES: Partial<Record<DocumentStatus, BadgeTone>> = {
  PENDING_ARCHIVE: 'warning',
  ARCHIVED: 'success',
  NEEDS_REVISION: 'danger',
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
    paymentStatus: '',
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
          title={row.title}
          className="block max-w-[28ch] truncate text-start font-medium text-primary hover:underline"
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
      header: 'جمع کل (ریال)',
      align: 'end',
      sortKey: 'totalAmount',
      cell: (row) => (
        <span title={formatMoney(row.totalAmount)}>
          {formatMoney(row.totalAmount, { withUnit: false })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      width: '10.5rem',
      cell: (row) => (
        <Badge tone={STATUS_TONES[row.status] ?? 'neutral'} dot>
          {DOCUMENT_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    /*
      وضعیت پرداخت، در خود کارتابل.

      نیازمندی چیزی است که باید **دیده** شود، نه چیزی که با باز کردن تک‌تک اسناد
      پیدا شود؛ و رنگش از فاصلهٔ امروز تا مهلت ده‌روزه می‌آید، پس هر بار که
      کارتابل باز می‌شود تازه است.
    */
    {
      key: 'payment',
      header: 'پرداخت',
      align: 'center',
      width: '13rem',
      cell: (row) => <SettlementBadge detail={row} />,
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
          onChange={(nextValue) => update({ status: nextValue as ArchiveInboxFilters['status'] })}
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
          onChange={(nextValue) =>
            update({ hasOpenFeedback: nextValue as ArchiveInboxFilters['hasOpenFeedback'] })
          }
          options={[
            { value: 'true', label: 'دارد' },
            { value: 'false', label: 'ندارد' },
          ]}
        />
        <Select
          label="وضعیت پرداخت"
          placeholder="همه"
          value={filters.paymentStatus}
          onChange={(nextValue) =>
            update({ paymentStatus: nextValue as ArchiveInboxFilters['paymentStatus'] })
          }
          options={[
            { value: 'OUTSTANDING', label: PAYMENT_SETTLEMENT_LABELS.OUTSTANDING },
            { value: 'FULLY_PAID', label: PAYMENT_SETTLEMENT_LABELS.FULLY_PAID },
            // «تعیین‌نشده» وضعیت نیست، نبودِ وضعیت است — و در یک سامانهٔ مالی با
            // «پرداخت کامل» یکی گرفته نمی‌شود.
            { value: 'UNSET', label: 'تعیین‌نشده' },
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
