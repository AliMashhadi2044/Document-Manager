import {
  FILTER_OPERATOR_LABELS,
  operatorValueCount,
  type FilterCondition,
  type FilterGroup,
} from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
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
 * شکل ورودی مقدار از **نوع فیلد** می‌آید، نه از حدس: مبلغ با ورودی مبلغ (جداکننده
 * هزارگان و ارقام فارسی)، تاریخ با تقویم شمسی، و enum با فهرست بسته.
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

  function setCondition(index: number, next: FilterCondition): void {
    onChange({
      ...value,
      conditions: value.conditions.map((item, position) => (position === index ? next : item)),
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">ترکیب شرط‌ها:</span>
        <div className="flex rounded-md border border-border">
          {(
            [
              ['and', 'همه (و)'],
              ['or', 'یکی از (یا)'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...value, combine: key })}
              className={
                value.combine === key
                  ? 'bg-primary px-2.5 py-1 text-xs text-primary-foreground'
                  : 'px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted'
              }
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {toPersianDigits(String(value.conditions.length))} شرط در این گروه
        </span>
      </div>

      <ul className="space-y-2">
        {value.conditions.map((condition, index) => {
          const field = fields.find((item) => item.key === condition.field);
          const operators = field?.operators ?? [];
          const count = operatorValueCount(condition.op);

          return (
            <li key={`condition-${index}`} className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Select
                  label="فیلد"
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
              </div>

              <div className="w-44">
                <Select
                  label="شرط"
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
              </div>

              {count !== 0 && field ? (
                <ValueInputs
                  field={field}
                  condition={condition}
                  onChange={(next) => setCondition(index, next)}
                />
              ) : null}

              <button
                type="button"
                className="pb-2 text-[11px] text-destructive hover:underline"
                onClick={() =>
                  onChange({
                    ...value,
                    conditions: value.conditions.filter((_item, position) => position !== index),
                  })
                }
              >
                حذف
              </button>
            </li>
          );
        })}
      </ul>

      {(value.groups ?? []).map((group, index) => (
        <div key={`group-${index}`} className="space-y-1">
          <FilterBuilder
            fields={fields}
            value={group}
            depth={depth + 1}
            onChange={(next) =>
              onChange({
                ...value,
                groups: (value.groups ?? []).map((item, position) =>
                  position === index ? next : item,
                ),
              })
            }
          />
          <button
            type="button"
            className="text-[11px] text-destructive hover:underline"
            onClick={() =>
              onChange({
                ...value,
                groups: (value.groups ?? []).filter((_item, position) => position !== index),
              })
            }
          >
            حذف گروه {toPersianDigits(String(index + 1))}
          </button>
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
                  ...(value.groups ?? []),
                  { combine: value.combine === 'and' ? 'or' : 'and', conditions: [] },
                ],
              })
            }
          >
            افزودن گروه
          </Button>
        ) : null}

        {value.conditions.length > 0 || (value.groups ?? []).length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange({ combine: value.combine, conditions: [] })}
          >
            پاک کردن
          </Button>
        ) : null}
      </div>
    </div>
  );
}

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
    return (
      <div className="min-w-48 flex-1">
        {field.enumValues ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">مقادیر</legend>
            <div className="flex flex-wrap gap-1.5">
              {field.enumValues.map((option) => {
                const selected = condition.values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
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
                        ? 'rounded border border-primary bg-primary/10 px-2 py-0.5 text-xs text-primary'
                        : 'rounded border border-border px-2 py-0.5 text-xs hover:bg-muted'
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <Input
            label="مقادیر"
            value={condition.values.join('، ')}
            hint="با ویرگول فارسی جدا کنید"
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
        )}
      </div>
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
      <div className="w-full max-w-md">
        <JalaliDateRangePicker
          label="بازهٔ تاریخ"
          value={{ from: condition.values[0] ?? null, to: condition.values[1] ?? null }}
          onChange={(range) =>
            onChange({ ...condition, values: [range.from ?? '', range.to ?? ''] })
          }
        />
      </div>
    );
  }

  const inputs = count === 2 ? [0, 1] : [0];

  return (
    <>
      {inputs.map((index) => (
        <div key={index} className="w-44">
          <SingleValueInput
            field={field}
            label={count === 2 ? (index === 0 ? 'از' : 'تا') : 'مقدار'}
            value={condition.values[index] ?? ''}
            onChange={(raw) => setValue(index, raw)}
          />
        </div>
      ))}
    </>
  );
}

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
        label={label}
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
      return <MoneyInput label={label} value={value} onChange={onChange} />;

    case 'date':
    case 'jalaliDate':
      // مقدار بیرونی میلادی ISO است و تبدیل شمسی در خودِ ورودی انجام می‌شود — همان
      // قراردادی که فرم‌های سند و فاکتور دارند.
      return (
        <JalaliDatePicker
          label={label}
          value={value === '' ? null : value}
          onChange={(iso) => onChange(iso ?? '')}
        />
      );

    case 'integer':
      return (
        <Input
          label={label}
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    default:
      return (
        <Input label={label} value={value} onChange={(event) => onChange(event.target.value)} />
      );
  }
}
