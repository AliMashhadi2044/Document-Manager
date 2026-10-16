import {
  calculateInvoice,
  qtyFromString,
  type LineInput,
  type Money,
  type Qty,
  type TaxMode,
} from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { MoneyInput } from '../../shared/ui/money-input';
import { Select } from '../../shared/ui/select';
import { formatMoney, toPersianDigits } from '../../shared/format/money';
import { TaxFields, type TaxDraft } from './tax-fields';
import { safePreview, type RoundingPolicyRef } from './invoice-preview';

export interface ItemDraft {
  readonly key: string;
  readonly description: string;
  readonly productCode: string;
  readonly quantity: string;
  readonly unitId: string;
  readonly unitPrice: string;
  readonly discountAmount: string;
  /** مالیات **همین ردیف** — در سیاست گرد کردن سطح ردیف، مرجع همین است. */
  readonly tax: TaxDraft;
}

export interface ItemsDraft {
  /** مالیات سطح فاکتور — در سیاست گرد کردن سطح فاکتور، مرجع همین است. */
  readonly invoiceTax: TaxDraft;
  readonly items: readonly ItemDraft[];
}

export function emptyItemsDraft(defaultRateBp: number | null): ItemsDraft {
  const rateBp = defaultRateBp ?? 1000;
  return {
    invoiceTax: { mode: 'PERCENT', rateBp, amount: '' },
    items: [newItem(rateBp)],
  };
}

function newItem(rateBp: number): ItemDraft {
  return {
    key: crypto.randomUUID(),
    description: '',
    productCode: '',
    quantity: '1',
    unitId: '',
    unitPrice: '',
    discountAmount: '0',
    tax: { mode: 'PERCENT', rateBp, amount: '' },
  };
}

/**
 * ردیف‌های کالا و خدمت — فاکتور عادی و سامانه ستاد.
 *
 * **جای ورود مالیات به سیاست گرد کردن قفل‌شده روی سند بستگی دارد** و این یک انتخاب
 * ظاهری نیست؛ موتور محاسبه این‌طور کار می‌کند (ADR-0012):
 *
 *  - سیاست «سطح ردیف»: مالیات هر ردیف مستقل محاسبه و گرد می‌شود، و جمع فاکتور
 *    مجموع ردیف‌هاست. پس مالیات باید **روی ردیف** وارد شود؛ یک مقدار سطح فاکتور
 *    اینجا بی‌اثر می‌ماند و اگر فرم آن را می‌پرسید، مبلغ کاربر خاموشانه نادیده
 *    گرفته می‌شد.
 *  - سیاست «سطح فاکتور»: مالیات یک‌بار روی جمع خالص حساب و بین ردیف‌ها تخصیص
 *    می‌شود. پس مالیات **روی فاکتور** وارد می‌شود و ردیف‌ها سهم می‌گیرند.
 */
export function ItemsFields({
  draft,
  onChange,
  units,
  policy,
}: {
  draft: ItemsDraft;
  onChange: (next: ItemsDraft) => void;
  units: ReadonlyArray<{ id: string; title: string }>;
  policy: RoundingPolicyRef;
}): JSX.Element {
  const perLineTax = policy.scope === 'LINE';
  const preview = safePreview(() => computePreview(draft, policy));

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h4 className="text-sm font-medium">ردیف‌های فاکتور</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {perLineTax
                ? 'سیاست این سند: گرد کردن در سطح ردیف — مالیات هر ردیف جداگانه وارد می‌شود.'
                : 'سیاست این سند: گرد کردن در سطح فاکتور — مالیات یک‌بار برای کل فاکتور وارد می‌شود.'}
            </p>
          </div>
          <div className="flex gap-2">
            {perLineTax && draft.items.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...draft,
                    items: draft.items.map((item) => ({
                      ...item,
                      tax: draft.items[0]?.tax ?? item.tax,
                    })),
                  })
                }
              >
                مالیات ردیف اول برای همه
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                onChange({
                  ...draft,
                  items: [...draft.items, newItem(draft.invoiceTax.rateBp ?? 1000)],
                })
              }
            >
              افزودن ردیف
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {draft.items.map((item, index) => (
            <div key={item.key} className="space-y-3 p-4">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-4">
                  <Input
                    label={`شرح ردیف ${toPersianDigits(String(index + 1))}`}
                    required
                    value={item.description}
                    onChange={(event) =>
                      update(draft, onChange, index, { description: event.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="کد کالا"
                    value={item.productCode}
                    onChange={(event) =>
                      update(draft, onChange, index, { productCode: event.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-1">
                  <Input
                    label="تعداد"
                    required
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) =>
                      update(draft, onChange, index, { quantity: event.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Select
                    label="واحد"
                    value={item.unitId}
                    onChange={(event) =>
                      update(draft, onChange, index, { unitId: event.target.value })
                    }
                    options={units.map((unit) => ({ value: unit.id, label: unit.title }))}
                    placeholder="—"
                  />
                </div>
                <div className="md:col-span-2">
                  <MoneyInput
                    label="مبلغ واحد"
                    required
                    value={item.unitPrice}
                    onChange={(unitPrice) => update(draft, onChange, index, { unitPrice })}
                  />
                </div>
                <div className="flex items-end md:col-span-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={draft.items.length === 1}
                    onClick={() =>
                      onChange({
                        ...draft,
                        items: draft.items.filter((_, position) => position !== index),
                      })
                    }
                  >
                    حذف
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <MoneyInput
                    label="تخفیف ردیف"
                    value={item.discountAmount}
                    onChange={(discountAmount) => update(draft, onChange, index, { discountAmount })}
                  />
                </div>
                {perLineTax ? (
                  <div className="md:col-span-6">
                    <TaxFields
                      label="مالیات این ردیف"
                      draft={item.tax}
                      onChange={(tax) => update(draft, onChange, index, { tax })}
                    />
                  </div>
                ) : null}
                <div className="flex items-end text-xs text-muted-foreground md:col-span-3">
                  {preview?.lines[index]
                    ? `خالص ${formatMoney(preview.lines[index]?.net.toString() ?? '0')} · مالیات ${formatMoney(
                        preview.lines[index]?.tax.toString() ?? '0',
                        { withUnit: false },
                      )}`
                    : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {perLineTax ? null : (
        <TaxFields
          label="مالیات کل فاکتور"
          draft={draft.invoiceTax}
          onChange={(invoiceTax) => onChange({ ...draft, invoiceTax })}
        />
      )}

      <dl className="grid gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm sm:grid-cols-4">
        <Preview label="مبلغ کالا" value={preview?.totals.gross} />
        <Preview label="تخفیف" value={preview?.totals.discount} />
        <Preview label="مالیات و عوارض" value={preview?.totals.tax} />
        <Preview label="جمع" value={preview?.totals.total} strong />
      </dl>
    </div>
  );
}

function computePreview(draft: ItemsDraft, policy: RoundingPolicyRef) {
  const lines: LineInput[] = draft.items.map((item) => {
    // در سیاست سطح فاکتور، مالیات ردیف بی‌معناست و موتور هم آن را صفر می‌گیرد.
    const tax = policy.scope === 'LINE' ? item.tax : { mode: 'AMOUNT' as TaxMode, rateBp: null, amount: '0' };
    return {
      quantity: qtyFromString(item.quantity) as Qty,
      unitPrice: BigInt(item.unitPrice || '0') as Money,
      discount: BigInt(item.discountAmount || '0') as Money,
      taxMode: tax.mode,
      taxRateBp: tax.mode === 'PERCENT' ? tax.rateBp : null,
      taxAmount: tax.mode === 'AMOUNT' ? (BigInt(tax.amount || '0') as Money) : null,
    };
  });

  return calculateInvoice(lines, policy, {
    mode: draft.invoiceTax.mode,
    rateBp: draft.invoiceTax.mode === 'PERCENT' ? draft.invoiceTax.rateBp : null,
    amount:
      draft.invoiceTax.mode === 'AMOUNT'
        ? (BigInt(draft.invoiceTax.amount || '0') as Money)
        : null,
  });
}

function update(
  draft: ItemsDraft,
  onChange: (next: ItemsDraft) => void,
  index: number,
  patch: Partial<ItemDraft>,
): void {
  onChange({
    ...draft,
    items: draft.items.map((item, position) => (position === index ? { ...item, ...patch } : item)),
  });
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

export interface ItemPayload {
  readonly rowNo: number;
  readonly description: string;
  readonly productCode: string | null;
  readonly quantity: string;
  readonly unitId: string | null;
  readonly unitPrice: string;
  readonly discountAmount: string;
  readonly taxMode: TaxMode;
  readonly taxRateBp: number | null;
  readonly taxAmount: string | null;
}

/**
 * ردیف‌های فرم به ساختار ورودی API.
 *
 * در سیاست سطح ردیف، مالیات هر ردیف همان است که کاربر وارد کرده. در سیاست سطح
 * فاکتور، ردیف‌ها مالیات صفر می‌گیرند و سرور سهمشان را از مالیات فاکتور تخصیص
 * می‌دهد — همان کاری که موتور محاسبه در هر دو سمت انجام می‌دهد.
 */
export function itemsToPayload(draft: ItemsDraft, policy: RoundingPolicyRef): ItemPayload[] {
  return draft.items.map((item, index) => {
    const tax = policy.scope === 'LINE' ? item.tax : null;
    return {
      rowNo: index + 1,
      description: item.description.trim(),
      productCode: item.productCode.trim() || null,
      quantity: item.quantity.trim(),
      unitId: item.unitId || null,
      unitPrice: item.unitPrice || '0',
      discountAmount: item.discountAmount || '0',
      taxMode: tax?.mode ?? 'AMOUNT',
      taxRateBp: tax?.mode === 'PERCENT' ? tax.rateBp : null,
      taxAmount: tax === null ? '0' : tax.mode === 'AMOUNT' ? tax.amount || '0' : null,
    };
  });
}

/**
 * مالیات سطح فاکتور که همراه ردیف‌ها فرستاده می‌شود.
 *
 * در سیاست سطح ردیف، این مقدار فقط **برچسب** فاکتور است: مبلغ ذخیره‌شده از بازمحاسبه
 * ردیف‌ها می‌آید و موتور این مقدار را نادیده می‌گیرد. پس وقتی نرخ ردیف‌ها یکسان است
 * همان نرخ برچسب می‌شود و در غیر این صورت حالت «مبلغ» با جمع مالیات ردیف‌ها.
 */
export function invoiceTaxToPayload(
  draft: ItemsDraft,
  policy: RoundingPolicyRef,
): { taxMode: TaxMode; taxRateBp: number | null; taxAmount: string | null } {
  if (policy.scope === 'INVOICE') {
    return {
      taxMode: draft.invoiceTax.mode,
      taxRateBp: draft.invoiceTax.mode === 'PERCENT' ? draft.invoiceTax.rateBp : null,
      taxAmount: draft.invoiceTax.mode === 'AMOUNT' ? draft.invoiceTax.amount || '0' : null,
    };
  }

  const first = draft.items[0]?.tax;
  const uniformPercent =
    first?.mode === 'PERCENT' &&
    draft.items.every((item) => item.tax.mode === 'PERCENT' && item.tax.rateBp === first.rateBp);

  if (uniformPercent && first) {
    return { taxMode: 'PERCENT', taxRateBp: first.rateBp, taxAmount: null };
  }

  const preview = safePreview(() => computePreview(draft, policy));
  return {
    taxMode: 'AMOUNT',
    taxRateBp: null,
    taxAmount: preview ? preview.totals.tax.toString() : '0',
  };
}
