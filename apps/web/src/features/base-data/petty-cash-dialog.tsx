import { useState, type FormEvent } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { IbanInput } from '../../shared/ui/iban-input';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage } from '../../shared/format/money';
import {
  useCreatePettyCashHolder,
  useUpdatePettyCashHolder,
  type PettyCashHolderRow,
} from './people.api';

/**
 * ساخت و اصلاح تنخواه‌دار — هم در اطلاعات پایه و هم وسط ثبت فاکتور.
 *
 * **نام صاحب حساب جدا از نام تنخواه‌دار است**: پول ممکن است به حساب همسر یا حساب
 * واحد برود و در گزارش، آنچه باید بنشیند نام همان حساب است. خالی گذاشتنش یعنی
 * حساب به نام خود تنخواه‌دار است، و سرور همان را snapshot می‌کند.
 *
 * بانک پرسیده نمی‌شود: از خود شبا درمی‌آید (رقم‌های سوم تا پنجم کد بانک‌اند).
 */
export function PettyCashDialog({
  holder,
  onClose,
  onSaved,
}: {
  holder: PettyCashHolderRow | null;
  onClose: () => void;
  onSaved: (holder: PettyCashHolderRow, message: string) => void;
}): JSX.Element {
  const create = useCreatePettyCashHolder();
  const update = useUpdatePettyCashHolder();

  const [fullName, setFullName] = useState(holder?.fullName ?? '');
  const [positionTitle, setPositionTitle] = useState(holder?.positionTitle ?? '');
  const [nationalId, setNationalId] = useState(holder?.nationalId ?? '');
  const [phone, setPhone] = useState(holder?.phone ?? '');
  const [accountHolderName, setAccountHolderName] = useState(holder?.accountHolderName ?? '');
  // ورودی شبا فقط رقم‌ها را نگه می‌دارد؛ پیشوند `IR` بیرون از کادر ویرایش است.
  const [ibanDigits, setIbanDigits] = useState((holder?.ibanNormalized ?? '').replace(/^IR/, ''));
  const [accountNumber, setAccountNumber] = useState(holder?.accountNumber ?? '');
  const [notes, setNotes] = useState(holder?.notes ?? '');
  const [isActive, setIsActive] = useState(holder?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending;
  const ibanIncomplete = ibanDigits.length > 0 && ibanDigits.length < 24;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    const payload = {
      fullName: fullName.trim(),
      positionTitle: positionTitle.trim(),
      nationalId: nationalId.trim(),
      phone: phone.trim(),
      accountHolderName: accountHolderName.trim(),
      iban: ibanDigits ? `IR${ibanDigits}` : '',
      accountNumber: accountNumber.trim(),
      notes: notes.trim(),
      isActive,
    };

    const action = holder
      ? update.mutateAsync({ id: holder.id, ...payload })
      : create.mutateAsync(payload);

    void action.then(
      (saved) => onSaved(saved, holder ? 'تنخواه‌دار اصلاح شد.' : 'تنخواه‌دار ثبت شد.'),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <Modal title={holder ? 'اصلاح تنخواه‌دار' : 'تنخواه‌دار جدید'} onClose={onClose}>
      <form className="grid gap-x-5 gap-y-4 md:grid-cols-2" onSubmit={submit}>
        <Input
          label="نام و نام خانوادگی"
          required
          autoFocus
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />

        <Input
          label="سمت"
          value={positionTitle}
          onChange={(event) => setPositionTitle(event.target.value)}
          hint="اختیاری — مثلاً «کارپرداز»."
        />

        <Input
          label="کد ملی"
          dir="ltr"
          inputMode="numeric"
          value={nationalId}
          onChange={(event) => setNationalId(event.target.value)}
        />

        <Input
          label="تلفن"
          dir="ltr"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />

        <div className="md:col-span-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">اطلاعات حساب</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            در گزارش‌ها کنار نام تنخواه‌دار می‌نشیند؛ بانک از خود شبا تشخیص داده می‌شود.
          </p>
        </div>

        <Input
          label="نام صاحب حساب"
          value={accountHolderName}
          onChange={(event) => setAccountHolderName(event.target.value)}
          hint="خالی بگذارید اگر حساب به نام خود تنخواه‌دار است."
        />

        <Input
          label="شماره حساب"
          dir="ltr"
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value)}
          hint="اختیاری — در کنار شبا."
        />

        <div className="md:col-span-2">
          <IbanInput label="شبا" value={ibanDigits} onChange={setIbanDigits} />
        </div>

        <div className="md:col-span-2">
          <Input
            label="یادداشت"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="flex items-center md:col-span-2">
          <Toggle
            checked={isActive}
            onChange={setIsActive}
            label="فعال — در فهرست تنخواه‌داران فرم پرداخت دیده می‌شود"
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

        <div className="md:col-span-2 flex gap-2 border-t border-border pt-4">
          <Button type="submit" loading={busy} disabled={fullName.trim() === '' || ibanIncomplete}>
            {holder ? 'ثبت اصلاح' : 'ثبت تنخواه‌دار'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Modal>
  );
}
