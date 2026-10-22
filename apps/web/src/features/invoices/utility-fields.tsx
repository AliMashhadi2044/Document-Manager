import { useState } from 'react';
import { calculateSingleAmountInvoice, type Money } from '@dm/shared';

import { MoneyInput } from '../../shared/ui/money-input';
import { Select } from '../../shared/ui/select';
import { formatMoney, toPersianDigits } from '../../shared/format/money';
import { Icon } from '../../shared/ui/icon';
import { useSchoolSearch, useUtilityDuplicate, type UtilityDuplicate } from './invoices.api';
import { TaxFields, type TaxDraft } from './tax-fields';
import { SchoolDialog } from '../base-data/school-dialog';
import { LookupQuickDialog } from '../base-data/lookup-quick-dialog';
import { safePreview, type RoundingPolicyRef } from './invoice-preview';

export interface UtilityDraft {
  readonly schoolId: string;
  /** ناحیه فقط برای **نمایش** است؛ به سرور فرستاده نمی‌شود و سرور خودش مشتقش می‌کند. */
  readonly districtTitle: string;
  readonly utilityTypeId: string;
  readonly baseAmount: string;
  readonly discountAmount: string;
  readonly tax: TaxDraft;
  /** تأیید صریح کاربر برای ثبت با وجود هشدار پرداخت تکراری. */
  readonly acknowledgeDuplicate: boolean;
}

export const EMPTY_UTILITY: UtilityDraft = {
  schoolId: '',
  districtTitle: '',
  utilityTypeId: '',
  baseAmount: '',
  discountAmount: '0',
  tax: { mode: 'PERCENT', rateBp: 1000, amount: '' },
  acknowledgeDuplicate: false,
};

/**
 * فرم فاکتور انشعابات.
 *
 * «ناحیه خودکار» اینجا یعنی: کاربر مدرسه را انتخاب می‌کند و ناحیه **خوانده** می‌شود،
 * نه انتخاب. فیلد ناحیه ویرایش‌پذیر نیست و مقدارش هم به سرور نمی‌رود؛ سرور ناحیه را
 * از رکورد مدرسه می‌خواند. اگر فرستاده می‌شد، کلاینت می‌توانست مدرسه را به ناحیه
 * اشتباه بچسباند.
 */
export function UtilityFields({
  draft,
  onChange,
  utilityTypes,
  policy,
  documentId,
}: {
  draft: UtilityDraft;
  onChange: (next: UtilityDraft) => void;
  utilityTypes: ReadonlyArray<{ id: string; title: string }>;
  policy: RoundingPolicyRef;
  /** برای بررسی پرداخت تکراری؛ سال مالی از خودِ سند خوانده می‌شود. */
  documentId: string;
}): JSX.Element {
  const [schoolSearch, setSchoolSearch] = useState('');
  const schools = useSchoolSearch(schoolSearch);

  /** گفت‌وگوی ساخت سریع: مدرسه یا نوع انشعاب. */
  const [quick, setQuick] = useState<'school' | 'utility-type' | null>(null);

  const duplicateCheck = useUtilityDuplicate(documentId, draft.schoolId, draft.utilityTypeId);
  const duplicate = duplicateCheck.data?.duplicate ?? null;

  const preview = safePreview(() =>
    calculateSingleAmountInvoice(
      {
        baseAmount: BigInt(draft.baseAmount || '0') as Money,
        discount: BigInt(draft.discountAmount || '0') as Money,
        taxMode: draft.tax.mode,
        taxRateBp: draft.tax.mode === 'PERCENT' ? draft.tax.rateBp : null,
        taxAmount: draft.tax.mode === 'AMOUNT' ? (BigInt(draft.tax.amount || '0') as Money) : null,
      },
      policy,
    ),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="مدرسه"
          required
          prefsKey="school"
          remoteSearch={{
            search: schoolSearch,
            onSearchChange: setSchoolSearch,
            loading: schools.isFetching,
            total: schools.data?.total,
          }}
          value={draft.schoolId}
          options={(schools.data?.items ?? []).map((school) => ({
            value: school.id,
            label: school.title,
            description: `ناحیه ${school.district.title}`,
          }))}
          onChange={(schoolId) => {
            const school = schools.data?.items.find((item) => item.id === schoolId);
            onChange({
              ...draft,
              schoolId,
              districtTitle: school?.district.title ?? '',
            });
          }}
          onCreate={() => setQuick('school')}
          createLabel="افزودن مدرسه"
          hint="جست‌وجو روی سرور انجام می‌شود؛ مدارس پرتکرار را پین کنید."
        />

        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-foreground">ناحیه</span>
          <p
            className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm"
            aria-live="polite"
          >
            {draft.districtTitle || 'با انتخاب مدرسه پر می‌شود'}
          </p>
          <p className="text-xs text-muted-foreground">
            ناحیه از اطلاعات مدرسه خوانده می‌شود و قابل تغییر نیست.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Select
          label="نوع انشعاب"
          required
          value={draft.utilityTypeId}
          onChange={(nextValue) => onChange({ ...draft, utilityTypeId: nextValue })}
          options={utilityTypes.map((type) => ({ value: type.id, label: type.title }))}
          onCreate={() => setQuick('utility-type')}
          createLabel="افزودن نوع انشعاب"
        />

        <MoneyInput
          label="مبلغ"
          required
          value={draft.baseAmount}
          onChange={(baseAmount) => onChange({ ...draft, baseAmount })}
        />

        <MoneyInput
          label="تخفیف"
          value={draft.discountAmount}
          onChange={(discountAmount) => onChange({ ...draft, discountAmount })}
          hint="اختیاری"
        />
      </div>

      {duplicate ? (
        <DuplicateWarning
          duplicate={duplicate}
          acknowledged={draft.acknowledgeDuplicate}
          onAcknowledge={(acknowledgeDuplicate) => onChange({ ...draft, acknowledgeDuplicate })}
        />
      ) : null}

      {quick === 'school' ? (
        <SchoolDialog
          school={null}
          onClose={() => setQuick(null)}
          onSaved={(created) => {
            /*
              مدرسهٔ تازه بی‌درنگ انتخاب می‌شود و ناحیه‌اش هم از همان رکورد می‌آید —
              نه از فهرستی که شاید هنوز بازخوانی نشده باشد.
            */
            setSchoolSearch(created.title);
            onChange({
              ...draft,
              schoolId: created.id,
              districtTitle: created.district.title,
            });
            setQuick(null);
          }}
        />
      ) : null}

      {quick === 'utility-type' ? (
        <LookupQuickDialog
          resource="utility-types"
          titleFa="نوع انشعاب"
          onClose={() => setQuick(null)}
          onCreated={(created) => {
            onChange({ ...draft, utilityTypeId: created.id });
            setQuick(null);
          }}
        />
      ) : null}

      <TaxFields
        draft={draft.tax}
        onChange={(tax) => onChange({ ...draft, tax })}
        label="مالیات و عوارض"
      />

      <dl className="grid gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm sm:grid-cols-4">
        <Preview label="خالص" value={preview?.net} />
        <Preview label="مالیات و عوارض" value={preview?.tax} />
        <Preview label="جمع" value={preview?.total} strong />
        <div className="text-xs text-muted-foreground sm:col-span-4">
          پیش‌نمایش با همان توابع محاسبه سرور ساخته می‌شود؛ مقدار قطعی پس از ثبت از سرور می‌آید.
        </div>
      </dl>
    </div>
  );
}

function Preview({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: bigint | undefined;
  strong?: boolean;
}): JSX.Element {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? 'mt-0.5 font-bold money' : 'mt-0.5 money'}>
        {value === undefined ? '—' : formatMoney(value.toString(), { withUnit: false })}
      </dd>
    </div>
  );
}

/**
 * هشدار پرداخت تکراری — کامل، و نه یک خط «تکراری است».
 *
 * چرا این‌همه جزئیات: کاربر باید **بدون خارج شدن از فرم** بتواند تصمیم بگیرد. اگر
 * فقط بگوییم «قبلاً پرداخت شده»، تنها کار ممکن رها کردن سند و گشتن در بایگانی است —
 * و همان چیزی است که این هشدار قرار بود جلویش را بگیرد.
 *
 * تأیید، یک چک‌باکس صریح است و نه دکمهٔ «ادامه»: کنارش نوشته شده چه چیزی تأیید
 * می‌شود، و همین تأیید در رد حسابرسی ثبت می‌شود.
 */
function DuplicateWarning({
  duplicate,
  acknowledged,
  onAcknowledge,
}: {
  duplicate: UtilityDuplicate;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}): JSX.Element {
  const rows: ReadonlyArray<[string, string | null]> = [
    ['سند', duplicate.documentTitle],
    ['شماره سند', duplicate.documentNumber],
    ['وضعیت سند', DOCUMENT_STATUS_LABELS[duplicate.documentStatus] ?? duplicate.documentStatus],
    ['تاریخ صورتحساب', duplicate.invoiceDateJalali],
    ['شماره صورتحساب', duplicate.invoiceNumber],
    ['مبلغ', `${formatMoney(duplicate.totalAmount, { withUnit: false })} ریال`],
    ['روش پرداخت', duplicate.paymentMethodTitle],
    ['شناسهٔ قبض', duplicate.billIdentifier],
    ['شناسهٔ پرداخت', duplicate.paymentIdentifier],
    ['ثبت‌کننده', duplicate.createdByName],
  ];

  return (
    <section
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
    >
      <div className="flex items-start gap-2">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-semibold text-destructive">
            «{duplicate.schoolTitle}» پیش از این برای «{duplicate.utilityTypeTitle}» در سال مالی{' '}
            {toPersianDigits(String(duplicate.fiscalYear))} پرداخت شده است.
          </p>

          <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {rows
              .filter((row): row is [string, string] => row[1] !== null && row[1] !== '')
              .map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                  <dd className="min-w-0 truncate font-medium" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
          </dl>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-card/60 p-2.5 text-xs">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.target.checked)}
              className="mt-0.5 size-4 rounded border-input accent-[var(--color-destructive)]"
            />
            <span>
              این پرداخت تکراری نیست (مثلاً دورهٔ بعد یا کنتور دیگر)؛ با مسئولیت من ثبت شود.
              <span className="block text-muted-foreground">
                این تأیید با نام شما در رد حسابرسی ثبت می‌شود.
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}

/** برچسب وضعیت سند — همان عنوان‌هایی که در فهرست اسناد دیده می‌شود. */
const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  FINALIZED: 'ثبت‌شده',
  PENDING_ARCHIVE: 'در انتظار بایگانی',
  ARCHIVED: 'بایگانی‌شده',
  NEEDS_REVISION: 'نیازمند اصلاح',
  REOPENED: 'بازگشایی‌شده',
};
