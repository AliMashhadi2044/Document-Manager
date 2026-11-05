import { useEffect, useRef, useState } from 'react';
import { splitDifference, type PaymentMethodKind } from '@dm/shared';

import { Input } from '../../shared/ui/input';
import { MoneyInput } from '../../shared/ui/money-input';
import { Select } from '../../shared/ui/select';
import { formatMoney, toPersianDigits } from '../../shared/format/money';
import { useVendorBankAccounts } from './invoices.api';
import { BankAccountsDialog } from '../vendors/bank-accounts-dialog';
import { useActivePettyCashHolders } from '../base-data/people.api';
import { PettyCashDialog } from '../base-data/petty-cash-dialog';

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
  readonly pettyCashHolderId: string;
  readonly paymentIdentifier: string;
  readonly billIdentifier: string;
  /** نام صاحب حساب قبض؛ فقط در روش «قبض» دیده و فرستاده می‌شود. */
  readonly payeeName: string;
  /** سهم هر مقصد در پرداخت ترکیبی — رشتهٔ رقمی ریالی (ADR-0003). */
  readonly beneficiaryAmount: string;
  readonly pettyCashAmount: string;
  readonly notes: string;
}

export const EMPTY_PAYMENT: PaymentDraft = {
  paymentMethodId: '',
  vendorBankAccountId: '',
  pettyCashHolderId: '',
  paymentIdentifier: '',
  billIdentifier: '',
  payeeName: '',
  beneficiaryAmount: '',
  pettyCashAmount: '',
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
  vendorName,
  totalAmount,
}: {
  draft: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  methods: readonly PaymentMethodRef[];
  vendorId: string;
  /** برای عنوان گفت‌وگوی شباها؛ فرمِ فاکتور نام فروشنده را می‌داند. */
  vendorName?: string;
  /**
   * مبلغ کل فاکتور از پیش‌نمایش همین فرم؛ `null` یعنی هنوز قابل محاسبه نیست.
   *
   * فقط برای **کمک** است: تقسیم را کامل می‌کند و اختلاف را نشان می‌دهد. مرجع
   * نهایی سرور است و همان است که ثبت را رد می‌کند — اینجا فقط کاری می‌کند که
   * کاربر پیش از ثبت بفهمد عددش نمی‌خواند.
   */
  totalAmount?: bigint | null;
}): JSX.Element {
  const selected = methods.find((method) => method.id === draft.paymentMethodId);
  const needsBeneficiary =
    selected?.kind === 'BENEFICIARY_ACCOUNT' || selected?.kind === 'SPLIT';
  const isSplit = selected?.kind === 'SPLIT';
  const accounts = useVendorBankAccounts(needsBeneficiary ? vendorId : '');

  /*
    گفت‌وگوی شباهای همان فروشنده، از داخل فرم فاکتور.

    حالت واقعی‌ای که این را لازم کرد: فروشنده هست، ولی شبا ندارد. تا پیش از این
    کاربر باید سند نیمه‌تمام را رها می‌کرد، به «فروشندگان» می‌رفت، شبا می‌افزود و
    برمی‌گشت.
  */
  const [manageAccounts, setManageAccounts] = useState(false);

  /*
    تنخواه‌داران.

    فهرست کوتاه است و همیشه خوانده می‌شود، نه فقط وقتی روش تنخواه انتخاب شده: با
    عوض شدن روش پرداخت، یک درخواست تازه و یک لحظه «در حال بارگذاری» دیده می‌شد.
  */
  const holders = useActivePettyCashHolders();
  const [newHolder, setNewHolder] = useState(false);

  /*
    شبای ذی‌نفع: یکی که باشد، همان؛ چند تا که باشد، پیش‌فرضِ همان فروشنده.

    انتخابِ تک‌گزینه‌ای یک کلیک است که هیچ تصمیمی در آن نیست. و وقتی فروشنده چند
    شبا دارد، شبایی که در «فروشندگان» پیش‌فرض علامت خورده همان است که کارپرداز
    معمولاً می‌خواهد.

    فقط وقتی می‌نشیند که فیلد **خالی** باشد: در ویرایش، شبای ذخیره‌شده حرف آخر را
    می‌زند، حتی اگر دیگر پیش‌فرض نباشد.
  */
  const accountItems = accounts.data;
  /*
    برای هر «فروشنده + روش پرداخت»، **یک بار**.

    بدون این نشانه، پاک کردنِ عمدیِ شبا توسط کاربر همان لحظه دوباره پر می‌شد و
    کاربر با فیلدی طرف بود که حرف او را پس می‌زند.
  */
  const autoAccountFor = useRef('');

  useEffect(() => {
    const scope = `${vendorId}:${draft.paymentMethodId}`;
    if (!needsBeneficiary || !accountItems || autoAccountFor.current === scope) return;
    autoAccountFor.current = scope;
    if (draft.vendorBankAccountId !== '') return;

    const pick =
      accountItems.length === 1
        ? accountItems[0]
        : accountItems.find((account) => account.isDefault);

    if (pick) onChange({ ...draft, vendorBankAccountId: pick.id });
  }, [needsBeneficiary, accountItems, vendorId, draft, onChange]);

  /*
    تنخواه‌دار پیش‌فرض، به‌محض انتخاب روشی که تنخواه‌دار می‌خواهد.

    در عمل همیشه یک تنخواه‌دار غالب است؛ بدون این، کاربر در هر فاکتور یک انتخاب
    تکراری انجام می‌داد.
  */
  const holderItems = holders.data?.items;
  const needsHolder = selected?.kind === 'PETTY_CASH' || isSplit;
  const autoHolderFor = useRef('');

  useEffect(() => {
    if (!needsHolder || !holderItems || autoHolderFor.current === draft.paymentMethodId) return;
    autoHolderFor.current = draft.paymentMethodId;
    if (draft.pettyCashHolderId !== '') return;

    const preferred = holderItems.find((holder) => holder.isDefault);
    if (preferred) onChange({ ...draft, pettyCashHolderId: preferred.id });
  }, [needsHolder, holderItems, draft, onChange]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="روش پرداخت"
          value={draft.paymentMethodId}
          onChange={(nextValue) =>
            onChange({
              ...EMPTY_PAYMENT,
              notes: draft.notes,
              paymentMethodId: nextValue,
            })
          }
          options={methods.map((method) => ({
            value: method.id,
            label: method.titleFa,
          }))}
          required
          /*
            «ثبت نشود» حذف شد.

            این گزینه یک راه صریح بود برای ساختن فاکتوری که نمی‌شد گفت پولش به
            کجا رفت: خانهٔ «پرداخت به» در فرم ریزهزینه خالی می‌ماند و فاکتور از
            گزارش شبای ذی‌نفعان بیرون می‌افتاد. ثبت نهایی سند از قبل جلویش را
            می‌گرفت، ولی آن‌قدر دیر که کاربر باید به هر فاکتور برمی‌گشت.
          */
          hint="روش پیش‌فرض نوع فاکتور به‌صورت خودکار انتخاب می‌شود و قابل تغییر است."
        />

        {needsBeneficiary ? (
          vendorId === '' ? (
            <p className="self-end rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              برای پرداخت به حساب ذی‌نفع، ابتدا فروشنده فاکتور را انتخاب کنید.
            </p>
          ) : (
            <Select
              label="شبای ذی‌نفع"
              required
              value={draft.vendorBankAccountId}
              onChange={(nextValue) => onChange({ ...draft, vendorBankAccountId: nextValue })}
              options={(accounts.data ?? []).map((account) => ({
                value: account.id,
                // عنوان حساب اختیاری است؛ بدون این بازگشت، برچسب گزینه «null — IR…»
                // می‌شد. نام بانک همان چیزی است که کاربر حساب را با آن می‌شناسد.
                label: `${account.accountTitle ?? account.bankTitle ?? 'حساب'} — ${toPersianDigits(
                  account.iban,
                )}`,
              }))}
              onCreate={() => setManageAccounts(true)}
              createLabel="افزودن شبا برای این فروشنده"
              emptyLabel="برای این فروشنده شبای فعالی ثبت نشده است"
              hint={
                accounts.data && accounts.data.length === 0
                  ? 'شبایی ثبت نشده؛ از پایین همین فهرست اضافه کنید.'
                  : undefined
              }
            />
          )
        ) : null}

        {manageAccounts && vendorId !== '' ? (
          <BankAccountsDialog
            vendorId={vendorId}
            vendorName={vendorName ?? 'فروشنده'}
            onClose={() => setManageAccounts(false)}
          />
        ) : null}

        {/*
          تنخواه‌دار.

          نام و اطلاعات حسابش در لحظهٔ ثبت snapshot می‌شود و گزارش‌ها از همان
          می‌خوانند. فاکتورهای قدیمی بدون او ثبت شده‌اند و دست‌نخورده می‌مانند، ولی
          از این پس انتخابش لازم است.
        */}
        {needsHolder ? (
          <Select
            label={isSplit ? 'کارپرداز' : 'تنخواه‌دار'}
            /*
              ضروری است، نه اختیاری.

              نامِ تنخواه‌دار در لحظهٔ ثبت snapshot می‌شود و گزارش‌ها از همان
              می‌خوانند؛ فاکتور تنخواهی بدون تنخواه‌دار، ردیفی است که در گزارش
              پرداخت‌ها بی‌صاحب می‌ماند.
            */
            required
            value={draft.pettyCashHolderId}
            onChange={(nextValue) => onChange({ ...draft, pettyCashHolderId: nextValue })}
            placeholder="انتخاب کنید…"
            options={(holders.data?.items ?? []).map((holder) => ({
              value: holder.id,
              label: holder.fullName,
              description:
                holder.accountHolderName && holder.accountHolderName !== holder.fullName
                  ? `حساب به نام ${holder.accountHolderName}`
                  : (holder.bank?.titleFa ?? undefined),
            }))}
            onCreate={() => setNewHolder(true)}
            createLabel="افزودن تنخواه‌دار"
            emptyLabel="تنخواه‌داری ثبت نشده است"
            hint="نام و اطلاعات حسابش در همین فاکتور ذخیره می‌شود و در گزارش‌ها می‌آید."
          />
        ) : null}

        {isSplit ? (
          <SplitAmounts draft={draft} onChange={onChange} totalAmount={totalAmount ?? null} />
        ) : null}

        {selected?.kind === 'BILL' ? (
          <>
            <Input
              label="شناسه قبض"
              required={selected.requiresBillIdentifier}
              value={draft.billIdentifier}
              onChange={(event) => onChange({ ...draft, billIdentifier: event.target.value })}
            />
            {/*
              نام صاحب حساب قبض.

              قبضِ یک مدرسه به نام همان مدرسه است و نه به نام فروشندهٔ فاکتور؛ در
              گزارش شبای ذینفعان همین نام در ستون «نام صاحب حساب» می‌نشیند. در
              فاکتور انشعابات از نام مدرسه پر می‌شود و قابل ویرایش می‌ماند.
            */}
            <Input
              label="نام صاحب حساب"
              required
              maxLength={200}
              value={draft.payeeName}
              onChange={(event) => onChange({ ...draft, payeeName: event.target.value })}
              hint="در گزارش شبای ذینفعان، همین نام چاپ می‌شود."
            />
          </>
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

      {newHolder ? (
        <PettyCashDialog
          holder={null}
          onClose={() => setNewHolder(false)}
          onSaved={(created) => {
            onChange({ ...draft, pettyCashHolderId: created.id });
            setNewHolder(false);
          }}
        />
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

/**
 * سهم کارپرداز و سهم ذی‌نفع، کنار هم.
 *
 * دو تصمیم رابط اینجا نشسته‌اند:
 *
 *  ۱. **کامل کردن خودکار.** کاربر یک سهم را می‌نویسد و دیگری از مبلغ کل پر
 *     می‌شود. تقسیم یک عدد به دو، در عمل یعنی وارد کردن یک عدد؛ خواستن هر دو،
 *     خواستن یک تفریق دستی است که نتیجه‌اش فقط اشتباه تایپی است.
 *  ۲. **اختلاف، همان‌جا دیده می‌شود.** اگر جمع نخواند، خط زیر فیلدها می‌گوید چقدر
 *     کم یا زیاد است — نه اینکه ثبت رد شود و کاربر خودش دنبال اختلاف بگردد.
 */
function SplitAmounts({
  draft,
  onChange,
  totalAmount,
}: {
  draft: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  totalAmount: bigint | null;
}): JSX.Element {
  const beneficiary = draft.beneficiaryAmount === '' ? null : BigInt(draft.beneficiaryAmount);
  const pettyCash = draft.pettyCashAmount === '' ? null : BigInt(draft.pettyCashAmount);
  // همان قاعده‌ای که سرور اعمال می‌کند، از همان ماژول مشترک.
  const difference =
    totalAmount === null ? null : splitDifference(beneficiary, pettyCash, totalAmount);

  /** نوشتن یک سهم، سهم دیگر را از مبلغ کل کامل می‌کند. */
  const setPart = (part: 'beneficiaryAmount' | 'pettyCashAmount', value: string): void => {
    const other = part === 'beneficiaryAmount' ? 'pettyCashAmount' : 'beneficiaryAmount';
    const entered = value === '' ? null : BigInt(value);

    const complement =
      totalAmount === null || entered === null || entered > totalAmount
        ? draft[other]
        : (totalAmount - entered).toString();

    onChange({ ...draft, [part]: value, [other]: complement });
  };

  return (
    <div className="md:col-span-2 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">تقسیم مبلغ فاکتور</p>
        <p className="text-xs text-muted-foreground">
          {totalAmount === null
            ? 'مبلغ کل پس از کامل شدن ردیف‌های فاکتور محاسبه می‌شود.'
            : `مبلغ کل فاکتور: ${formatMoney(totalAmount.toString())}`}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MoneyInput
          label="سهم ذی‌نفع"
          required
          value={draft.beneficiaryAmount}
          onChange={(value) => setPart('beneficiaryAmount', value)}
        />
        <MoneyInput
          label="سهم کارپرداز"
          required
          value={draft.pettyCashAmount}
          onChange={(value) => setPart('pettyCashAmount', value)}
        />
      </div>

      {difference !== null && difference !== 0n ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {difference > 0n
            ? `${formatMoney(difference.toString())} از مبلغ فاکتور تقسیم نشده است.`
            : `جمع سهم‌ها ${formatMoney((-difference).toString())} بیشتر از مبلغ فاکتور است.`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * تبدیل به ورودی API؛ `null` یعنی کاربر هنوز روش پرداخت را انتخاب نکرده.
 *
 * فرم با همین `null` جلوی ارسال را می‌گیرد و پیام فارسی می‌دهد؛ سرور هم
 * مستقل از فرم همین را رد می‌کند. دو بررسی‌اند و نه یکی: پنهان کردن یا
 * غیرفعال کردن یک کنترل در مرورگر، اعتبارسنجی نیست.
 */
export function paymentToPayload(draft: PaymentDraft): {
  paymentMethodId: string;
  vendorBankAccountId: string | null;
  paymentIdentifier: string | null;
  billIdentifier: string | null;
  payeeName: string | null;
  pettyCashHolderId: string | null;
  beneficiaryAmount: string | null;
  pettyCashAmount: string | null;
  notes: string | null;
} | null {
  if (draft.paymentMethodId === '') return null;

  return {
    paymentMethodId: draft.paymentMethodId,
    vendorBankAccountId: draft.vendorBankAccountId || null,
    paymentIdentifier: draft.paymentIdentifier.trim() || null,
    billIdentifier: draft.billIdentifier.trim() || null,
    payeeName: draft.payeeName.trim() || null,
    pettyCashHolderId: draft.pettyCashHolderId || null,
    beneficiaryAmount: draft.beneficiaryAmount || null,
    pettyCashAmount: draft.pettyCashAmount || null,
    notes: draft.notes.trim() || null,
  };
}
