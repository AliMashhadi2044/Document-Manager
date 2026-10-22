import { useState } from 'react';
import { SIGNATORY_ROLE_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Badge } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { ApiError } from '../../shared/api/client';
import { useDebouncedValue } from '../../shared/hooks/use-debounced-value';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useCurrentUser } from '../auth/auth.api';
import { SignatoryDialog } from './signatory-dialog';
import {
  useDeleteSignatory,
  useSignatoriesList,
  useUpdateSignatory,
  type SignatoryRow,
} from './people.api';
import { RowAction } from './row-action';

/**
 * امضاکنندگان — نام و سمتی که پای خروجی‌ها می‌نشیند.
 *
 * تا پیش از این فقط از راه seed وارد می‌شدند: اگر مسئول کارپردازی عوض می‌شد، نامِ
 * پای همهٔ گزارش‌ها همان نام قدیمی می‌ماند و هیچ راهی برای تغییرش در سامانه نبود.
 *
 * قالب گزارش فقط **نقش** را نگه می‌دارد؛ پس اصلاح اینجا، خروجی‌های بعدی را تازه
 * می‌کند و خروجی‌های گرفته‌شده را — که نسخهٔ snapshot خودشان را دارند — دست نمی‌زند.
 */
export function SignatoriesPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<SignatoryRow | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: user } = useCurrentUser();
  const canWrite = user?.permissions.includes('base_data:write') ?? false;

  /*
    متن جست‌وجو با تأخیر به کوئری می‌رسد.

    هر نویسه یک درخواست سمت سرور می‌ساخت؛ نوشتن یک نام یعنی چند درخواست که همه‌شان
    جز آخری پیش از رسیدن پاسخ بی‌مصرف شده‌اند.
  */
  const debouncedSearch = useDebouncedValue(search, 300);

  const list = useSignatoriesList(page, debouncedSearch, status);
  const update = useUpdateSignatory();
  const remove = useDeleteSignatory();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  const columns: Column<SignatoryRow>[] = [
    {
      key: 'fullName',
      header: 'نام',
      sortKey: 'fullName',
      cell: (row) => (
        <div className="max-w-[32ch]">
          <div className="truncate font-medium" title={row.fullName}>
            {row.fullName}
          </div>
          <div className="truncate text-xs text-muted-foreground">{row.positionTitle}</div>
        </div>
      ),
    },
    {
      key: 'roleKey',
      header: 'نقش در خروجی',
      width: '12rem',
      cell: (row) => <Badge tone="neutral">{SIGNATORY_ROLE_LABELS[row.roleKey]}</Badge>,
    },
    {
      key: 'sortOrder',
      header: 'ترتیب',
      align: 'center',
      width: '6rem',
      sortKey: 'sortOrder',
      cell: (row) => <span className="money">{toPersianDigits(String(row.sortOrder))}</span>,
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      width: '6rem',
      cell: (row) => (
        <Badge tone={row.isActive ? 'success' : 'neutral'} dot>
          {row.isActive ? 'فعال' : 'غیرفعال'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'اقدام',
      align: 'end',
      width: '7rem',
      cell: (row) =>
        canWrite ? (
          <div className="flex items-center justify-end gap-0.5">
            <RowAction icon="edit" label={`اصلاح ${row.fullName}`} onClick={() => setEditing(row)} />
            <RowAction
              icon="power"
              label={`${row.isActive ? 'غیرفعال کردن' : 'فعال کردن'} ${row.fullName}`}
              onClick={() =>
                act(
                  update.mutateAsync({ id: row.id, isActive: !row.isActive }),
                  row.isActive ? 'امضاکننده غیرفعال شد.' : 'امضاکننده فعال شد.',
                )
              }
            />
            <RowAction
              icon="trash"
              danger
              label={`حذف ${row.fullName}`}
              onClick={() => {
                if (!window.confirm(`«${row.fullName}» حذف شود؟`)) return;
                act(remove.mutateAsync(row.id), 'امضاکننده حذف شد.');
              }}
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
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
        error={list.isError ? 'دریافت فهرست امضاکنندگان ناموفق بود' : undefined}
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
        emptyTitle="امضاکننده‌ای ثبت نشده است"
        emptyDescription="بلوک امضای خروجی‌ها از همین فهرست پر می‌شود."
        emptyAction={
          canWrite ? <Button onClick={() => setEditing('new')}>افزودن امضاکننده</Button> : undefined
        }
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
                placeholder="نام یا سمت"
              />
            </div>

            <div className="w-36">
              <Select
                label="وضعیت"
                prefsKey={null}
                placeholder="همه"
                value={status}
                onChange={(nextValue) => {
                  setStatus(nextValue);
                  setPage(1);
                }}
                options={[
                  { value: 'true', label: 'فعال' },
                  { value: 'false', label: 'غیرفعال' },
                ]}
              />
            </div>

            {canWrite ? (
              <Button onClick={() => setEditing('new')}>
                <Icon name="plus" size={16} />
                افزودن امضاکننده
              </Button>
            ) : null}
          </div>
        }
      />

      {editing !== null ? (
        <SignatoryDialog
          signatory={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(_saved, text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      ) : null}
    </div>
  );
}
