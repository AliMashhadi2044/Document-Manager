import { useState, type FormEvent } from 'react';
import { SIGNATORY_ROLE_KEYS, SIGNATORY_ROLE_LABELS, type SignatoryRoleKey } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage } from '../../shared/format/money';
import { useCreateSignatory, useUpdateSignatory, type SignatoryRow } from './people.api';

/**
 * ساخت و اصلاح امضاکننده.
 *
 * نقش، همان کلیدی است که قالب گزارش نگه می‌دارد؛ نام و سمت در لحظهٔ تولید خروجی از
 * همین رکورد خوانده می‌شوند. پس عوض شدن مسئول کارپردازی یعنی اصلاح همین فرم، نه
 * دست زدن به قالب‌ها.
 */
export function SignatoryDialog({
  signatory,
  onClose,
  onSaved,
}: {
  signatory: SignatoryRow | null;
  onClose: () => void;
  onSaved: (signatory: SignatoryRow, message: string) => void;
}): JSX.Element {
  const create = useCreateSignatory();
  const update = useUpdateSignatory();

  const [fullName, setFullName] = useState(signatory?.fullName ?? '');
  const [positionTitle, setPositionTitle] = useState(signatory?.positionTitle ?? '');
  const [roleKey, setRoleKey] = useState<SignatoryRoleKey>(
    signatory?.roleKey ?? 'PROCUREMENT_LEAD',
  );
  const [isActive, setIsActive] = useState(signatory?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(signatory?.sortOrder ?? 0));
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    const payload = {
      fullName: fullName.trim(),
      positionTitle: positionTitle.trim(),
      roleKey,
      isActive,
      sortOrder: Number(sortOrder) || 0,
    };

    const action = signatory
      ? update.mutateAsync({ id: signatory.id, ...payload })
      : create.mutateAsync(payload);

    void action.then(
      (saved) => onSaved(saved, signatory ? 'امضاکننده اصلاح شد.' : 'امضاکننده ثبت شد.'),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <Modal title={signatory ? 'اصلاح امضاکننده' : 'امضاکنندهٔ جدید'} onClose={onClose}>
      <form className="grid gap-x-5 gap-y-4 md:grid-cols-2" onSubmit={submit}>
        <Input
          label="نام و نام خانوادگی"
          required
          autoFocus
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          hint="همان نامی که پای خروجی چاپ می‌شود."
        />

        <Input
          label="سمت"
          required
          value={positionTitle}
          onChange={(event) => setPositionTitle(event.target.value)}
          hint="زیر نام می‌نشیند — مثلاً «مسئول کارپردازی»."
        />

        <Select
          label="نقش در خروجی"
          required
          placeholder={null}
          value={roleKey}
          onChange={(next) => setRoleKey(next as SignatoryRoleKey)}
          options={SIGNATORY_ROLE_KEYS.map((key) => ({
            value: key,
            label: SIGNATORY_ROLE_LABELS[key],
          }))}
          hint="بلوک امضای قالب همین نقش را می‌گیرد، نه شخص را."
        />

        <Input
          label="ترتیب"
          inputMode="numeric"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          hint="اگر یک نقش چند نفر دارد، کوچک‌ترین ترتیب انتخاب می‌شود."
        />

        <div className="flex items-center md:col-span-2">
          <Toggle
            checked={isActive}
            onChange={setIsActive}
            label="فعال — در بلوک امضای خروجی‌ها دیده می‌شود"
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
          <Button
            type="submit"
            loading={busy}
            disabled={fullName.trim() === '' || positionTitle.trim() === ''}
          >
            {signatory ? 'ثبت اصلاح' : 'ثبت امضاکننده'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Modal>
  );
}
