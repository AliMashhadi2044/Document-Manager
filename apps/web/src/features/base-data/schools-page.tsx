import { useState } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Badge } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useCurrentUser } from '../auth/auth.api';
import { useBootstrap } from './base-data.api';
import { SchoolDialog } from './school-dialog';
import { useDeleteSchool, useSchools, useUpdateSchool, type SchoolRow } from './schools.api';

/**
 * مدارس.
 *
 * تا پیش از این، مدرسه فقط از راه seed وارد می‌شد: فهرست ساده نبود (ناحیه دارد) پس
 * در صفحهٔ «اطلاعات پایه» نمی‌آمد، و صفحهٔ خودش هم ساخته نشده بود — یعنی کاربر هیچ
 * راهی برای افزودن مدرسه نداشت، با اینکه API کامل بود.
 *
 * حذف فقط برای مدرسهٔ بی‌فاکتور ممکن است؛ راه درستِ کنار گذاشتن مدرسهٔ به‌کاررفته
 * **غیرفعال کردن** است تا فاکتورهای گذشته دست‌نخورده بمانند.
 */
export function SchoolsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<SchoolRow | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: user } = useCurrentUser();
  const canWrite = user?.permissions.includes('base_data:write') ?? false;

  const bootstrap = useBootstrap();
  const list = useSchools(page, search, districtId, status);
  const update = useUpdateSchool();
  const remove = useDeleteSchool();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  const columns: Column<SchoolRow>[] = [
    {
      key: 'title',
      header: 'نام مدرسه',
      sortKey: 'title',
      cell: (row) => (
        <div className="max-w-[36ch]">
          <div className="truncate font-medium" title={row.title}>
            {row.title}
          </div>
          {row.code ? (
            <div dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
              {toPersianDigits(row.code)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'district',
      header: 'ناحیه',
      width: '12rem',
      cell: (row) => row.district.title,
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
            <RowAction icon="edit" label={`اصلاح ${row.title}`} onClick={() => setEditing(row)} />
            <RowAction
              icon="power"
              label={`${row.isActive ? 'غیرفعال کردن' : 'فعال کردن'} ${row.title}`}
              onClick={() =>
                act(
                  update.mutateAsync({ id: row.id, isActive: !row.isActive }),
                  row.isActive ? 'مدرسه غیرفعال شد.' : 'مدرسه فعال شد.',
                )
              }
            />
            <RowAction
              icon="trash"
              danger
              label={`حذف ${row.title}`}
              onClick={() => {
                if (!window.confirm(`«${row.title}» حذف شود؟`)) return;
                act(remove.mutateAsync(row.id), 'مدرسه حذف شد.');
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
        error={list.isError ? 'دریافت فهرست مدارس ناموفق بود' : undefined}
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
        emptyTitle="مدرسه‌ای ثبت نشده است"
        emptyDescription="فاکتور انشعابات بدون مدرسه ثبت نمی‌شود."
        emptyAction={
          canWrite ? <Button onClick={() => setEditing('new')}>افزودن مدرسه</Button> : undefined
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
                placeholder="نام یا کد مدرسه"
              />
            </div>

            <div className="w-48">
              <Select
                label="ناحیه"
                prefsKey={null}
                placeholder="همه"
                value={districtId}
                onChange={(nextValue) => {
                  setDistrictId(nextValue);
                  setPage(1);
                }}
                options={(bootstrap.data?.districts ?? []).map((district) => ({
                  value: district.id,
                  label: district.title,
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
                افزودن مدرسه
              </Button>
            ) : null}
          </div>
        }
      />

      {editing !== null ? (
        <SchoolDialog
          school={editing === 'new' ? null : editing}
          {...(districtId ? { defaultDistrictId: districtId } : {})}
          onClose={() => setEditing(null)}
          onSaved={(_school, text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      ) : null}
    </div>
  );
}

function RowAction({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: 'edit' | 'power' | 'trash';
  label: string;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-150 hover:bg-muted active:scale-90 ${
        danger ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
