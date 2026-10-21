import { useState, type FormEvent } from 'react';
import { formatIban, isValidIban, normalizeIban } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { Badge } from '../../shared/ui/badge';
import { Icon } from '../../shared/ui/icon';
import { Toggle } from '../../shared/ui/toggle';
import { IbanInput } from '../../shared/ui/iban-input';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import {
  useAddBankAccount,
  useUpdateBankAccount,
  useVendorDetail,
  type VendorBankAccount,
} from './vendors.api';

/**
 * شباهای یک فروشنده.
 *
 * یک فروشنده می‌تواند چند حساب داشته باشد و فاکتور باید بگوید پول به **کدام** حساب
 * رفته است؛ به همین دلیل شبا جدولی جدا دارد و نه یک فیلد روی فروشنده.
 *
 * سه قاعده‌ای که شکل این گفت‌وگو را تعیین می‌کنند:
 *
 *  - شماره شبا پس از ثبت **تغییر نمی‌کند**. فاکتورهای گذشته به همین ردیف ارجاع
 *    می‌دهند؛ جابه‌جایی شماره، تاریخچه پرداخت را بی‌صدا عوض می‌کرد. حساب اشتباه
 *    غیرفعال می‌شود و شبای درست رکورد تازه‌ای می‌گیرد.
 *  - حذفی در کار نیست، به همان دلیل. غیرفعال کردن، حساب را از فهرست فرم فاکتور
 *    بیرون می‌برد بی‌آنکه چیزی از تاریخچه کم شود.
 *  - هر فروشنده حداکثر **یک** حساب پیش‌فرض دارد؛ این را یک ایندکس یکتای جزئی در
 *    پایگاه داده تضمین می‌کند، نه این رابط.
 */
export function BankAccountsDialog({
  vendorId,
  vendorName,
  onClose,
}: {
  vendorId: string;
  vendorName: string;
  onClose: () => void;
}): JSX.Element {
  const detail = useVendorDetail(vendorId);
  const update = useUpdateBankAccount(vendorId);

  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<VendorBankAccount | null>(null);

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  const accounts = detail.data?.bankAccounts ?? [];

  return (
    <Modal title={`شباهای ${vendorName}`} onClose={onClose}>
      <div className="space-y-4">
        {message ? (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        {detail.isPending ? (
          <p className="text-sm text-muted-foreground">در حال دریافت…</p>
        ) : detail.isError ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            دریافت شباهای این فروشنده ناموفق بود.
          </p>
        ) : accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            هنوز شبایی ثبت نشده است. تا وقتی حساب فعالی نباشد، در فاکتور نمی‌توان
            «پرداخت به حساب ذی‌نفع» را ثبت کرد.
          </p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="font-mono text-sm">
                      {toPersianDigits(formatIban(normalizeIban(account.iban)))}
                    </span>
                    {account.isDefault ? (
                      <Badge tone="primary">
                        <Icon name="check" size={12} />
                        پیش‌فرض
                      </Badge>
                    ) : null}
                    {account.isActive ? null : <Badge tone="neutral">غیرفعال</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[account.bankTitle ?? 'بانک نامشخص', account.accountTitle]
                      .filter((part) => part)
                      .join(' — ')}
                  </div>
                  {account.notes ? (
                    <div className="truncate text-xs text-muted-foreground">{account.notes}</div>
                  ) : null}
                </div>

                <div className="flex items-center gap-0.5">
                  <AccountAction
                    icon="edit"
                    label={`اصلاح حساب ${account.iban}`}
                    onClick={() => setEditing(account)}
                  />
                  {!account.isDefault && account.isActive ? (
                    <AccountAction
                      icon="pin"
                      label={`${account.iban} پیش‌فرض شود`}
                      onClick={() =>
                        act(
                          update.mutateAsync({ id: account.id, isDefault: true }),
                          'شبای پیش‌فرض تغییر کرد.',
                        )
                      }
                    />
                  ) : null}
                  <AccountAction
                    icon="power"
                    label={`${account.isActive ? 'غیرفعال کردن' : 'فعال کردن'} ${account.iban}`}
                    onClick={() =>
                      act(
                        update.mutateAsync({
                          id: account.id,
                          isActive: !account.isActive,
                          // حساب غیرفعال نمی‌تواند پیش‌فرض بماند، وگرنه فرم فاکتور
                          // مقداری را انتخاب می‌کند که در فهرست گزینه‌هایش نیست.
                          ...(account.isActive ? { isDefault: false } : {}),
                        }),
                        account.isActive ? 'حساب غیرفعال شد.' : 'حساب فعال شد.',
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing ? (
          <EditAccountForm
            vendorId={vendorId}
            account={editing}
            onClose={() => setEditing(null)}
            onSaved={(text) => {
              setEditing(null);
              setMessage(text);
            }}
          />
        ) : (
          <AddAccountForm
            vendorId={vendorId}
            hasAccounts={accounts.length > 0}
            onSaved={(text) => setMessage(text)}
          />
        )}

        <div className="flex border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            بستن
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AccountAction({
  icon,
  label,
  onClick,
}: {
  icon: 'edit' | 'pin' | 'power';
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

/** افزودن شبای تازه — با بررسی لحظه‌ای شماره پیش از ثبت. */
function AddAccountForm({
  vendorId,
  hasAccounts,
  onSaved,
}: {
  vendorId: string;
  hasAccounts: boolean;
  onSaved: (message: string) => void;
}): JSX.Element {
  const add = useAddBankAccount(vendorId);

  // فقط رقم‌ها نگهداری می‌شوند؛ `IR` بخشی از ورودی نیست و هنگام ارسال افزوده می‌شود.
  const [digits, setDigits] = useState('');
  const [accountTitle, setAccountTitle] = useState('');
  // اولین حساب هر فروشنده به‌صورت پیش‌فرض، پیش‌فرض است: وگرنه فرم فاکتور حسابی
  // دارد که هیچ‌وقت خودکار انتخاب نمی‌شود.
  const [isDefault, setIsDefault] = useState(!hasAccounts);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    void add
      .mutateAsync({
        iban: `IR${digits}`,
        accountTitle: accountTitle.trim(),
        isDefault,
        isActive: true,
        notes: notes.trim(),
      })
      .then(
        () => {
          setDigits('');
          setAccountTitle('');
          setNotes('');
          setIsDefault(false);
          onSaved('شبا ثبت شد.');
        },
        (failure: unknown) =>
          setError(
            failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
          ),
      );
  };

  // شبای ناقص یا با رقم کنترلی نادرست، اصلاً فرستاده نمی‌شود؛ سرور هم مستقل
  // همین را می‌سنجد و مرجع نهایی اوست.
  const ready = digits.length === 24 && isValidIban(`IR${digits}`);

  return (
    <form className="grid gap-4 border-t border-border pt-4 md:grid-cols-2" onSubmit={submit}>
      <div className="md:col-span-2">
        <IbanInput label="شماره شبا" value={digits} onChange={setDigits} />
      </div>

      <Input
        label="عنوان حساب"
        value={accountTitle}
        onChange={(event) => setAccountTitle(event.target.value)}
        hint="مثلاً «حساب جاری شرکت» — برای تشخیص در فهرست فاکتور."
      />

      <Input
        label="یادداشت"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      <div className="flex items-center md:col-span-2">
        <Toggle
          checked={isDefault}
          onChange={setIsDefault}
          label="پیش‌فرضِ این فروشنده"
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

      <div className="md:col-span-2">
        <Button type="submit" loading={add.isPending} disabled={!ready}>
          <Icon name="plus" size={16} />
          افزودن شبا
        </Button>
      </div>
    </form>
  );
}

/** اصلاح یک حساب ثبت‌شده — همه‌چیز جز خود شماره شبا. */
function EditAccountForm({
  vendorId,
  account,
  onClose,
  onSaved,
}: {
  vendorId: string;
  account: VendorBankAccount;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const update = useUpdateBankAccount(vendorId);

  const [accountTitle, setAccountTitle] = useState(account.accountTitle ?? '');
  const [notes, setNotes] = useState(account.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    void update
      .mutateAsync({ id: account.id, accountTitle: accountTitle.trim(), notes: notes.trim() })
      .then(
        () => onSaved('حساب اصلاح شد.'),
        (failure: unknown) =>
          setError(
            failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
          ),
      );
  };

  return (
    <form className="grid gap-4 border-t border-border pt-4 md:grid-cols-2" onSubmit={submit}>
      <p className="md:col-span-2 text-xs text-muted-foreground">
        اصلاح حساب{' '}
        <span dir="ltr" className="font-mono">
          {toPersianDigits(formatIban(normalizeIban(account.iban)))}
        </span>{' '}
        — شماره شبا تغییرپذیر نیست؛ برای شماره تازه، این حساب را غیرفعال کنید و یکی
        دیگر بیفزایید.
      </p>

      <Input
        label="عنوان حساب"
        value={accountTitle}
        onChange={(event) => setAccountTitle(event.target.value)}
      />

      <Input label="یادداشت" value={notes} onChange={(event) => setNotes(event.target.value)} />

      {error ? (
        <p
          role="alert"
          className="md:col-span-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="md:col-span-2 flex gap-2">
        <Button type="submit" loading={update.isPending}>
          ثبت اصلاح
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          انصراف
        </Button>
      </div>
    </form>
  );
}
