import { useState } from 'react';
import { PERSON_TYPE_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { DataTable, type Column } from '../../shared/ui/data-table';
import { ApiError } from '../../shared/api/client';
import { useCreateVendor, useValidateIban, useVendors, type VendorRow } from './vendors.api';

/**
 * فهرست و ثبت فروشندگان.
 *
 * جست‌وجو عمداً چندمعیاره است: نام، نماینده، شماره اقتصادی و شماره/شناسه ملی — چون
 * تشخیص فروشنده موجود فقط با نام قابل اتکا نیست (§۱۱.۲).
 */
export function VendorsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const list = useVendors(page, search);

  const columns: Column<VendorRow>[] = [
    {
      key: 'name',
      header: 'نام / عنوان',
      sortKey: 'name',
      cell: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          {row.representativeName ? (
            <div className="text-xs text-muted-foreground">نماینده: {row.representativeName}</div>
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
      width: '12rem',
      cell: (row) => (
        <span dir="ltr" className="font-mono text-xs">
          {row.economicCode ?? row.nationalId ?? '—'}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'تلفن',
      align: 'center',
      width: '8rem',
      cell: (row) => <span dir="ltr">{row.phone ?? '—'}</span>,
    },
    {
      key: 'accounts',
      header: 'شبا',
      align: 'center',
      width: '5rem',
      cell: (row) => row.bankAccountCount.toLocaleString('fa-IR'),
    },
    {
      key: 'status',
      header: 'وضعیت',
      align: 'center',
      width: '6rem',
      cell: (row) => (
        <span
          className={
            row.isActive
              ? 'rounded bg-success/10 px-2 py-0.5 text-xs text-success'
              : 'rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground'
          }
        >
          {row.isActive ? 'فعال' : 'غیرفعال'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {showForm ? <VendorForm onClose={() => setShowForm(false)} /> : null}

      <DataTable
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
        emptyAction={<Button onClick={() => setShowForm(true)}>افزودن فروشنده</Button>}
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
                placeholder="نام، نماینده، شماره اقتصادی یا شماره ملی"
                hint="جست‌وجو فقط بر اساس نام نیست؛ شناسه‌های هویتی هم بررسی می‌شوند."
              />
            </div>
            <Button onClick={() => setShowForm((value) => !value)}>
              {showForm ? 'بستن فرم' : 'افزودن فروشنده'}
            </Button>
          </div>
        }
      />
    </div>
  );
}

function VendorForm({ onClose }: { onClose: () => void }): JSX.Element {
  const create = useCreateVendor();
  const ibanCheck = useValidateIban();

  const [personType, setPersonType] = useState<'NATURAL' | 'LEGAL'>('LEGAL');
  const [name, setName] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [economicCode, setEconomicCode] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [iban, setIban] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-semibold">ثبت فروشنده جدید</h3>

      <form
        className="mt-4 grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          create.mutate(
            {
              personType,
              name: name.trim(),
              // برای شخص حقیقی، نماینده اصلاً ارسال نمی‌شود — سرور هم ردش می‌کند.
              ...(personType === 'LEGAL' && representativeName.trim()
                ? { representativeName: representativeName.trim() }
                : {}),
              ...(economicCode.trim() ? { economicCode: economicCode.trim() } : {}),
              ...(addressLine.trim() ? { addressLine: addressLine.trim() } : {}),
            },
            {
              onSuccess: () => {
                setName('');
                setRepresentativeName('');
                setEconomicCode('');
                setAddressLine('');
                setMessage('فروشنده ثبت شد');
              },
              onError: (error) =>
                setMessage(error instanceof ApiError ? error.message : 'خطا در ثبت فروشنده'),
            },
          );
        }}
      >
        <div className="md:col-span-2">
          <span className="block text-sm font-medium">نوع شخص</span>
          <div className="mt-1.5 flex gap-2">
            {(['LEGAL', 'NATURAL'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={personType === value ? 'primary' : 'secondary'}
                aria-pressed={personType === value}
                onClick={() => setPersonType(value)}
              >
                {PERSON_TYPE_LABELS[value]}
              </Button>
            ))}
          </div>
        </div>

        <Input
          label={personType === 'LEGAL' ? 'عنوان شرکت' : 'نام شخص'}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        {/* فیلد نماینده فقط برای شخص حقوقی نمایش داده می‌شود (§۱۱.۱). */}
        {personType === 'LEGAL' ? (
          <Input
            label="نام نماینده"
            value={representativeName}
            onChange={(event) => setRepresentativeName(event.target.value)}
            hint="اختیاری — در ستون «نام فروشنده» گزارش مالیات می‌نشیند."
          />
        ) : null}

        <Input
          label="شماره اقتصادی"
          value={economicCode}
          onChange={(event) => setEconomicCode(event.target.value)}
          dir="ltr"
          hint="برای جلوگیری از ثبت تکراری استفاده می‌شود."
        />

        <Input
          label="آدرس"
          value={addressLine}
          onChange={(event) => setAddressLine(event.target.value)}
        />

        <div className="md:col-span-2">
          <Input
            label="بررسی شبا (اختیاری، بدون ذخیره)"
            value={iban}
            dir="ltr"
            onChange={(event) => setIban(event.target.value)}
            onBlur={() => {
              if (iban.trim()) ibanCheck.mutate(iban.trim());
            }}
            {...(ibanCheck.data && !ibanCheck.data.valid
              ? { error: ibanCheck.data.message ?? 'شبا معتبر نیست' }
              : {})}
            hint={
              ibanCheck.data?.valid
                ? `${ibanCheck.data.bankTitle ?? 'بانک ناشناخته'} — ${ibanCheck.data.notice ?? ''}`
                : 'IR و ۲۴ رقم'
            }
          />
        </div>

        {message ? (
          <p
            role="status"
            className={
              message === 'فروشنده ثبت شد'
                ? 'md:col-span-2 rounded-md bg-success/10 p-3 text-sm text-success'
                : 'md:col-span-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive'
            }
          >
            {message}
          </p>
        ) : null}

        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            ثبت فروشنده
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </section>
  );
}
