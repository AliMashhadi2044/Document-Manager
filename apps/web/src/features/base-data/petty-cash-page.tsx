import { useState } from 'react';

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
import { PettyCashDialog } from './petty-cash-dialog';
import {
  useDeletePettyCashHolder,
  usePettyCashHolders,
  useUpdatePettyCashHolder,
  type PettyCashHolderRow,
} from './people.api';
import { RowAction } from './row-action';

/**
 * تنخواه‌داران — اطلاعات پایهٔ روش پرداخت «کارپرداز / تنخواه».
 *
 * تا پیش از این، تنخواه‌دار به جدول کاربران گره خورده بود و چون مدیریت کاربران
 * هنوز نیست، فرم فاکتور عملاً هیچ‌وقت کسی را انتخاب نمی‌کرد و زیر روش پرداخت پیامی
 * می‌گذاشت که «بعداً در دسترس قرار می‌گیرد». تنخواه‌دار کاربر سامانه نیست؛ پس
 * اطلاعات پایهٔ خودش را دارد و آن بن‌بست برداشته شد.
 */
export function PettyCashPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<PettyCashHolderRow | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: user } = useCurrentUser();
  const canWrite = user?.permissions.includes('base_data:write') ?? false;

  /*
    متن جست‌وجو با تأخیر به کوئری می‌رسد.

    هر نویسه یک درخواست سمت سرور می‌ساخت؛ نوشتن یک نام یعنی چند درخواست که همه‌شان
    جز آخری پیش از رسیدن پاسخ بی‌مصرف شده‌اند.
  */
  const debouncedSearch = useDebouncedValue(search, 300);

  const list = usePettyCashHolders(page, debouncedSearch, status);
  const update = useUpdatePettyCashHolder();
  const remove = useDeletePettyCashHolder();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  const columns: Column<PettyCashHolderRow>[] = [
    {
      key: 'fullName',
      header: 'تنخواه‌دار',
      sortKey: 'fullName',
      cell: (row) => (
        <div className="max-w-[30ch]">
          <div className="truncate font-medium" title={row.fullName}>
            {row.fullName}
          </div>
          {row.positionTitle ? (
            <div className="truncate text-xs text-muted-foreground">{row.positionTitle}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'account',
      header: 'حساب',
      cell: (row) => (
        <div className="max-w-[32ch]">
          {/* نام صاحب حساب، نه نام تنخواه‌دار: همین است که در گزارش می‌نشیند. */}
          <div className="truncate text-sm">{row.accountHolderName ?? row.fullName}</div>
          {row.ibanNormalized ? (
            <div dir="ltr" className="money truncate text-xs text-muted-foreground">
              {toPersianDigits(row.ibanNormalized)}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">شبایی ثبت نشده است</div>
          )}
        </div>
      ),
    },
    {
      key: 'bank',
      header: 'بانک',
      width: '12rem',
      cell: (row) => row.bank?.titleFa ?? '—',
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
                  row.isActive ? 'تنخواه‌دار غیرفعال شد.' : 'تنخواه‌دار فعال شد.',
                )
              }
            />
            <RowAction
              icon="trash"
              danger
              label={`حذف ${row.fullName}`}
              onClick={() => {
                if (!window.confirm(`«${row.fullName}» حذف شود؟`)) return;
                act(remove.mutateAsync(row.id), 'تنخواه‌دار حذف شد.');
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
        error={list.isError ? 'دریافت فهرست تنخواه‌داران ناموفق بود' : undefined}
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
        emptyTitle="تنخواه‌داری ثبت نشده است"
        emptyDescription="فاکتورِ روش «کارپرداز / تنخواه» از همین فهرست شخص می‌گیرد."
        emptyAction={
          canWrite ? <Button onClick={() => setEditing('new')}>افزودن تنخواه‌دار</Button> : undefined
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
                placeholder="نام تنخواه‌دار یا صاحب حساب"
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
                افزودن تنخواه‌دار
              </Button>
            ) : null}
          </div>
        }
      />

      {editing !== null ? (
        <PettyCashDialog
          holder={editing === 'new' ? null : editing}
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
