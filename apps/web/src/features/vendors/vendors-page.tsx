import { useState } from 'react';
import { PERSON_TYPE_LABELS } from '@dm/shared';

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
import { useUpdateVendor, useVendors, type VendorRow } from './vendors.api';
import { BankAccountsDialog } from './bank-accounts-dialog';
import { VendorDialog } from './vendor-dialog';

/**
 * فهرست و مدیریت فروشندگان.
 *
 * جست‌وجو عمداً چندمعیاره است: نام، نماینده، شماره اقتصادی و شماره/شناسه ملی — چون
 * تشخیص فروشنده موجود فقط با نام قابل اتکا نیست (§۱۱.۲).
 *
 * دو تصمیم این صفحه از قاعده snapshot می‌آید: اصلاح فروشنده **فاکتورهای گذشته را
 * تغییر نمی‌دهد**، و فروشنده‌ای که دیگر کار نمی‌کند حذف نمی‌شود بلکه غیرفعال
 * می‌شود تا تاریخچه و شباهایش سر جای خود بمانند.
 */
export function VendorsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<VendorRow | 'new' | null>(null);
  const [accountsFor, setAccountsFor] = useState<VendorRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: user } = useCurrentUser();
  // ناظر فروشنده را می‌بیند ولی نمی‌سازد؛ دکمه‌ای که به ۴۰۳ ختم می‌شود فقط کاربر را
  // سردرگم می‌کند. مرجع همچنان سرور است، نه این شرط.
  const canWrite = user?.permissions.includes('vendor:write') ?? false;
  const canManageAccounts = user?.permissions.includes('vendor_bank_account:write') ?? false;

  /*
    متن جست‌وجو با تأخیر به کوئری می‌رسد.

    هر نویسه یک درخواست سمت سرور می‌ساخت؛ نوشتن یک نام یعنی چند درخواست که همه‌شان
    جز آخری پیش از رسیدن پاسخ بی‌مصرف شده‌اند.
  */
  const debouncedSearch = useDebouncedValue(search, 300);

  const list = useVendors(page, debouncedSearch, status);
  const update = useUpdateVendor();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  const columns: Column<VendorRow>[] = [
    {
      key: 'name',
      header: 'نام / عنوان',
      sortKey: 'name',
      cell: (row) => (
        <div className="max-w-[32ch]">
          <div className="truncate font-medium" title={row.name}>
            {row.name}
          </div>
          {row.representativeName ? (
            <div className="truncate text-xs text-muted-foreground" title={row.representativeName}>
              نماینده: {row.representativeName}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'personType',
      header: 'نوع',
      align: 'center',
      width: '6rem',
      cell: (row) => PERSON_TYPE_LABELS[row.personType],
    },
    {
      key: 'identity',
      header: 'شناسه',
      width: '11rem',
      cell: (row) => (
        <span dir="ltr" className="font-mono text-xs">
          {row.economicCode ?? row.nationalId ?? row.registrationNumber ?? '—'}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'تماس',
      width: '10rem',
      cell: (row) => (
        <div className="text-xs" dir="ltr">
          <div>{row.phone ? toPersianDigits(row.phone) : '—'}</div>
          {row.postalCode ? (
            <div className="text-muted-foreground">کدپستی {toPersianDigits(row.postalCode)}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'accounts',
      header: 'شبا',
      align: 'center',
      width: '5rem',
      cell: (row) => (
        <span className="money">{toPersianDigits(String(row.bankAccountCount))}</span>
      ),
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
      width: '8rem',
      // دکمه‌های فقط-آیکون با نام کامل در `aria-label` و `title`: سه دکمه برچسب‌دار
      // در یک ستون باریک، ردیف را چندخطی می‌کند.
      cell: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          {canManageAccounts ? (
            <RowAction
              icon="money"
              label={`شباهای ${row.name}`}
              onClick={() => setAccountsFor(row)}
            />
          ) : null}

          {canWrite ? (
            <>
              <RowAction icon="edit" label={`اصلاح ${row.name}`} onClick={() => setEditing(row)} />
              <RowAction
                icon="power"
                label={`${row.isActive ? 'غیرفعال کردن' : 'فعال کردن'} ${row.name}`}
                onClick={() =>
                  act(
                    update.mutateAsync({ id: row.id, isActive: !row.isActive }),
                    row.isActive ? 'فروشنده غیرفعال شد.' : 'فروشنده فعال شد.',
                  )
                }
              />
            </>
          ) : null}
        </div>
      ),
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
        columnsPrefsKey="vendors"
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={list.isPending}
        error={list.isError ? 'دریافت فهرست فروشندگان ناموفق بود' : undefined}
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
        emptyTitle="فروشنده‌ای ثبت نشده است"
        emptyDescription="برای شروع، اولین فروشنده را اضافه کنید."
        emptyAction={
          canWrite ? <Button onClick={() => setEditing('new')}>افزودن فروشنده</Button> : undefined
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
                placeholder="نام، نماینده، شماره اقتصادی یا شماره ملی"
              />
            </div>

            <div className="w-40">
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
                افزودن فروشنده
              </Button>
            ) : null}
          </div>
        }
      />

      {editing !== null ? (
        <VendorDialog
          vendor={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(_vendor, text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      ) : null}

      {accountsFor !== null ? (
        <BankAccountsDialog
          vendorId={accountsFor.id}
          vendorName={accountsFor.name}
          onClose={() => setAccountsFor(null)}
        />
      ) : null}
    </div>
  );
}

/** دکمه اقدام ردیف — فقط آیکون، با نام کامل برای صفحه‌خوان و راهنمای ماوس. */
function RowAction({
  icon,
  label,
  onClick,
}: {
  icon: 'edit' | 'power' | 'money';
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
