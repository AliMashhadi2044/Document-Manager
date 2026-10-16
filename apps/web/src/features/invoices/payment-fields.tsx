import type { PaymentMethodKind } from '@dm/shared';

import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { toPersianDigits } from '../../shared/format/money';
import { useVendorBankAccounts } from './invoices.api';

export interface PaymentMethodRef {
  readonly id: string;
  readonly kind: PaymentMethodKind;
  readonly titleFa: string;
  readonly requiresPaymentIdentifier: boolean;
  readonly requiresBillIdentifier: boolean;
}

export interface PaymentDraft {
  readonly paymentMethodId: string;
  readonly vendorBankAccountId: string;
  readonly paymentIdentifier: string;
  readonly billIdentifier: string;
  readonly notes: string;
}

export const EMPTY_PAYMENT: PaymentDraft = {
  paymentMethodId: '',
  vendorBankAccountId: '',
  paymentIdentifier: '',
  billIdentifier: '',
  notes: '',
};

/**
 * روش پرداخت فاکتور.
 *
 * فیلدهای نمایش‌داده‌شده از **خانواده روش پرداخت** می‌آیند (حساب ذی‌نفع، تنخواه،
 * قبض)، نه از نام آن؛ پس افزودن روش پرداخت جدید در اطلاعات پایه نیاز به کد ندارد
 * مگر خانواده‌اش جدید باشد.
 *
 * شناسه پرداخت به **فاکتور** تعلق دارد، نه به شبا (§۱۳.۱): یک شبا در چند فاکتور
 * شناسه‌های مختلف دارد.
 */
export function PaymentFields({
  draft,
  onChange,
  methods,
  vendorId,
}: {
  draft: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  methods: readonly PaymentMethodRef[];
  vendorId: string;
}): JSX.Element {
  const selected = methods.find((method) => method.id === draft.paymentMethodId);
  const accounts = useVendorBankAccounts(
    selected?.kind === 'BENEFICIARY_ACCOUNT' ? vendorId : '',
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="روش پرداخت"
          value={draft.paymentMethodId}
          onChange={(event) =>
            onChange({ ...EMPTY_PAYMENT, notes: draft.notes, paymentMethodId: event.target.value })
          }
          options={methods.map((method) => ({ value: method.id, label: method.titleFa }))}
          placeholder="ثبت نشود"
          hint="روش پیش‌فرض نوع فاکتور به‌صورت خودکار انتخاب می‌شود و قابل تغییر است."
        />

        {selected?.kind === 'BENEFICIARY_ACCOUNT' ? (
          vendorId === '' ? (
            <p className="self-end rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              برای پرداخت به حساب ذی‌نفع، ابتدا فروشنده فاکتور را انتخاب کنید.
            </p>
          ) : (
            <Select
              label="شبای ذی‌نفع"
              required
              value={draft.vendorBankAccountId}
              onChange={(event) =>
                onChange({ ...draft, vendorBankAccountId: event.target.value })
              }
              options={(accounts.data ?? []).map((account) => ({
                value: account.id,
                label: `${account.accountTitle} — ${toPersianDigits(account.iban)}`,
              }))}
              hint={
                accounts.data && accounts.data.length === 0
                  ? 'برای این فروشنده شبای فعالی ثبت نشده است.'
                  : undefined
              }
            />
          )
        ) : null}

        {selected?.kind === 'BILL' ? (
          <Input
            label="شناسه قبض"
            required={selected.requiresBillIdentifier}
            value={draft.billIdentifier}
            onChange={(event) => onChange({ ...draft, billIdentifier: event.target.value })}
          />
        ) : null}

        {selected ? (
          <Input
            label="شناسه پرداخت"
            required={selected.requiresPaymentIdentifier}
            value={draft.paymentIdentifier}
            onChange={(event) => onChange({ ...draft, paymentIdentifier: event.target.value })}
            hint="شناسه پرداخت این فاکتور است، نه شناسه ثابت شبا."
          />
        ) : null}
      </div>

      {selected?.kind === 'PETTY_CASH' ? (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          تعیین کارپرداز تنخواه‌دار پس از افزودن مدیریت کاربران در دسترس قرار می‌گیرد؛ تا آن
          زمان این فاکتور با روش «کارپرداز / تنخواه» و بدون انتخاب شخص ثبت می‌شود.
        </p>
      ) : null}

      {selected ? (
        <Input
          label="توضیحات پرداخت"
          value={draft.notes}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
        />
      ) : null}
    </div>
  );
}

/** تبدیل به ورودی API؛ نبودن روش پرداخت یعنی `null`، نه شیء خالی. */
export function paymentToPayload(draft: PaymentDraft): {
  paymentMethodId: string;
  vendorBankAccountId: string | null;
  paymentIdentifier: string | null;
  billIdentifier: string | null;
  pettyCashHolderId: string | null;
  notes: string | null;
} | null {
  if (draft.paymentMethodId === '') return null;

  return {
    paymentMethodId: draft.paymentMethodId,
    vendorBankAccountId: draft.vendorBankAccountId || null,
    paymentIdentifier: draft.paymentIdentifier.trim() || null,
    billIdentifier: draft.billIdentifier.trim() || null,
    pettyCashHolderId: null,
    notes: draft.notes.trim() || null,
  };
}
