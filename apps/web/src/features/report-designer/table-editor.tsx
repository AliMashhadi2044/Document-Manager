import { useState } from 'react';
import type { TableBlock, TableColumn, TemplateV1 } from '@dm/report-engine';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { toPersianDigits } from '../../shared/format/money';
import {
  ConditionBuilder,
  ExpressionBuilder,
  FieldShortcut,
  FormatEditor,
  pathOptions,
} from './expression-builder';
import { useDragList } from './drag-list';
import {
  TEXT_FORMAT,
  emptyCondition,
  moveItem,
  newColumn,
  uniqueColumnKey,
  widthReport,
} from './template-ops';
import type { DataSourceDto } from './templates.api';

/**
 * ویرایشگر جدول: ستون‌ها، عرض، چینش، قالب، ردیف جمع، گروه‌بندی ترتیب و صفحه‌بندی.
 *
 * دو چیز اینجا عمداً **همان لحظه** به کاربر گفته می‌شود:
 *
 *  ۱. **مجموع عرض ستون‌ها در برابر عرض قابل چاپ صفحه.** در فاز ۶ همین نقص با تولید
 *     PDF واقعی کشف شد: دو ستون آخر گزارش مالیات از صفحه بیرون می‌افتادند و هیچ تستی
 *     آن را نمی‌دید. اینجا عدد پیش چشم کاربر است، پیش از ذخیره.
 *
 *  ۲. **ردیف جمع فقط برای ستون عددی معنا دارد.** جمعِ ستون متنی، عدد بی‌معنا می‌سازد.
 */
export function TableEditor({
  template,
  block,
  onChange,
  sources,
}: {
  template: TemplateV1;
  block: TableBlock;
  onChange: (next: TableBlock) => void;
  sources: readonly DataSourceDto[];
}): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const collections = sources.filter((source) => source.cardinality === 'list');
  const rowSourceKey = block.dataSource === '' ? null : block.dataSource;
  const width = widthReport(template, block);
  /**
   * کپی ثابت از ردیف جمع.
   *
   * `block` یک prop است و TypeScript باریک‌سازیِ `block.totalsRow` را داخل callback‌های
   * رویداد نگه نمی‌دارد؛ یک `const` محلی همان باریک‌سازی را تا داخل callback می‌برد.
   */
  const totals = block.totalsRow;
  const rowFields = pathOptions(sources, rowSourceKey).filter((option) =>
    option.value.startsWith('row.'),
  );

  function setColumns(columns: TableColumn[]): void {
    onChange({ ...block, columns });
  }

  function updateColumn(index: number, next: TableColumn): void {
    setColumns(block.columns.map((column, position) => (position === index ? next : column)));
  }

  const drag = useDragList((from, to) => setColumns(moveItem(block.columns, from, to)));

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-md border border-border p-3">
        <h4 className="text-sm font-semibold">داده و صفحه‌بندی</h4>

        <Select
          label="منبع داده"
          required
          placeholder="انتخاب کنید…"
          value={block.dataSource}
          onChange={(event) => onChange({ ...block, dataSource: event.target.value })}
          options={collections.map((source) => ({ value: source.key, label: source.titleFa }))}
          hint="فهرست فقط منابعی را دارد که مجوز دیدنشان را دارید"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="حداقل تعداد ردیف چاپی"
            type="number"
            min={0}
            max={100}
            value={block.minRows}
            hint="کمبود ردیف با ردیف خالی پر می‌شود (فرم چاپی)"
            onChange={(event) => onChange({ ...block, minRows: Number(event.target.value) })}
          />

          <div className="space-y-2 pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={block.pagination.repeatHeaderOnNewPage}
                onChange={(event) =>
                  onChange({
                    ...block,
                    pagination: {
                      ...block.pagination,
                      repeatHeaderOnNewPage: event.target.checked,
                    },
                  })
                }
              />
              تکرار سرستون در هر صفحه
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={block.pagination.avoidRowBreak}
                onChange={(event) =>
                  onChange({
                    ...block,
                    pagination: { ...block.pagination, avoidRowBreak: event.target.checked },
                  })
                }
              />
              نشکستن ردیف بین دو صفحه
            </label>
          </div>
        </div>

        <SortEditor block={block} onChange={onChange} rowFields={rowFields} />

        <div className="space-y-2 rounded-md bg-muted/40 p-2.5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={totals?.enabled === true}
              onChange={(event) =>
                onChange({
                  ...block,
                  totalsRow: event.target.checked
                    ? {
                        enabled: true,
                        labelFa: totals?.labelFa ?? 'جمع کل',
                        cells: totals?.cells ?? {},
                      }
                    : undefined,
                })
              }
            />
            ردیف جمع
          </label>

          {totals?.enabled === true ? (
            <>
              <Input
                label="برچسب ردیف جمع"
                value={totals.labelFa}
                maxLength={100}
                onChange={(event) =>
                  onChange({ ...block, totalsRow: { ...totals, labelFa: event.target.value } })
                }
              />
              <p className="text-xs text-muted-foreground">
                تابع هر ستون در فهرست ستون‌های پایین تنظیم می‌شود.
              </p>
              {/*
                ردیف جمع در آخرین ردیف بدنه چاپ می‌شود، نه در `tfoot`: پابرگ جدول روی
                هر صفحه تکرار می‌شود و «جمع کل» تکرارشده، جمع همان صفحه خوانده می‌شود.
              */}
              <p className="text-xs text-muted-foreground">
                ردیف جمع یک‌بار و در پایان جدول چاپ می‌شود، نه پای هر صفحه.
              </p>
            </>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">
            ستون‌ها ({toPersianDigits(String(block.columns.length))})
          </h4>
          <Button
            size="sm"
            variant="secondary"
            disabled={block.columns.length >= 40}
            onClick={() => setColumns([...block.columns, newColumn(uniqueColumnKey(block, 'col'))])}
          >
            افزودن ستون
          </Button>
        </div>

        <p
          className={
            width.overflow > 0
              ? 'rounded-md bg-destructive/10 p-2 text-xs text-destructive'
              : 'rounded-md bg-muted p-2 text-xs text-muted-foreground'
          }
        >
          مجموع عرض ستون‌های میلی‌متری: {toPersianDigits(String(width.used))} از{' '}
          {toPersianDigits(String(width.printable))} میلی‌متر عرض قابل چاپ
          {width.overflow > 0
            ? ` — ${toPersianDigits(String(width.overflow))} میلی‌متر بیشتر؛ ستون‌های آخر در چاپ بریده می‌شوند`
            : ''}
        </p>

        <ul className="space-y-1.5">
          {block.columns.map((column, index) => {
            const isOpen = expanded === column.key;
            const isNumeric = column.format.kind === 'currency' || column.format.kind === 'integer' || column.format.kind === 'decimal';

            return (
              <li
                key={column.key}
                {...drag.itemProps(index)}
                className={[
                  'rounded-md border bg-card',
                  drag.overIndex === index && drag.draggingIndex !== index
                    ? 'border-primary'
                    : 'border-border',
                  drag.draggingIndex === index ? 'opacity-50' : '',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-2 p-2">
                  <span
                    aria-hidden="true"
                    className="cursor-grab select-none px-1 text-muted-foreground"
                    title="برای جابه‌جایی بکشید"
                  >
                    ⠿
                  </span>
                  <span className="min-w-28 flex-1 truncate text-sm">{column.titleFa}</span>
                  <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {column.key}
                  </code>
                  <span className="text-[11px] text-muted-foreground">
                    {column.width.unit === 'auto'
                      ? 'خودکار'
                      : `${toPersianDigits(String(column.width.value ?? 0))} ${column.width.unit === 'mm' ? 'م‌م' : '٪'}`}
                  </span>

                  {totals?.enabled === true ? (
                    <select
                      aria-label={`تابع ردیف جمع برای ستون ${column.titleFa}`}
                      className="h-7 rounded border border-border bg-background px-1 text-[11px]"
                      value={totals.cells[column.key] ?? 'none'}
                      onChange={(event) =>
                        onChange({
                          ...block,
                          totalsRow: {
                            ...totals,
                            cells: {
                              ...totals.cells,
                              [column.key]: event.target.value as 'sum' | 'count' | 'none',
                            },
                          },
                        })
                      }
                    >
                      <option value="none">بدون جمع</option>
                      <option value="sum" disabled={!isNumeric}>
                        جمع
                      </option>
                      <option value="count">تعداد</option>
                    </select>
                  ) : null}

                  <div className="flex items-center gap-0.5">
                    <IconButton
                      label="انتقال به بالا"
                      disabled={index === 0}
                      onClick={() => setColumns(moveItem(block.columns, index, index - 1))}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label="انتقال به پایین"
                      disabled={index === block.columns.length - 1}
                      onClick={() => setColumns(moveItem(block.columns, index, index + 1))}
                    >
                      ↓
                    </IconButton>
                    <IconButton
                      label="تکرار ستون"
                      onClick={() =>
                        setColumns([
                          ...block.columns.slice(0, index + 1),
                          { ...column, key: uniqueColumnKey(block, column.key) },
                          ...block.columns.slice(index + 1),
                        ])
                      }
                    >
                      ⧉
                    </IconButton>
                    <IconButton
                      label="حذف ستون"
                      disabled={block.columns.length === 1}
                      onClick={() =>
                        setColumns(block.columns.filter((_item, position) => position !== index))
                      }
                    >
                      ✕
                    </IconButton>
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs text-primary hover:bg-muted"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : column.key)}
                    >
                      {isOpen ? 'بستن' : 'تنظیمات'}
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="space-y-3 border-t border-border p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="عنوان ستون"
                        required
                        value={column.titleFa}
                        maxLength={120}
                        onChange={(event) =>
                          updateColumn(index, { ...column, titleFa: event.target.value })
                        }
                      />
                      <Input
                        label="کلید ستون"
                        required
                        dir="ltr"
                        value={column.key}
                        maxLength={60}
                        hint="در Excel و ردیف جمع با همین کلید شناخته می‌شود"
                        onChange={(event) => {
                          const nextKey = event.target.value;
                          const previousKey = column.key;
                          const cells = totals?.cells ?? {};
                          const aggregate = cells[previousKey];
                          onChange({
                            ...block,
                            columns: block.columns.map((item, position) =>
                              position === index ? { ...column, key: nextKey } : item,
                            ),
                            // کلید ستون در ردیف جمع هم استفاده می‌شود؛ بدون این،
                            // تغییر نام ستون، ردیف جمع را به ستون ناموجود می‌بست.
                            ...(totals && aggregate !== undefined
                              ? {
                                  totalsRow: {
                                    ...totals,
                                    cells: Object.fromEntries(
                                      Object.entries(cells).map(([key, value]) =>
                                        key === previousKey ? [nextKey, value] : [key, value],
                                      ),
                                    ),
                                  },
                                }
                              : {}),
                          });
                          setExpanded(nextKey);
                        }}
                      />
                      <Select
                        label="واحد عرض"
                        placeholder={null}
                        value={column.width.unit}
                        onChange={(event) =>
                          updateColumn(index, {
                            ...column,
                            width: {
                              unit: event.target.value as 'mm' | 'percent' | 'auto',
                              ...(event.target.value === 'auto'
                                ? {}
                                : { value: column.width.value ?? 20 }),
                            },
                          })
                        }
                        options={[
                          { value: 'mm', label: 'میلی‌متر' },
                          { value: 'percent', label: 'درصد' },
                          { value: 'auto', label: 'خودکار' },
                        ]}
                      />
                      {column.width.unit === 'auto' ? null : (
                        <Input
                          label="مقدار عرض"
                          type="number"
                          min={0}
                          max={500}
                          value={column.width.value ?? 0}
                          onChange={(event) =>
                            updateColumn(index, {
                              ...column,
                              width: { unit: column.width.unit, value: Number(event.target.value) },
                            })
                          }
                        />
                      )}
                      <Select
                        label="چینش"
                        placeholder={null}
                        value={column.align}
                        onChange={(event) =>
                          updateColumn(index, {
                            ...column,
                            align: event.target.value as 'start' | 'center' | 'end',
                          })
                        }
                        options={[
                          { value: 'start', label: 'ابتدا (راست)' },
                          { value: 'center', label: 'وسط' },
                          { value: 'end', label: 'انتها (چپ)' },
                        ]}
                      />
                    </div>

                    <FieldShortcut
                      sources={sources}
                      rowSourceKey={rowSourceKey}
                      onPick={(expression, format) =>
                        updateColumn(index, { ...column, value: expression, format })
                      }
                    />

                    <ExpressionBuilder
                      label="مقدار سلول"
                      value={column.value}
                      onChange={(next) => updateColumn(index, { ...column, value: next })}
                      sources={sources}
                      rowSourceKey={rowSourceKey}
                    />

                    <FormatEditor
                      value={column.format}
                      onChange={(next) => updateColumn(index, { ...column, format: next })}
                    />

                    <MultilineEditor
                      column={column}
                      onChange={(next) => updateColumn(index, next)}
                      sources={sources}
                      rowSourceKey={rowSourceKey}
                    />

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={column.visibleWhen !== undefined}
                          onChange={(event) =>
                            updateColumn(index, {
                              ...column,
                              visibleWhen: event.target.checked
                                ? emptyCondition('empty')
                                : undefined,
                            })
                          }
                        />
                        نمایش مشروط این ستون
                      </label>
                      {column.visibleWhen ? (
                        <ConditionBuilder
                          label="ستون وقتی نمایش داده شود که"
                          value={column.visibleWhen}
                          onChange={(next) => updateColumn(index, { ...column, visibleWhen: next })}
                          sources={sources}
                          rowSourceKey={rowSourceKey}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/**
 * خطوط اضافی یک سلول.
 *
 * سه ستون گزارش مالیات چندخطی‌اند (طرف قرارداد/شناسه، تلفن/کدپستی، شماره/تاریخ
 * صورتحساب)؛ این همان الگو را در طراح در دسترس می‌گذارد.
 */
function MultilineEditor({
  column,
  onChange,
  sources,
  rowSourceKey,
}: {
  column: TableColumn;
  onChange: (next: TableColumn) => void;
  sources: readonly DataSourceDto[];
  rowSourceKey: string | null;
}): JSX.Element {
  const lines = column.multiline?.lines ?? [];

  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <p className="text-xs font-medium">
        خطوط اضافی سلول ({toPersianDigits(String(lines.length))} از ۴)
      </p>

      {lines.map((line, index) => (
        <div key={`line-${index}`} className="space-y-2 rounded-md bg-muted/30 p-2">
          <ExpressionBuilder
            label={`خط ${index + 2}`}
            value={line.value}
            onChange={(next) =>
              onChange({
                ...column,
                multiline: {
                  lines: lines.map((item, position) =>
                    position === index ? { ...item, value: next } : item,
                  ),
                },
              })
            }
            sources={sources}
            rowSourceKey={rowSourceKey}
          />
          <FormatEditor
            value={line.format}
            onChange={(next) =>
              onChange({
                ...column,
                multiline: {
                  lines: lines.map((item, position) =>
                    position === index ? { ...item, format: next } : item,
                  ),
                },
              })
            }
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={line.muted}
                onChange={(event) =>
                  onChange({
                    ...column,
                    multiline: {
                      lines: lines.map((item, position) =>
                        position === index ? { ...item, muted: event.target.checked } : item,
                      ),
                    },
                  })
                }
              />
              کم‌رنگ‌تر
            </label>
            <button
              type="button"
              className="text-[11px] text-destructive hover:underline"
              onClick={() => {
                const next = lines.filter((_item, position) => position !== index);
                onChange({
                  ...column,
                  multiline: next.length === 0 ? undefined : { lines: next },
                });
              }}
            >
              حذف خط
            </button>
          </div>
        </div>
      ))}

      {lines.length < 4 ? (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() =>
            onChange({
              ...column,
              multiline: {
                lines: [
                  ...lines,
                  { value: { k: 'const', type: 'text', v: '' }, format: TEXT_FORMAT, muted: true },
                ],
              },
            })
          }
        >
          افزودن خط
        </button>
      ) : null}
    </div>
  );
}

function SortEditor({
  block,
  onChange,
  rowFields,
}: {
  block: TableBlock;
  onChange: (next: TableBlock) => void;
  rowFields: readonly { value: string; label: string }[];
}): JSX.Element {
  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <p className="text-xs font-medium">
        ترتیب ردیف‌ها ({toPersianDigits(String(block.sortBy.length))} از ۵)
      </p>

      {block.sortBy.map((sort, index) => (
        <div key={`sort-${index}`} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Select
              label="بر اساس"
              placeholder="انتخاب کنید…"
              value={sort.path}
              onChange={(event) =>
                onChange({
                  ...block,
                  sortBy: block.sortBy.map((item, position) =>
                    position === index ? { ...item, path: event.target.value } : item,
                  ),
                })
              }
              options={rowFields.map((field) => ({ value: field.value, label: field.label }))}
            />
          </div>
          <div className="w-32">
            <Select
              label="جهت"
              placeholder={null}
              value={sort.dir}
              onChange={(event) =>
                onChange({
                  ...block,
                  sortBy: block.sortBy.map((item, position) =>
                    position === index
                      ? { ...item, dir: event.target.value as 'asc' | 'desc' }
                      : item,
                  ),
                })
              }
              options={[
                { value: 'asc', label: 'صعودی' },
                { value: 'desc', label: 'نزولی' },
              ]}
            />
          </div>
          <button
            type="button"
            className="pb-2 text-[11px] text-destructive hover:underline"
            onClick={() =>
              onChange({
                ...block,
                sortBy: block.sortBy.filter((_item, position) => position !== index),
              })
            }
          >
            حذف
          </button>
        </div>
      ))}

      {block.sortBy.length < 5 ? (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() =>
            onChange({ ...block, sortBy: [...block.sortBy, { path: '', dir: 'asc' }] })
          }
        >
          افزودن ترتیب
        </button>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled === true}
      onClick={onClick}
      className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export { IconButton };
