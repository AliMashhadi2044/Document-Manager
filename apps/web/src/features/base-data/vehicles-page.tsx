import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Badge } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { PlateBadge } from '../../shared/ui/plate-input';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { ApiError } from '../../shared/api/client';
import { useDebouncedValue } from '../../shared/hooks/use-debounced-value';
import { formatServerMessage } from '../../shared/format/money';
import { useCurrentUser } from '../auth/auth.api';
import { useBootstrap } from './base-data.api';
import { VehicleDialog } from './vehicle-dialog';
import { RowAction } from './row-action';
import { useDeleteVehicle, useUpdateVehicle, useVehicles, type VehicleRow } from './vehicles.api';

/**
 * خودروها (پلاک‌ها) — اطلاعات پایهٔ فاکتور سوخت.
 *
 * مثل مدرسه، API کامل بود و صفحه‌اش نبود؛ یعنی پلاک فقط از راه seed وارد می‌شد.
 * حذف فقط برای پلاک بی‌فاکتور ممکن است و راه درستِ کنار گذاشتن پلاک به‌کاررفته
 * غیرفعال کردن است.
 */
export function VehiclesPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeId, setTypeId] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<VehicleRow | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: user } = useCurrentUser();
  const canWrite = user?.permissions.includes('base_data:write') ?? false;

  const bootstrap = useBootstrap();
  /*
    متن جست‌وجو با تأخیر به کوئری می‌رسد.

    هر نویسه یک درخواست سمت سرور می‌ساخت؛ نوشتن یک نام یعنی چند درخواست که همه‌شان
    جز آخری پیش از رسیدن پاسخ بی‌مصرف شده‌اند.
  */
  const debouncedSearch = useDebouncedValue(search, 300);

  const list = useVehicles(page, debouncedSearch, typeId, status);
  const update = useUpdateVehicle();
  const remove = useDeleteVehicle();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  const columns: Column<VehicleRow>[] = [
    {
      key: 'plateNumber',
      header: 'پلاک',
      sortKey: 'plateNumber',
      cell: (row) => (
        <div className="max-w-[28ch]">
            {row.notes ? (
            <div className="truncate text-xs mb-2 text-muted-foreground" title={row.notes}>
              {row.notes}
            </div>
          ) : null}
          <PlateBadge plate={row.plateNumber} />
        </div>
      ),
    },
    {
      key: 'vehicleType',
      header: 'نوع خودرو',
      width: '12rem',
      cell: (row) => row.vehicleType.title,
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
            <RowAction
              icon="edit"
              label={`اصلاح پلاک ${row.plateNumber}`}
              onClick={() => setEditing(row)}
            />
            <RowAction
              icon="power"
              label={`${row.isActive ? 'غیرفعال کردن' : 'فعال کردن'} پلاک ${row.plateNumber}`}
              onClick={() =>
                act(
                  update.mutateAsync({ id: row.id, isActive: !row.isActive }),
                  row.isActive ? 'خودرو غیرفعال شد.' : 'خودرو فعال شد.',
                )
              }
            />
            <RowAction
              icon="trash"
              danger
              label={`حذف پلاک ${row.plateNumber}`}
              onClick={() => {
                if (!window.confirm(`پلاک «${row.plateNumber}» حذف شود؟`)) return;
                act(remove.mutateAsync(row.id), 'خودرو حذف شد.');
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
        error={list.isError ? 'دریافت فهرست خودروها ناموفق بود' : undefined}
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
        emptyTitle="خودرویی ثبت نشده است"
        emptyDescription="فاکتور سوخت بدون پلاک ثبت نمی‌شود."
        emptyAction={
          canWrite ? <Button onClick={() => setEditing('new')}>افزودن خودرو</Button> : undefined
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
                placeholder="پلاک"
              />
            </div>

            <div className="w-48">
              <Select
                label="نوع خودرو"
                prefsKey={null}
                placeholder="همه"
                value={typeId}
                onChange={(nextValue) => {
                  setTypeId(nextValue);
                  setPage(1);
                }}
                options={(bootstrap.data?.vehicleTypes ?? []).map((type) => ({
                  value: type.id,
                  label: type.title,
                }))}
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
                افزودن خودرو
              </Button>
            ) : null}
          </div>
        }
      />

      {editing !== null ? (
        <VehicleDialog
          vehicle={editing === 'new' ? null : editing}
          {...(typeId ? { defaultVehicleTypeId: typeId } : {})}
          onClose={() => setEditing(null)}
          onSaved={(_vehicle, text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      ) : null}
    </div>
  );
}

