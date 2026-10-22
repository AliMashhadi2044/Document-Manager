import {
  FILTER_OPERATOR_LABELS,
  operatorValueCount,
  type FilterCondition,
  type FilterGroup,
} from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Segmented } from '../../shared/ui/segmented';
import { JalaliDatePicker, JalaliDateRangePicker } from '../../shared/ui/date-picker';
import { MoneyInput } from '../../shared/ui/money-input';
import { toPersianDigits } from '../../shared/format/money';
import type { DatasetFieldDto } from './analytics.api';

/**
 * فیلترساز — همان `FilterBuilder` فاز ۸.
 *
 * ورودی‌اش برای هر شرط سه چیز است: فیلد، عملگر، مقدار. **هیچ‌کدام متن آزاد نیستند**
 * مگر خودِ مقدار: فیلد از فهرست مجموعه‌داده می‌آید و عملگرها از نوع فیلد مشتق
 * می‌شوند. پس کاربر نمی‌تواند شرطی بسازد که سرور نشناسد — و سرور هم همان را دوباره
 * می‌سنجد، چون فیلتر از مرورگر می‌آید و مرورگر هیچ‌وقت مرجع نیست.
 *
 * شکل ورودی مقدار از **نوع فیلد** می‌آید، نه از حدس: مبلغ با ورودی مبلغ، تاریخ با
 * تقویم شمسی، و enum با فهرست بسته.
 *
 * ───── چیدمان ─────
 *
 * هر شرط یک **ردیف شبکه‌ای با ستون‌های ثابت** است، نه یک `flex-wrap` از کنترل‌های
 * برچسب‌دار. دو چیز را این عوض کرد:
 *
 * ۱. **برچسب‌ها یک‌بار، بالای ستون‌ها.** پیش از این هر شرط سه برچسب تکراری داشت
 *    («فیلد»، «شرط»، «مقدار») و با پنج شرط، پانزده برچسب روی صفحه بود.
 * ۲. **خط راهنما زیر کنترل‌ها برداشته شد** (`compact`). انتخابگر تاریخ همیشه یک خط
 *    راهنما داشت و ورودی مبلغ با پر شدن مقدار یکی پیدا می‌کرد؛ در یک ردیفِ
 *    `items-end`، همین خط کنترلِ کناری را بالا و پایین می‌برد و ردیف ناتراز
 *    می‌شد. حالا خلاصهٔ تاریخ روی `title` خودِ کادر است.
 */
export function FilterBuilder({
  fields,
  value,
  onChange,
  depth = 1,
}: {
  fields: readonly DatasetFieldDto[];
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  depth?: number;
}): JSX.Element {
  const filterable = fields.filter((field) => field.filterable);
  const canNest = depth < 3;
  const groups = value.groups ?? [];
  const empty = value.conditions.length === 0 && groups.length === 0;

  function setCondition(index: number, next: FilterCondition): void {
    onChange({
      ...value,
      conditions: value.conditions.map((item, position) => (position === index ? next : item)),
    });
  }

  return (
    <div
      className={
        depth === 1
          ? 'space-y-3 rounded-xl border border-border bg-muted/20 p-3'
          : // گروه تودرتو با یک خط کناری از گروه والد جدا می‌شود؛ قاب کامل روی قاب،
            // عمق را بیشتر از آنچه هست نشان می‌داد.
            'space-y-3 rounded-lg border-s-2 border-primary/40 bg-card/60 ps-3'
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          label="ترکیب شرط‌ها"
          value={value.combine}
          onChange={(next) => onChange({ ...value, combine: next as FilterGroup['combine'] })}
          options={[
            { value: 'and', label: 'همهٔ شرط‌ها' },
            { value: 'or', label: 'یکی از شرط‌ها' },
          ]}
        />

        <span className="text-xs text-muted-foreground">
          {empty
            ? 'بدون شرط — همهٔ ردیف‌ها'
            : `${toPersianDigits(String(value.conditions.length))} شرط${
                groups.length > 0 ? ` و ${toPersianDigits(String(groups.length))} گروه` : ''
              }`}
        </span>

        {!empty ? (
          <button
            type="button"
            className="ms-auto text-xs text-muted-foreground hover:text-destructive hover:underline"
            onClick={() => onChange({ combine: value.combine, conditions: [] })}
          >
            پاک کردن همه
          </button>
        ) : null}
      </div>

      {value.conditions.length > 0 ? (
        <div className="space-y-1.5">
          {/* سرستون‌ها یک‌بار، نه روی تک‌تک شرط‌ها. روی موبایل جایی ندارند. */}
          <div
            aria-hidden="true"
            className="hidden gap-2 px-1 text-[11px] text-muted-foreground md:grid"
            style={{ gridTemplateColumns: CONDITION_COLUMNS }}
          >
            <span>فیلد</span>
            <span>شرط</span>
            <span>مقدار</span>
            <span />
          </div>

          <ul className="space-y-1.5">
            {value.conditions.map((condition, index) => {
              const field = fields.find((item) => item.key === condition.field);
              const operators = field?.operators ?? [];
              const count = operatorValueCount(condition.op);

              return (
                <li
                  key={`condition-${index}`}
                  className="grid items-start gap-2 rounded-lg bg-card/70 p-1.5 md:p-1"
                  style={{ gridTemplateColumns: CONDITION_COLUMNS }}
                >
                  <Select
                    aria-label={`فیلد شرط ${toPersianDigits(String(index + 1))}`}
                    prefsKey={null}
                    placeholder="انتخاب کنید…"
                    value={condition.field}
                    onChange={(nextValue) => {
                      const next = fields.find((item) => item.key === nextValue);
                      setCondition(index, {
                        field: nextValue,
                        // عملگر با تغییر فیلد بازنشانی می‌شود: عملگر قبلی می‌تواند با
                        // نوع فیلد تازه نخواند و سرور همان را رد می‌کند.
                        op: next?.operators[0] ?? 'eq',
                        values: [],
                      });
                    }}
                    options={filterable.map((item) => ({ value: item.key, label: item.titleFa }))}
                  />

                  <Select
                    aria-label={`عملگر شرط ${toPersianDigits(String(index + 1))}`}
                    prefsKey={null}
                    placeholder={null}
                    disabled={field === undefined}
                    value={condition.op}
                    onChange={(nextValue) =>
                      setCondition(index, {
                        ...condition,
                        op: nextValue as FilterCondition['op'],
                        values: [],
                      })
                    }
                    options={operators.map((op) => ({
                      value: op,
                      label: FILTER_OPERATOR_LABELS[op],
                    }))}
                  />

                  {count !== 0 && field ? (
                    <ValueInputs
                      field={field}
                      condition={condition}
                      onChange={(next) => setCondition(index, next)}
                    />
                  ) : (
                    <span className="flex h-10 items-center text-xs text-muted-foreground">
                      {field ? 'این شرط مقدار نمی‌خواهد' : 'ابتدا فیلد را انتخاب کنید'}
                    </span>
                  )}

                  <button
                    type="button"
                    aria-label={`حذف شرط ${toPersianDigits(String(index + 1))}`}
                    title="حذف این شرط"
                    className="inline-flex size-8 shrink-0 items-center justify-center self-start rounded-lg text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-90"
                    onClick={() =>
                      onChange({
                        ...value,
                        conditions: value.conditions.filter(
                          (_item, position) => position !== index,
                        ),
                      })
                    }
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {groups.map((group, index) => (
        <div key={`group-${index}`} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              گروه {toPersianDigits(String(index + 1))}
            </span>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-destructive hover:underline"
              onClick={() =>
                onChange({
                  ...value,
                  groups: groups.filter((_item, position) => position !== index),
                })
              }
            >
              حذف گروه
            </button>
          </div>

          <FilterBuilder
            fields={fields}
            value={group}
            depth={depth + 1}
            onChange={(next) =>
              onChange({
                ...value,
                groups: groups.map((item, position) => (position === index ? next : item)),
              })
            }
          />
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={filterable.length === 0}
          onClick={() =>
            onChange({
              ...value,
              conditions: [
                ...value.conditions,
                {
                  field: filterable[0]?.key ?? '',
                  op: filterable[0]?.operators[0] ?? 'eq',
                  values: [],
                },
              ],
            })
          }
        >
          <Icon name="plus" size={15} />
          افزودن شرط
        </Button>

        {canNest ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({
                ...value,
                groups: [
                  ...groups,
                  { combine: value.combine === 'and' ? 'or' : 'and', conditions: [] },
                ],
              })
            }
          >
            افزودن گروه
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * ستون‌های ردیف شرط.
 *
 * عرض «شرط» ثابت است چون برچسب عملگرها کوتاه و هم‌اندازه‌اند؛ دو ستون دیگر کشسانند
 * و ستون مقدار سهم بیشتری می‌گیرد، چون گاهی یک بازهٔ تاریخ یا چند برچسب enum است.
 */
const CONDITION_COLUMNS = 'minmax(0,1fr) 11rem minmax(0,1.5fr) 2rem';

/** ورودی مقدار، بر اساس نوع فیلد و تعداد مقداری که عملگر می‌خواهد. */
function ValueInputs({
  field,
  condition,
  onChange,
}: {
  field: DatasetFieldDto;
  condition: FilterCondition;
  onChange: (next: FilterCondition) => void;
}): JSX.Element {
  const count = operatorValueCount(condition.op);

  function setValue(index: number, raw: string): void {
    const values = [...condition.values];
    values[index] = raw;
    onChange({ ...condition, values });
  }

  if (count === 'many') {
    return field.enumValues ? (
      <div className="flex min-h-10 flex-wrap items-center gap-1.5">
        {field.enumValues.map((option) => {
          const selected = condition.values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange({
                  ...condition,
                  values: selected
                    ? condition.values.filter((item) => item !== option.value)
                    : [...condition.values, option.value],
                })
              }
              className={
                selected
                  ? 'rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs text-primary'
                  : 'rounded-md border border-border px-2 py-1 text-xs hover:bg-muted'
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    ) : (
      <Input
        aria-label="مقادیر"
        placeholder="با ویرگول فارسی جدا کنید: الف، ب"
        value={condition.values.join('، ')}
        onChange={(event) =>
          onChange({
            ...condition,
            values: event.target.value
              .split('،')
              .map((item) => item.trim())
              .filter((item) => item !== ''),
          })
        }
      />
    );
  }

  /*
    بازهٔ تاریخ، **یک** کنترل است و نه دو تا.

    با دو ورودی جدا، کاربر می‌توانست «از» را بعد از «تا» بگذارد و خطا را تازه موقع
    اجرای گزارش ببیند؛ انتخابگر بازه خودش این را ممکن نمی‌کند و بازه‌های آماده
    («۳۰ روز اخیر»، «ماه گذشته») را هم در دسترس می‌گذارد — همان چیزی که در
    گزارش‌گیری مدام لازم است.
  */
  if (count === 2 && (field.type === 'date' || field.type === 'jalaliDate')) {
    return (
      <JalaliDateRangePicker
        label="بازهٔ تاریخ"
        compact
        value={{ from: condition.values[0] ?? null, to: condition.values[1] ?? null }}
        onChange={(range) => onChange({ ...condition, values: [range.from ?? '', range.to ?? ''] })}
      />
    );
  }

  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <SingleValueInput
          field={field}
          label="از"
          value={condition.values[0] ?? ''}
          onChange={(raw) => setValue(0, raw)}
        />
        <SingleValueInput
          field={field}
          label="تا"
          value={condition.values[1] ?? ''}
          onChange={(raw) => setValue(1, raw)}
        />
      </div>
    );
  }

  return (
    <SingleValueInput
      field={field}
      label="مقدار"
      value={condition.values[0] ?? ''}
      onChange={(raw) => setValue(0, raw)}
    />
  );
}

/**
 * یک خانهٔ مقدار.
 *
 * برچسب اینجا **دیده نمی‌شود** و فقط نام قابل دسترس است: سرستون‌های بالای فهرست،
 * همان را برای چشم می‌گویند.
 */
function SingleValueInput({
  field,
  label,
  value,
  onChange,
}: {
  field: DatasetFieldDto;
  label: string;
  value: string;
  onChange: (raw: string) => void;
}): JSX.Element {
  if (field.enumValues) {
    return (
      <Select
        aria-label={label}
        prefsKey={null}
        placeholder="انتخاب کنید…"
        value={value}
        onChange={(nextValue) => onChange(nextValue)}
        options={field.enumValues.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
      />
    );
  }

  switch (field.type) {
    case 'money':
      // مقدار به‌صورت **رشته عددی** نگه داشته می‌شود، همان قرارداد مرز API.
      return <MoneyInput compact ariaLabel={label} value={value} onChange={onChange} />;

    case 'date':
    case 'jalaliDate':
      // مقدار بیرونی میلادی ISO است و تبدیل شمسی در خودِ ورودی انجام می‌شود — همان
      // قراردادی که فرم‌های سند و فاکتور دارند.
      return (
        <JalaliDatePicker
          label={label}
          compact
          value={value === '' ? null : value}
          onChange={(iso) => onChange(iso ?? '')}
        />
      );

    case 'integer':
      return (
        <Input
          aria-label={label}
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    default:
      return (
        <Input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
