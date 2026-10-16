import { useState } from 'react';
import { calculateSingleAmountInvoice, type Money } from '@dm/shared';

import { MoneyInput } from '../../shared/ui/money-input';
import { Select } from '../../shared/ui/select';
import { SearchableSelect } from '../../shared/ui/searchable-select';
import { formatMoney } from '../../shared/format/money';
import { useSchoolSearch } from './invoices.api';
import { TaxFields, type TaxDraft } from './tax-fields';
import { safePreview, type RoundingPolicyRef } from './invoice-preview';

export interface UtilityDraft {
  readonly schoolId: string;
  /** ناحیه فقط برای **نمایش** است؛ به سرور فرستاده نمی‌شود و سرور خودش مشتقش می‌کند. */
  readonly districtTitle: string;
  readonly utilityTypeId: string;
  readonly baseAmount: string;
  readonly discountAmount: string;
  readonly tax: TaxDraft;
}

export const EMPTY_UTILITY: UtilityDraft = {
  schoolId: '',
  districtTitle: '',
  utilityTypeId: '',
  baseAmount: '',
  discountAmount: '0',
  tax: { mode: 'PERCENT', rateBp: 1000, amount: '' },
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
}: {
  draft: UtilityDraft;
  onChange: (next: UtilityDraft) => void;
  utilityTypes: ReadonlyArray<{ id: string; title: string }>;
  policy: RoundingPolicyRef;
}): JSX.Element {
  const [schoolSearch, setSchoolSearch] = useState('');
  const schools = useSchoolSearch(schoolSearch);

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
        <SearchableSelect
          label="مدرسه"
          required
          search={schoolSearch}
          onSearchChange={setSchoolSearch}
          loading={schools.isFetching}
          total={schools.data?.total}
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
          hint="نام مدرسه را تایپ کنید؛ جست‌وجو روی سرور انجام می‌شود."
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
          onChange={(event) => onChange({ ...draft, utilityTypeId: event.target.value })}
          options={utilityTypes.map((type) => ({ value: type.id, label: type.title }))}
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
      <dd className={strong ? 'mt-0.5 font-bold tabular-nums' : 'mt-0.5 tabular-nums'}>
        {value === undefined ? '—' : formatMoney(value.toString(), { withUnit: false })}
      </dd>
    </div>
  );
}
