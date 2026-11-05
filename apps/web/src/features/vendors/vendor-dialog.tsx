import { useState, type FormEvent } from 'react';
import { PERSON_TYPE_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { nationalIdIssue } from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { LABEL_CLASS } from '../../shared/ui/field';
import { formatServerMessage } from '../../shared/format/money';
import { useCreateVendor, useUpdateVendor, type VendorInput, type VendorRow } from './vendors.api';

/**
 * فرم ایجاد و اصلاح فروشنده، در یک گفت‌وگو.
 *
 * همه فیلدها رشته‌اند و خالی هم فرستاده می‌شوند: سرور رشته خالی را به `null` تبدیل
 * می‌کند، پس کاربر می‌تواند یک مقدار ثبت‌شده را **پاک** کند. اگر فیلدهای خالی را
 * حذف می‌کردیم، پاک کردن تلفن یا کدپستی از رابط ممکن نبود.
 */
export function VendorDialog({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: VendorRow | null;
  onClose: () => void;
  onSaved: (vendor: VendorRow, message: string) => void;
}): JSX.Element {
  const create = useCreateVendor();
  const update = useUpdateVendor();

  const [form, setForm] = useState({
    personType: vendor?.personType ?? ('LEGAL' as 'NATURAL' | 'LEGAL'),
    name: vendor?.name ?? '',
    representativeName: vendor?.representativeName ?? '',
    economicCode: vendor?.economicCode ?? '',
    registrationNumber: vendor?.registrationNumber ?? '',
    nationalId: vendor?.nationalId ?? '',
    postalCode: vendor?.postalCode ?? '',
    phone: vendor?.phone ?? '',
    fax: vendor?.fax ?? '',
    addressLine: vendor?.addressLine ?? '',
    notes: vendor?.notes ?? '',
    isActive: vendor?.isActive ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  /*
    شخص حقوقی: شمارهٔ اقتصادی **یا** کد/شناسهٔ ملی.

    در عمل بعضی فروشنده‌های حقوقی شمارهٔ اقتصادی ندارند و آنچه روی فاکتورشان
    هست کد یا شناسهٔ ملی است. تا دیروز کاربر آن را در فیلد «شماره اقتصادی»
    می‌نوشت و گزارش مالیات هم آن را چهارتا‌چهارتا جدا می‌کرد — شکلی که برای کد
    ملی غلط است.

    حالت اولیه از خودِ داده خوانده می‌شود: فروشنده‌ای که شمارهٔ اقتصادی دارد،
    همان را نشان می‌دهد.
  */
  const [identifierMode, setIdentifierMode] = useState<'ECONOMIC' | 'NATIONAL'>(() =>
    (vendor?.economicCode ?? '') === '' && (vendor?.nationalId ?? '') !== ''
      ? 'NATIONAL'
      : 'ECONOMIC',
  );

  const legal = form.personType === 'LEGAL';
  const identifierValue = identifierMode === 'ECONOMIC' ? form.economicCode : form.nationalId;
  const identifierIssue =
    legal && identifierMode === 'NATIONAL' ? nationalIdIssue(form.nationalId) : null;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    if (identifierIssue !== null) {
      setError(identifierIssue);
      return;
    }

    const payload: VendorInput = {
      ...form,
      name: form.name.trim(),
      // نماینده فقط برای شخص حقوقی معنا دارد؛ سرور هم برای حقیقی ردش می‌کند.
      representativeName: form.personType === 'LEGAL' ? form.representativeName : '',
    };

    const action = vendor
      ? update.mutateAsync({ id: vendor.id, ...payload })
      : create.mutateAsync(payload);

    void action.then(
      (saved) => onSaved(saved, vendor ? 'فروشنده اصلاح شد.' : 'فروشنده ثبت شد.'),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <Modal title={vendor ? 'اصلاح فروشنده' : 'فروشنده جدید'} onClose={onClose}>
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
            label={form.personType === 'LEGAL' ? 'عنوان شرکت' : 'نام شخص'}
            required
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </div>

        {/* فیلد نماینده فقط برای شخص حقوقی نمایش داده می‌شود (§۱۱.۱). */}
        {form.personType === 'LEGAL' ? (
          <div className="md:col-span-2">
            <Input
              label="نام نماینده"
              value={form.representativeName}
              onChange={(event) => set('representativeName', event.target.value)}
              hint="در ستون «نام فروشنده» گزارش مالیات می‌نشیند."
            />
          </div>
        ) : null}

        {legal ? (
          <div className="md:col-span-2">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className={LABEL_CLASS}>شناسهٔ فروشنده</span>
              {/*
                کلید دوحالته، مثل «٪ / ریال» در مالیات: یک فیلد، با دو معنا.
                `aria-pressed` وضعیت را برای صفحه‌خوان هم می‌گوید.
              */}
              <div className="flex overflow-hidden rounded-lg border border-border">
                {(
                  [
                    ['ECONOMIC', 'شماره اقتصادی'],
                    ['NATIONAL', 'کد / شناسهٔ ملی'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={identifierMode === mode}
                    onClick={() => {
                      // فقط یکی از دو ستون پر می‌ماند؛ وگرنه گزارش نمی‌داند کدام را نشان دهد.
                      setIdentifierMode(mode);
                      setForm((previous) => ({
                        ...previous,
                        economicCode: mode === 'ECONOMIC' ? previous.economicCode : '',
                        nationalId: mode === 'NATIONAL' ? previous.nationalId : '',
                      }));
                    }}
                    className={
                      identifierMode === mode
                        ? 'bg-primary px-3 py-1.5 text-xs text-primary-foreground'
                        : 'px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              aria-label={identifierMode === 'ECONOMIC' ? 'شماره اقتصادی' : 'کد یا شناسهٔ ملی'}
              dir="ltr"
              inputMode="numeric"
              value={identifierValue}
              error={identifierIssue ?? undefined}
              onChange={(event) =>
                set(
                  identifierMode === 'ECONOMIC' ? 'economicCode' : 'nationalId',
                  event.target.value,
                )
              }
              hint={
                identifierMode === 'ECONOMIC'
                  ? 'در گزارش مالیات چهارتا‌چهارتا جدا می‌شود؛ برای جلوگیری از ثبت تکراری هم استفاده می‌شود.'
                  : 'کد ملی ده رقم، شناسهٔ ملی یازده رقم. در گزارش مالیات بدون جداکننده می‌آید.'
              }
            />
          </div>
        ) : (
          <>
            <Input
              label="شماره اقتصادی"
              dir="ltr"
              value={form.economicCode}
              onChange={(event) => set('economicCode', event.target.value)}
              hint="برای جلوگیری از ثبت تکراری استفاده می‌شود."
            />

            <Input
              label="کد ملی"
              dir="ltr"
              value={form.nationalId}
              onChange={(event) => set('nationalId', event.target.value)}
            />
          </>
        )}

        <Input
          label="شماره ثبت"
          dir="ltr"
          value={form.registrationNumber}
          onChange={(event) => set('registrationNumber', event.target.value)}
        />

        <Input
          label="کد پستی"
          dir="ltr"
          inputMode="numeric"
          value={form.postalCode}
          onChange={(event) => set('postalCode', event.target.value)}
          hint="فقط رقم."
        />

        <Input
          label="تلفن"
          dir="ltr"
          value={form.phone}
          onChange={(event) => set('phone', event.target.value)}
        />

        <Input
          label="نمابر"
          dir="ltr"
          value={form.fax}
          onChange={(event) => set('fax', event.target.value)}
        />

        <div className="md:col-span-2">
          <Input
            label="نشانی"
            value={form.addressLine}
            onChange={(event) => set('addressLine', event.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <Input
            label="یادداشت"
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            hint="داخلی — روی سند و گزارش چاپ نمی‌شود."
          />
        </div>

        <div className="flex items-center md:col-span-2">
          <Toggle
            checked={form.isActive}
            onChange={(checked) => set('isActive', checked)}
            label="فعال — در فهرست انتخاب فروشنده فاکتور دیده می‌شود"
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="md:col-span-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="md:col-span-2 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="submit" loading={busy} disabled={!form.name.trim()}>
            {vendor ? 'ثبت اصلاح' : 'ثبت فروشنده'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>

          {vendor ? (
            <p className="ms-auto self-center text-xs text-muted-foreground">
              اصلاح اینجا فاکتورهای گذشته را تغییر نمی‌دهد.
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
