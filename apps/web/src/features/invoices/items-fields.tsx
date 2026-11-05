import { useState } from 'react';
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
import { Icon } from '../../shared/ui/icon';
import { LookupQuickDialog } from '../base-data/lookup-quick-dialog';
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

/**
 * نقطهٔ شروع ردیف‌ها.
 *
 * پیش‌فرض مالیات و واحد از **تنظیمات سازمان و اطلاعات پایه** می‌آید، نه از عدد
 * ثابت در کد: سازمانی که فاکتورهایش معاف است، تا دیروز در هر ردیف ۱۰٪ را دستی
 * صفر می‌کرد.
 */
export interface ItemsDefaults {
  readonly tax: TaxDraft;
  readonly unitId: string;
}

export function invoiceTaxDefaults(
  defaults: { taxMode: TaxMode; taxRateBp: number | null; taxAmount: string },
  fiscalRateBp: number | null,
): TaxDraft {
  return {
    mode: defaults.taxMode,
    // نرخِ تنظیم‌شده، وگرنه نرخ سال مالی، وگرنه ۱۰٪ — همان ترتیبی که کاربر انتظار دارد.
    rateBp: defaults.taxRateBp ?? fiscalRateBp ?? 1000,
    amount: defaults.taxMode === 'AMOUNT' ? defaults.taxAmount : '',
  };
}

export function emptyItemsDraft(defaults: ItemsDefaults): ItemsDraft {
  return {
    invoiceTax: defaults.tax,
    items: [newItem(defaults)],
  };
}

function newItem(defaults: ItemsDefaults): ItemDraft {
  return {
    key: crypto.randomUUID(),
    description: '',
    productCode: '',
    quantity: '1',
    unitId: defaults.unitId,
    unitPrice: '',
    discountAmount: '0',
    tax: defaults.tax,
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
  defaults,
}: {
  draft: ItemsDraft;
  onChange: (next: ItemsDraft) => void;
  units: ReadonlyArray<{ id: string; title: string }>;
  policy: RoundingPolicyRef;
  /** پیش‌فرض ردیف تازه — همان که ردیف اول با آن ساخته شد. */
  defaults: ItemsDefaults;
}): JSX.Element {
  const perLineTax = policy.scope === 'LINE';
  const preview = safePreview(() => computePreview(draft, policy));

  /** واحدِ تازه برای **کدام ردیف** ساخته می‌شود؛ `null` یعنی گفت‌وگو بسته است. */
  const [unitFor, setUnitFor] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
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
                  // ردیف تازه همان پیش‌فرض را می‌گیرد، نه مالیاتِ ردیف قبلی:
                  // تغییرِ یک ردیف، تصمیم همان ردیف است.
                  items: [...draft.items, newItem(defaults)],
                })
              }
            >
              افزودن ردیف
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {draft.items.map((item, index) => {
            const line = preview?.lines[index];

            return (
              <div key={item.key} className="space-y-3 p-4 transition-colors hover:bg-muted/20">
                {/*
                  نوار سرِ ردیف: شمارهٔ ردیف و دکمهٔ حذف.

                  حذف پیش از این یک دکمهٔ برچسب‌دار **میان فیلدها** بود؛ هم جای یک فیلد
                  را می‌گرفت و هم در ردیفی که کاربر داشت مبلغ می‌زد، درست کنار دستش
                  بود. اینجا از شبکهٔ فیلدها بیرون است و به شمارهٔ ردیف چسبیده —
                  جایی که کاربر وقتی می‌رود که بخواهد خودِ ردیف را بردارد.
                */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    ردیف {toPersianDigits(String(index + 1))}
                  </span>

                  <button
                    type="button"
                    /*
                      بیرون از مسیر Tab.

                      کاربر ردیف‌ها را با Tab پر می‌کند و در پایان هر ردیف به
                      دکمهٔ حذف می‌رسید — یک ایستگاه اضافه، درست کنار کاری که
                      برگشت‌پذیر نیست. با ماوس و با صفحه‌خوان همچنان در دسترس
                      است؛ فقط در مسیر تایپِ پیاپی نمی‌نشیند.
                    */
                    tabIndex={-1}
                    disabled={draft.items.length === 1}
                    aria-label={`حذف ردیف ${toPersianDigits(String(index + 1))}`}
                    title={
                      draft.items.length === 1
                        ? 'فاکتور باید دست‌کم یک ردیف داشته باشد'
                        : `حذف ردیف ${toPersianDigits(String(index + 1))}`
                    }
                    onClick={() =>
                      onChange({
                        ...draft,
                        items: draft.items.filter((_, position) => position !== index),
                      })
                    }
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>

                {/* شناسنامهٔ کالا */}
                <div className="grid gap-x-4 gap-y-3 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <Input
                      label={`شرح ردیف ${toPersianDigits(String(index + 1))}`}
                      required
                      value={item.description}
                      onChange={(event) =>
                        update(draft, onChange, index, { description: event.target.value })
                      }
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Input
                      label="کد کالا"
                      value={item.productCode}
                      onChange={(event) =>
                        update(draft, onChange, index, { productCode: event.target.value })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
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
                      onChange={(nextValue) => update(draft, onChange, index, { unitId: nextValue })}
                      options={units.map((unit) => ({ value: unit.id, label: unit.title }))}
                      placeholder="—"
                      onCreate={() => setUnitFor(index)}
                      createLabel="افزودن واحد"
                    />
                  </div>
                </div>

                {/* پول: از مبلغ واحد تا جمع ردیف، به ترتیبِ خودِ محاسبه */}
                <div className="grid gap-x-4 gap-y-3 md:grid-cols-12">
                  <div className={perLineTax ? 'md:col-span-3' : 'md:col-span-4'}>
                    <MoneyInput
                      label="مبلغ واحد"
                      required
                      value={item.unitPrice}
                      onChange={(unitPrice) => update(draft, onChange, index, { unitPrice })}
                    />
                  </div>

                  <div className={perLineTax ? 'md:col-span-3' : 'md:col-span-4'}>
                    <MoneyInput
                      label="تخفیف ردیف"
                      value={item.discountAmount}
                      onChange={(discountAmount) =>
                        update(draft, onChange, index, { discountAmount })
                      }
                    />
                  </div>

                  {perLineTax ? (
                    <div className="md:col-span-3">
                      <TaxFields
                        label="مالیات ردیف"
                        draft={item.tax}
                        onChange={(tax) => update(draft, onChange, index, { tax })}
                      />
                    </div>
                  ) : null}

                  {/*
                    جمع ردیف هم یک ورودیِ **فقط‌خواندنی** است و نه یک خط متن:
                    هم‌تراز با بقیهٔ فیلدهای پول می‌نشیند، قابل انتخاب و کپی است، و
                    `readOnly` به صفحه‌خوان می‌گوید که این مقدار محاسبه می‌شود نه
                    این‌که کاربر پرش کند. `disabled` نیست، چون کنترل غیرفعال نه فوکوس
                    می‌گیرد و نه خوانده می‌شود.
                  */}
                  <div className={perLineTax ? 'md:col-span-3' : 'md:col-span-4'}>
                    <Input
                      label="جمع ردیف"
                      readOnly
                      tabIndex={0}
                      value={line ? formatMoney(line.total.toString(), { withUnit: false }) : '—'}
                      className="money bg-muted/40"
                      hint={
                        line
                          ? `خالص ${formatMoney(line.net.toString(), {
                              withUnit: false,
                            })} · مالیات ${formatMoney(line.tax.toString(), { withUnit: false })}`
                          : 'با پر شدن مبلغ واحد محاسبه می‌شود'
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {perLineTax ? null : (
        <TaxFields
          label="مالیات کل فاکتور"
          draft={draft.invoiceTax}
          onChange={(invoiceTax) => onChange({ ...draft, invoiceTax })}
        />
      )}

      {unitFor !== null ? (
        <LookupQuickDialog
          resource="measurement-units"
          titleFa="واحد اندازه‌گیری"
          onClose={() => setUnitFor(null)}
          onCreated={(created) => {
            update(draft, onChange, unitFor, { unitId: created.id });
            setUnitFor(null);
          }}
        />
      ) : null}

      {/* نوار جمع، چسبیده به پایین فرم: هنگام ویرایش ردیف‌ها، عددی که تغییر می‌کند
          باید جلوی چشم بماند، نه اینکه کاربر برای دیدنش پایین برود. */}
      <dl className="sticky bottom-0 z-10 grid gap-3 rounded-xl border border-border bg-card/95 p-4 text-sm shadow-[var(--shadow-soft)] backdrop-blur-sm sm:grid-cols-4">
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
    <div className={strong ? 'rounded-lg bg-primary/10 px-3 py-1.5' : 'px-3 py-1.5'}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={strong ? 'money mt-0.5 font-bold text-primary' : 'money mt-0.5'}>
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
