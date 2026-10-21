import { useMemo } from 'react';
import type { Condition, Expression, FormatSpec } from '@dm/report-engine';

import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import {
  AGG_FN_LABELS,
  ARITH_OP_LABELS,
  CMP_OP_LABELS,
  CONDITION_KIND_LABELS,
  EXPRESSION_KIND_LABELS,
  FORMAT_KIND_LABELS,
  MAX_EXPRESSION_DEPTH,
  emptyCondition,
  emptyExpression,
  formatForFieldType,
} from './template-ops';
import type { DataSourceDto } from './templates.api';

/**
 * سازنده عبارت و شرط — همان «شرط‌ساز بدون کد» فاز ۷.
 *
 * عبارت در این سامانه یک **درخت داده** است، نه کد (ADR-0007): هیچ `eval`، هیچ قالب
 * رشته‌ای اجراشدنی، هیچ SQL. پس ویرایشگرش هم طبیعتاً یک درخت تودرتوی فرم است، نه یک
 * جعبه متن که محتوایش را کسی تفسیر کند. کاربر نمی‌تواند چیزی بنویسد که بیرون از این
 * گره‌های شمرده‌شده باشد — نه از سر محدودیت ابزار، بلکه چون خودِ زبان همین است.
 *
 * سقف عمق هم از همان ثابت موتور می‌آید: دکمه «افزودن» وقتی به سقف برسیم خاموش
 * می‌شود، تا کاربر عبارتی نسازد که هنگام ذخیره رد شود.
 */

export interface FieldOption {
  readonly value: string;
  readonly label: string;
  /** نوع فیلد، برای پیشنهاد قالب‌بندی پیش‌فرض. */
  readonly type: DataSourceDto['fields'][number]['type'];
}

/** گزینه‌های مسیر: فیلدهای منابع تکی، و در دامنه جدول، ستون‌های همان منبع. */
export function pathOptions(
  sources: readonly DataSourceDto[],
  rowSourceKey: string | null,
): readonly FieldOption[] {
  const options: FieldOption[] = [];

  if (rowSourceKey !== null) {
    const rowSource = sources.find((source) => source.key === rowSourceKey);
    for (const field of rowSource?.fields ?? []) {
      options.push({
        value: `row.${field.key}`,
        label: `ردیف › ${field.titleFa}`,
        type: field.type,
      });
    }
  }

  for (const source of sources) {
    if (source.cardinality !== 'single') continue;
    for (const field of source.fields) {
      options.push({
        value: `${source.key}.${field.key}`,
        label: `${source.titleFa} › ${field.titleFa}`,
        type: field.type,
      });
    }
  }

  return options;
}

function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function FormatEditor({
  value,
  onChange,
}: {
  value: FormatSpec;
  onChange: (next: FormatSpec) => void;
}): JSX.Element {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select
        label="قالب نمایش"
        placeholder={null}
        value={value.kind}
        onChange={(nextValue) =>
          onChange({ ...value, kind: nextValue as FormatSpec['kind'] })
        }
        options={Object.entries(FORMAT_KIND_LABELS).map(([key, label]) => ({
          value: key,
          label,
        }))}
      />

      <Input
        label="متن جایگزین مقدار تهی"
        value={value.emptyText}
        maxLength={20}
        hint="برای مبالغ «۰» و برای متن «—»"
        onChange={(event) => onChange({ ...value, emptyText: event.target.value })}
      />

      {value.kind === 'decimal' ? (
        <Input
          label="تعداد رقم اعشار"
          type="number"
          min={0}
          max={6}
          value={value.decimals}
          onChange={(event) => onChange({ ...value, decimals: Number(event.target.value) })}
        />
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.persianDigits}
          onChange={(event) => onChange({ ...value, persianDigits: event.target.checked })}
        />
        ارقام فارسی
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.thousandSeparator}
          onChange={(event) => onChange({ ...value, thousandSeparator: event.target.checked })}
        />
        جداکننده هزارگان
      </label>
    </div>
  );
}

export function ExpressionBuilder({
  label,
  value,
  onChange,
  sources,
  rowSourceKey,
  depth = 1,
}: {
  label: string;
  value: Expression;
  onChange: (next: Expression) => void;
  sources: readonly DataSourceDto[];
  /** کلید منبع دادهٔ ردیف جاری، یا `null` بیرون از جدول. */
  rowSourceKey: string | null;
  depth?: number;
}): JSX.Element {
  const options = useMemo(() => pathOptions(sources, rowSourceKey), [sources, rowSourceKey]);
  const collections = sources.filter((source) => source.cardinality === 'list');
  const canNestDeeper = depth < MAX_EXPRESSION_DEPTH - 1;

  return (
    <Frame title={label}>
      <Select
        label="نوع عبارت"
        placeholder={null}
        value={value.k}
        onChange={(nextValue) => onChange(emptyExpression(nextValue as Expression['k']))}
        options={Object.entries(EXPRESSION_KIND_LABELS).map(([key, text]) => ({
          value: key,
          label: text,
          disabled: !canNestDeeper && key !== 'var' && key !== 'const',
        }))}
      />

      {value.k === 'var' ? (
        <Select
          label="فیلد"
          required
          placeholder="انتخاب کنید…"
          value={value.path}
          onChange={(nextValue) => onChange({ k: 'var', path: nextValue })}
          options={options.map((option) => ({ value: option.value, label: option.label }))}
          hint={
            options.length === 0
              ? 'هیچ فیلدی در دسترس شما نیست'
              : 'فهرست فقط فیلدهایی را دارد که مجوزش را دارید'
          }
        />
      ) : null}

      {value.k === 'const' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            label="نوع مقدار"
            placeholder={null}
            value={value.type}
            onChange={(nextValue) =>
              onChange({ ...value, type: nextValue as typeof value.type })
            }
            options={[
              { value: 'text', label: 'متن' },
              { value: 'money', label: 'مبلغ ریالی' },
              { value: 'number', label: 'عدد' },
              { value: 'boolean', label: 'بله/خیر' },
              { value: 'date', label: 'تاریخ (میلادی ISO)' },
            ]}
          />
          <Input
            label="مقدار"
            value={value.v}
            dir={value.type === 'text' ? undefined : 'ltr'}
            hint={value.type === 'money' ? 'عدد صحیح ریال، بدون جداکننده' : undefined}
            onChange={(event) => onChange({ ...value, v: event.target.value })}
          />
        </div>
      ) : null}

      {value.k === 'agg' ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              label="تابع"
              placeholder={null}
              value={value.fn}
              onChange={(nextValue) =>
                onChange({ ...value, fn: nextValue as typeof value.fn })
              }
              options={Object.entries(AGG_FN_LABELS).map(([key, text]) => ({
                value: key,
                label: text,
              }))}
            />
            <Select
              label="روی مجموعه"
              required
              value={value.over}
              onChange={(nextValue) => onChange({ ...value, over: nextValue })}
              options={collections.map((source) => ({
                value: source.key,
                label: source.titleFa,
              }))}
            />
          </div>

          {value.fn === 'count' ? (
            <p className="text-xs text-muted-foreground">
              تابع «تعداد» به عبارت نیاز ندارد؛ ردیف‌های مجموعه را می‌شمارد.
            </p>
          ) : (
            <ExpressionBuilder
              label="عبارتِ هر ردیف"
              value={value.of ?? { k: 'const', type: 'money', v: '0' }}
              onChange={(next) => onChange({ ...value, of: next })}
              sources={sources}
              /* داخل تابع تجمیعی، «ردیف» به مجموعه‌ای اشاره دارد که روی آن تجمیع می‌شود. */
              rowSourceKey={value.over === '' ? null : value.over}
              depth={depth + 1}
            />
          )}
        </div>
      ) : null}

      {value.k === 'arith' ? (
        <div className="space-y-2">
          <Select
            label="عملیات"
            placeholder={null}
            value={value.op}
            onChange={(nextValue) =>
              onChange({ ...value, op: nextValue as typeof value.op })
            }
            options={Object.entries(ARITH_OP_LABELS).map(([key, text]) => ({
              value: key,
              label: text,
            }))}
          />
          <ExpressionBuilder
            label="عبارت اول"
            value={value.args[0]}
            onChange={(next) => onChange({ ...value, args: [next, value.args[1]] })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
          <ExpressionBuilder
            label="عبارت دوم"
            value={value.args[1]}
            onChange={(next) => onChange({ ...value, args: [value.args[0], next] })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
        </div>
      ) : null}

      {value.k === 'concat' ? (
        <div className="space-y-2">
          <Input
            label="جداکننده"
            value={value.sep ?? ''}
            maxLength={10}
            onChange={(event) => onChange({ ...value, sep: event.target.value })}
          />
          {value.args.map((argument, index) => (
            <div key={`arg-${index}`} className="space-y-1">
              <ExpressionBuilder
                label={`بخش ${index + 1}`}
                value={argument}
                onChange={(next) =>
                  onChange({
                    ...value,
                    args: value.args.map((item, position) => (position === index ? next : item)),
                  })
                }
                sources={sources}
                rowSourceKey={rowSourceKey}
                depth={depth + 1}
              />
              {value.args.length > 1 ? (
                <button
                  type="button"
                  className="text-[11px] text-destructive hover:underline"
                  onClick={() =>
                    onChange({
                      ...value,
                      args: value.args.filter((_item, position) => position !== index),
                    })
                  }
                >
                  حذف بخش {index + 1}
                </button>
              ) : null}
            </div>
          ))}
          {value.args.length < 20 && canNestDeeper ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                onChange({ ...value, args: [...value.args, { k: 'const', type: 'text', v: '' }] })
              }
            >
              افزودن بخش
            </button>
          ) : null}
        </div>
      ) : null}

      {value.k === 'if' ? (
        <div className="space-y-2">
          <ConditionBuilder
            label="شرط"
            value={value.cond}
            onChange={(next) => onChange({ ...value, cond: next })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
          <ExpressionBuilder
            label="اگر درست بود"
            value={value.then}
            onChange={(next) => onChange({ ...value, then: next })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
          <ExpressionBuilder
            label="وگرنه"
            value={value.else}
            onChange={(next) => onChange({ ...value, else: next })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
        </div>
      ) : null}

      {value.k === 'fmt' ? (
        <div className="space-y-2">
          <ExpressionBuilder
            label="عبارت"
            value={value.of}
            onChange={(next) => onChange({ ...value, of: next })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
          <FormatEditor
            value={value.format}
            onChange={(next) => onChange({ ...value, format: next })}
          />
        </div>
      ) : null}
    </Frame>
  );
}

export function ConditionBuilder({
  label,
  value,
  onChange,
  sources,
  rowSourceKey,
  depth = 1,
}: {
  label: string;
  value: Condition;
  onChange: (next: Condition) => void;
  sources: readonly DataSourceDto[];
  rowSourceKey: string | null;
  depth?: number;
}): JSX.Element {
  const canNestDeeper = depth < MAX_EXPRESSION_DEPTH - 1;

  return (
    <Frame title={label}>
      <Select
        label="نوع شرط"
        placeholder={null}
        value={value.k}
        onChange={(nextValue) => onChange(emptyCondition(nextValue as Condition['k']))}
        options={Object.entries(CONDITION_KIND_LABELS).map(([key, text]) => ({
          value: key,
          label: text,
          disabled: !canNestDeeper && key !== 'empty',
        }))}
      />

      {value.k === 'cmp' ? (
        <div className="space-y-2">
          <Select
            label="مقایسه"
            placeholder={null}
            value={value.op}
            onChange={(nextValue) =>
              onChange({ ...value, op: nextValue as typeof value.op })
            }
            options={Object.entries(CMP_OP_LABELS).map(([key, text]) => ({
              value: key,
              label: text,
            }))}
          />
          <ExpressionBuilder
            label="سمت اول"
            value={value.args[0]}
            onChange={(next) => onChange({ ...value, args: [next, value.args[1]] })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
          <ExpressionBuilder
            label="سمت دوم"
            value={value.args[1]}
            onChange={(next) => onChange({ ...value, args: [value.args[0], next] })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
        </div>
      ) : null}

      {value.k === 'empty' ? (
        <ExpressionBuilder
          label="عبارت"
          value={value.of}
          onChange={(next) => onChange({ ...value, of: next })}
          sources={sources}
          rowSourceKey={rowSourceKey}
          depth={depth + 1}
        />
      ) : null}

      {value.k === 'in' ? (
        <div className="space-y-2">
          <ExpressionBuilder
            label="عبارت"
            value={value.of}
            onChange={(next) => onChange({ ...value, of: next })}
            sources={sources}
            rowSourceKey={rowSourceKey}
            depth={depth + 1}
          />
          <Input
            label="مقادیر مجاز"
            value={value.values.join('، ')}
            hint="با ویرگول فارسی جدا کنید"
            onChange={(event) =>
              onChange({
                ...value,
                values: event.target.value
                  .split('،')
                  .map((item) => item.trim())
                  .filter((item) => item !== ''),
              })
            }
          />
        </div>
      ) : null}

      {value.k === 'not' ? (
        <ConditionBuilder
          label="شرطی که نقض می‌شود"
          value={value.of}
          onChange={(next) => onChange({ ...value, of: next })}
          sources={sources}
          rowSourceKey={rowSourceKey}
          depth={depth + 1}
        />
      ) : null}

      {value.k === 'and' || value.k === 'or' ? (
        <div className="space-y-2">
          {value.args.length === 0 ? (
            <p className="text-xs text-warning">
              فهرست شرط‌ها خالی است؛ «و» با فهرست خالی همیشه درست و «یا» همیشه نادرست
              می‌شود.
            </p>
          ) : null}
          {value.args.map((argument, index) => (
            <div key={`cond-${index}`} className="space-y-1">
              <ConditionBuilder
                label={`شرط ${index + 1}`}
                value={argument}
                onChange={(next) =>
                  onChange({
                    ...value,
                    args: value.args.map((item, position) =>
                      position === index ? next : item,
                    ),
                  })
                }
                sources={sources}
                rowSourceKey={rowSourceKey}
                depth={depth + 1}
              />
              <button
                type="button"
                className="text-[11px] text-destructive hover:underline"
                onClick={() =>
                  onChange({
                    ...value,
                    args: value.args.filter((_item, position) => position !== index),
                  })
                }
              >
                حذف شرط {index + 1}
              </button>
            </div>
          ))}
          {value.args.length < 20 && canNestDeeper ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                onChange({
                  ...value,
                  args: [...value.args, emptyCondition('empty')],
                })
              }
            >
              افزودن شرط
            </button>
          ) : null}
        </div>
      ) : null}
    </Frame>
  );
}

/** میان‌بر پرکاربرد: یک فیلد را به‌عنوان عبارت ستون انتخاب کن و قالبش را هم بگیر. */
export function FieldShortcut({
  sources,
  rowSourceKey,
  onPick,
}: {
  sources: readonly DataSourceDto[];
  rowSourceKey: string | null;
  onPick: (expression: Expression, format: FormatSpec) => void;
}): JSX.Element {
  const options = useMemo(() => pathOptions(sources, rowSourceKey), [sources, rowSourceKey]);

  return (
    <Select
      label="انتخاب سریع فیلد"
      placeholder="یک فیلد را انتخاب کنید…"
      value=""
      hint="عبارت و قالب نمایش با هم تنظیم می‌شوند"
      onChange={(nextValue) => {
        const picked = options.find((option) => option.value === nextValue);
        if (!picked) return;
        onPick({ k: 'var', path: picked.value }, formatForFieldType(picked.type));
      }}
      options={options.map((option) => ({ value: option.value, label: option.label }))}
    />
  );
}
