import { useState, type FormEvent } from 'react';
import { PERSON_TYPE_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage } from '../../shared/format/money';
import { useCreateBuyer, useUpdateBuyer, type BuyerInput, type BuyerRow } from './buyers.api';

/** فرم ایجاد و اصلاح، در یک گفت‌وگو. */
export function BuyerDialog({
  buyer,
  onClose,
  onSaved,
}: {
  buyer: BuyerRow | null;
  onClose: () => void;
  onSaved: (buyer: BuyerRow, message: string) => void;
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
      (saved) => onSaved(saved, buyer ? 'مجموعه خریدار اصلاح شد.' : 'مجموعه خریدار ثبت شد.'),
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
            با تغییر در این اطلاعات ، اسناد گذشته تغییر نمی‌کنند و فقط بر اسناد تازه اثر دارد.
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
