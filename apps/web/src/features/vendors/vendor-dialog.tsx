import { useState, type FormEvent } from 'react';
import { PERSON_TYPE_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { ApiError } from '../../shared/api/client';
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

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

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

        <Input
          label="شماره اقتصادی"
          dir="ltr"
          value={form.economicCode}
          onChange={(event) => set('economicCode', event.target.value)}
          hint="برای جلوگیری از ثبت تکراری استفاده می‌شود."
        />

        <Input
          label={form.personType === 'LEGAL' ? 'شناسه ملی' : 'کد ملی'}
          dir="ltr"
          value={form.nationalId}
          onChange={(event) => set('nationalId', event.target.value)}
        />

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
