import { useState, type FormEvent } from 'react';
import { PERSON_TYPE_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Badge } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useCurrentUser } from '../auth/auth.api';
import {
  useBuyers,
  useCreateBuyer,
  useDeleteBuyer,
  useUpdateBuyer,
  type BuyerInput,
  type BuyerRow,
} from './buyers.api';

/**
 * مدیریت مجموعه‌های خریدار.
 *
 * مجموعه خریدار، طرفِ خریدارِ سند است. در لحظه ایجاد سند، کل رکورد در یک ردیف
 * snapshot کپی می‌شود؛ یعنی **ویرایش اینجا اسناد گذشته را تغییر نمی‌دهد** و فقط بر
 * اسناد تازه اثر دارد. همین قاعده دو تصمیم این صفحه را توضیح می‌دهد:
 *
 *  - حذف فقط وقتی ممکن است که هیچ سندی به مجموعه وصل نباشد؛ راه درستِ کنار گذاشتن
 *    یک مجموعه بهکاررفته، **غیرفعال کردن** آن است.
 *  - یک مجموعه می‌تواند «پیش‌فرض» باشد تا فرم ایجاد سند از پیش پرش کند. مجموعه
 *    غیرفعال نمی‌تواند پیش‌فرض بماند، وگرنه فرم مقداری را انتخاب می‌کند که در فهرست
 *    گزینه‌هایش نیست.
 */
export function BuyersPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<BuyerRow | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data: user } = useCurrentUser();
  const canWrite = user?.permissions.includes('buyer:write') ?? false;

  const list = useBuyers(page, search, status);
  const update = useUpdateBuyer();
  const remove = useDeleteBuyer();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(
          error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد',
        ),
    );
  };

  const columns: Column<BuyerRow>[] = [
    {
      key: 'name',
      header: 'نام / عنوان',
      sortKey: 'name',
      cell: (row) => (
        <div className="max-w-[34ch]">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium" title={row.name}>
              {row.name}
            </span>
            {row.isDefault ? (
              <Badge tone="primary">
                <Icon name="check" size={12} />
                پیش‌فرض
              </Badge>
            ) : null}
          </div>
          {row.addressLine ? (
            <div className="truncate text-xs text-muted-foreground" title={row.addressLine}>
              {row.addressLine}
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
      key: 'phone',
      header: 'تلفن',
      align: 'center',
      width: '8rem',
      cell: (row) => (
        <span dir="ltr" className="text-xs">
          {row.phone ?? '—'}
        </span>
      ),
    },
    {
      key: 'documents',
      header: 'اسناد',
      align: 'center',
      width: '5rem',
      cell: (row) => <span className="money">{toPersianDigits(String(row.documentCount))}</span>,
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
      width: '9rem',
      /*
       * دکمه‌های فقط-آیکون، نه دکمه‌های برچسب‌دار.
       *
       * چهار دکمه برچسب‌دار در یک ستون باریک، سه خط می‌شوند و ارتفاع ردیف‌ها را
       * نامنظم می‌کنند؛ پویش چشمی ستون عددیِ کنارشان همان‌جا سخت می‌شود. نام هر
       * دکمه با `aria-label` و `title` می‌آید، پس نه صفحه‌خوان چیزی از دست می‌دهد
       * نه کاربر ماوس.
       */
      cell: (row) =>
        canWrite ? (
          <div className="flex items-center justify-end gap-0.5">
            <RowAction
              icon="edit"
              label={`اصلاح ${row.name}`}
              onClick={() => setEditing(row)}
            />

            {!row.isDefault && row.isActive ? (
              <RowAction
                icon="pin"
                label={`${row.name} پیش‌فرض فرم ایجاد سند شود`}
                onClick={() =>
                  act(
                    update.mutateAsync({ id: row.id, isDefault: true }),
                    'مجموعه پیش‌فرض تغییر کرد.',
                  )
                }
              />
            ) : null}

            <RowAction
              icon="power"
              label={`${row.isActive ? 'غیرفعال کردن' : 'فعال کردن'} ${row.name}`}
              onClick={() =>
                act(
                  update.mutateAsync({ id: row.id, isActive: !row.isActive }),
                  row.isActive ? 'مجموعه غیرفعال شد.' : 'مجموعه فعال شد.',
                )
              }
            />

            {/* حذف فقط برای مجموعه بی‌سند؛ بقیه باید غیرفعال شوند. */}
            {row.documentCount === 0 ? (
              <RowAction
                icon="trash"
                danger
                label={`حذف مجموعه ${row.name}`}
                onClick={() => {
                  if (!window.confirm(`«${row.name}» حذف شود؟`)) return;
                  act(remove.mutateAsync(row.id), 'مجموعه حذف شد.');
                }}
              />
            ) : null}
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
        error={list.isError ? 'دریافت فهرست مجموعه‌های خریدار ناموفق بود' : undefined}
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
        emptyTitle="مجموعه خریداری ثبت نشده است"
        emptyDescription="بدون دست‌کم یک مجموعه فعال، ایجاد سند ممکن نیست."
        emptyAction={
          canWrite ? (
            <Button onClick={() => setEditing('new')}>افزودن مجموعه خریدار</Button>
          ) : undefined
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
                placeholder="نام یا عنوان مجموعه"
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
                افزودن مجموعه
              </Button>
            ) : null}
          </div>
        }
      />

      {editing !== null ? (
        <BuyerDialog
          buyer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMessage(text);
          }}
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
  danger = false,
}: {
  icon: 'edit' | 'pin' | 'power' | 'trash';
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

/** فرم ایجاد و اصلاح، در یک گفت‌وگو. */
function BuyerDialog({
  buyer,
  onClose,
  onSaved,
}: {
  buyer: BuyerRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const create = useCreateBuyer();
  const update = useUpdateBuyer();

  const [form, setForm] = useState<BuyerInput>({
    personType: buyer?.personType ?? 'LEGAL',
    name: buyer?.name ?? '',
    economicCode: buyer?.economicCode ?? '',
    registrationNumber: buyer?.registrationNumber ?? '',
    nationalId: buyer?.nationalId ?? '',
    addressLine: buyer?.addressLine ?? '',
    postalCode: buyer?.postalCode ?? '',
    phone: buyer?.phone ?? '',
    fax: buyer?.fax ?? '',
    isActive: buyer?.isActive ?? true,
    isDefault: buyer?.isDefault ?? false,
    sortOrder: buyer?.sortOrder ?? 0,
  });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof BuyerInput>(key: K, value: BuyerInput[K]): void =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    const payload: BuyerInput = { ...form, name: form.name.trim() };
    const action = buyer
      ? update.mutateAsync({ id: buyer.id, ...payload })
      : create.mutateAsync(payload);

    void action.then(
      () => onSaved(buyer ? 'مجموعه خریدار اصلاح شد.' : 'مجموعه خریدار ثبت شد.'),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <Modal title={buyer ? 'اصلاح مجموعه خریدار' : 'مجموعه خریدار جدید'} onClose={onClose}>
      <form className="grid gap-x-5 gap-y-4 md:grid-cols-2" onSubmit={submit}>
        <div className="md:col-span-2">
          <Select
            label="نوع شخص"
            required
            prefsKey={null}
            placeholder={null}
            value={form.personType}
            onChange={(nextValue) => set('personType', nextValue as 'NATURAL' | 'LEGAL')}
            options={[
              { value: 'LEGAL', label: PERSON_TYPE_LABELS.LEGAL },
              { value: 'NATURAL', label: PERSON_TYPE_LABELS.NATURAL },
            ]}
          />
        </div>

        <div className="md:col-span-2">
          <Input
            label="نام / عنوان"
            required
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            hint="همان عنوانی که روی سند چاپ می‌شود."
          />
        </div>

        <Input
          label="شماره اقتصادی"
          dir="ltr"
          value={form.economicCode ?? ''}
          onChange={(event) => set('economicCode', event.target.value)}
        />

        <Input
          label={form.personType === 'LEGAL' ? 'شناسه ملی' : 'کد ملی'}
          dir="ltr"
          value={form.nationalId ?? ''}
          onChange={(event) => set('nationalId', event.target.value)}
        />

        <Input
          label="شماره ثبت"
          dir="ltr"
          value={form.registrationNumber ?? ''}
          onChange={(event) => set('registrationNumber', event.target.value)}
        />

        <Input
          label="کد پستی"
          dir="ltr"
          value={form.postalCode ?? ''}
          onChange={(event) => set('postalCode', event.target.value)}
        />

        <Input
          label="تلفن"
          dir="ltr"
          value={form.phone ?? ''}
          onChange={(event) => set('phone', event.target.value)}
        />

        <Input
          label="نمابر"
          dir="ltr"
          value={form.fax ?? ''}
          onChange={(event) => set('fax', event.target.value)}
        />

        <div className="md:col-span-2">
          <Input
            label="نشانی"
            value={form.addressLine ?? ''}
            onChange={(event) => set('addressLine', event.target.value)}
          />
        </div>

        <Input
          label="ترتیب نمایش"
          inputMode="numeric"
          value={String(form.sortOrder ?? 0)}
          onChange={(event) => set('sortOrder', Number(event.target.value.replace(/\D/gu, '')) || 0)}
          hint="عدد کوچک‌تر، بالاتر در فهرست."
        />

        <div className="flex flex-col justify-center gap-2 pt-1">
          <Toggle
            checked={form.isActive ?? true}
            onChange={(checked) => {
              set('isActive', checked);
              // غیرفعال کردن، پیش‌فرض بودن را هم برمی‌دارد — سرور هم همین کار را می‌کند.
              if (!checked) set('isDefault', false);
            }}
            label="فعال"
          />
          <Toggle
            checked={form.isDefault ?? false}
            disabled={!(form.isActive ?? true)}
            onChange={(checked) => set('isDefault', checked)}
            label="پیش‌فرضِ فرم ایجاد سند"
          />
        </div>

        {error ? (
          <p role="alert" className="md:col-span-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="md:col-span-2 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="submit" loading={busy}>
            {buyer ? 'ثبت اصلاح' : 'ثبت مجموعه'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>

          {buyer ? (
            <p className="ms-auto self-center text-xs text-muted-foreground">
              اصلاح، اسناد ثبت‌شده را تغییر نمی‌دهد؛ فقط اسناد تازه را.
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

/** کلید دوحالته — چک‌باکس بومی با ظاهر سوئیچ، تا دسترس‌پذیری‌اش دست‌نخورده بماند. */
function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label
      className={`flex items-center gap-2.5 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {/*
        دستگیره با ترازبندی flex جابه‌جا می‌شود، نه با جابه‌جایی دستی.
        هم در چیدمان راست‌چین درست کار می‌کند و هم به یک عنصرِ خواهرِ ورودی نیاز دارد
        (واریانت peer فقط روی خواهرها کار می‌کند، نه فرزندانِ آن‌ها).
      */}
      <span
        aria-hidden="true"
        className="flex h-5 w-9 shrink-0 items-center rounded-full bg-muted p-0.5 transition-colors peer-checked:justify-end peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40"
      >
        <span className="size-4 rounded-full bg-card shadow transition-all" />
      </span>
      {label}
    </label>
  );
}
