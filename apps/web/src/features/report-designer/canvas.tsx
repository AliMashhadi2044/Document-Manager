import { printableWidthMm, type Block, type TemplateV1 } from '@dm/report-engine';

import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { toPersianDigits } from '../../shared/format/money';
import { useDragList } from './drag-list';
import { IconButton } from './table-editor';
import {
  BAND_LABELS,
  BLOCK_TYPE_LABELS,
  bandBlocks,
  moveItem,
  newBlock,
  setBandBlocks,
  uniqueBlockId,
  widthReport,
  type Band,
} from './template-ops';

const BANDS: readonly Band[] = ['header', 'body', 'footer'];

const BLOCK_TYPES: readonly Block['type'][] = [
  'text',
  'variable',
  'table',
  'signatureRow',
  'signature',
  'divider',
  'spacer',
  'pageNumber',
  'generatedAt',
];

/**
 * بوم طراح: سه نوار سربرگ، بدنه و پابرگ.
 *
 * بوم عمداً **ساختار** را نشان می‌دهد، نه تصویر نهایی را. پیش‌نمایش واقعی با داده
 * واقعی یک دکمه جداست و از سرور می‌آید؛ هر تلاشی برای «شبیه‌سازی» خروجی در بوم، یک
 * پیاده‌سازی دوم از موتور چیدمان می‌شد که روزی با اصل اختلاف پیدا می‌کرد — همان
 * دامی که کل این زیرسیستم برای پرهیز از آن «قالب به‌صورت داده» ساخته شد.
 */
export function Canvas({
  template,
  onChange,
  selected,
  onSelect,
}: {
  template: TemplateV1;
  onChange: (next: TemplateV1) => void;
  selected: { band: Band; index: number } | null;
  onSelect: (selection: { band: Band; index: number } | null) => void;
}): JSX.Element {
  const firstCollection = 'document.vendorAggregates';

  function addBlock(band: Band, type: Block['type']): void {
    const blocks = [...bandBlocks(template, band)];
    const block = newBlock(type, uniqueBlockId(template, type), firstCollection);
    blocks.push(block);
    onChange(setBandBlocks(template, band, blocks));
    onSelect({ band, index: blocks.length - 1 });
  }

  return (
    <div className="space-y-4">
      {BANDS.map((band) => {
        const blocks = bandBlocks(template, band);

        return (
          <section key={band} className="rounded-lg border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
              <h3 className="text-sm font-semibold">
                {BAND_LABELS[band]}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({toPersianDigits(String(blocks.length))} عنصر)
                </span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                {band === 'body' ? null : (
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={template[band].repeatOnEveryPage}
                      onChange={(event) =>
                        onChange({
                          ...template,
                          [band]: { ...template[band], repeatOnEveryPage: event.target.checked },
                        } as TemplateV1)
                      }
                    />
                    تکرار در هر صفحه
                  </label>
                )}

                <div className="w-44">
                  <Select
                    size="sm"
                    prefsKey={`report-block-type`}
                    aria-label={`افزودن عنصر به ${BAND_LABELS[band]}`}
                    placeholder="افزودن عنصر…"
                    value=""
                    onChange={(nextValue) => {
                      if (nextValue === '') return;
                      addBlock(band, nextValue as Block['type']);
                    }}
                    options={BLOCK_TYPES.map((type) => ({
                      value: type,
                      label: BLOCK_TYPE_LABELS[type],
                    }))}
                  />
                </div>
              </div>
            </header>

            <BandList
              template={template}
              band={band}
              onChange={onChange}
              selected={selected}
              onSelect={onSelect}
            />
          </section>
        );
      })}
    </div>
  );
}

function BandList({
  template,
  band,
  onChange,
  selected,
  onSelect,
}: {
  template: TemplateV1;
  band: Band;
  onChange: (next: TemplateV1) => void;
  selected: { band: Band; index: number } | null;
  onSelect: (selection: { band: Band; index: number } | null) => void;
}): JSX.Element {
  const blocks = bandBlocks(template, band);

  function setBlocks(next: Block[]): void {
    onChange(setBandBlocks(template, band, next));
  }

  const drag = useDragList((from, to) => {
    setBlocks(moveItem(blocks, from, to));
    if (selected?.band === band && selected.index === from) onSelect({ band, index: to });
  });

  if (blocks.length === 0) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        این بخش خالی است. با «افزودن عنصر» شروع کنید.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5 p-2">
      {blocks.map((block, index) => {
        const isSelected = selected?.band === band && selected.index === index;

        return (
          <li
            key={block.id}
            {...drag.itemProps(index)}
            className={[
              'rounded-md border',
              isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background',
              drag.overIndex === index && drag.draggingIndex !== index ? 'border-primary' : '',
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

              <button
                type="button"
                className="min-w-32 flex-1 truncate text-start text-sm"
                onClick={() => onSelect(isSelected ? null : { band, index })}
              >
                <span className="font-medium">{BLOCK_TYPE_LABELS[block.type]}</span>
                <span className="ms-2 text-xs text-muted-foreground">{summarize(template, block)}</span>
              </button>

              {block.visibleWhen ? (
                <span
                  title="نمایش این عنصر مشروط است"
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  مشروط
                </span>
              ) : null}

              <div className="flex items-center gap-0.5">
                <IconButton
                  label="انتقال به بالا"
                  disabled={index === 0}
                  onClick={() => setBlocks(moveItem(blocks, index, index - 1))}
                >
                  ↑
                </IconButton>
                <IconButton
                  label="انتقال به پایین"
                  disabled={index === blocks.length - 1}
                  onClick={() => setBlocks(moveItem(blocks, index, index + 1))}
                >
                  ↓
                </IconButton>
                <IconButton
                  label="تکرار عنصر"
                  onClick={() =>
                    setBlocks([
                      ...blocks.slice(0, index + 1),
                      { ...block, id: uniqueBlockId(template, block.id) },
                      ...blocks.slice(index + 1),
                    ])
                  }
                >
                  ⧉
                </IconButton>
                <IconButton
                  label="حذف عنصر"
                  onClick={() => {
                    setBlocks(blocks.filter((_item, position) => position !== index));
                    if (isSelected) onSelect(null);
                  }}
                >
                  ✕
                </IconButton>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** یک خط خلاصه از هر عنصر، تا بوم بدون باز کردن تنظیمات هم خوانا باشد. */
function summarize(template: TemplateV1, block: Block): string {
  switch (block.type) {
    case 'text':
      return block.text.slice(0, 60);
    case 'variable':
      return block.labelFa ?? '—';
    case 'table': {
      const width = widthReport(template, block);
      const overflow =
        width.overflow > 0 ? ` · ${toPersianDigits(String(width.overflow))} م‌م سرریز` : '';
      return `${toPersianDigits(String(block.columns.length))} ستون${overflow}`;
    }
    case 'signature':
      return block.signatoryRoleKey === '' ? 'نقش انتخاب نشده' : block.signatoryRoleKey;
    case 'signatureRow':
      return `${toPersianDigits(String(block.blocks.length))} امضا`;
    case 'spacer':
      return `${toPersianDigits(String(block.heightMm))} میلی‌متر`;
    case 'pageNumber':
      return block.templateFa;
    case 'generatedAt':
      return block.labelFa;
    case 'divider':
      return '—';
  }
}

/**
 * تنظیمات صفحه.
 *
 * عرض قابل چاپ همان‌جا و همان لحظه حساب می‌شود، چون تغییر جهت یا حاشیه، مستقیماً
 * تعیین می‌کند که جدول‌ها جا می‌شوند یا بریده می‌شوند.
 */
export function PageSettings({
  template,
  onChange,
}: {
  template: TemplateV1;
  onChange: (next: TemplateV1) => void;
}): JSX.Element {
  const printable = printableWidthMm(template.page);

  return (
    <div className="space-y-3">
      <Input
        label="عنوان گزارش"
        required
        value={template.titleFa}
        maxLength={200}
        onChange={(event) => onChange({ ...template, titleFa: event.target.value })}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="اندازه کاغذ"
          placeholder={null}
          value={template.page.size}
          onChange={(nextValue) =>
            onChange({
              ...template,
              page: { ...template.page, size: nextValue as 'A4' | 'A5' | 'A3' | 'LETTER' },
            })
          }
          options={[
            { value: 'A4', label: 'A4' },
            { value: 'A5', label: 'A5' },
            { value: 'A3', label: 'A3' },
            { value: 'LETTER', label: 'Letter' },
          ]}
        />
        <Select
          label="جهت صفحه"
          placeholder={null}
          value={template.page.orientation}
          onChange={(nextValue) =>
            onChange({
              ...template,
              page: {
                ...template.page,
                orientation: nextValue as 'portrait' | 'landscape',
              },
            })
          }
          options={[
            { value: 'portrait', label: 'عمودی' },
            { value: 'landscape', label: 'افقی' },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ['top', 'حاشیه بالا'],
            ['bottom', 'حاشیه پایین'],
            ['inlineStart', 'حاشیه راست'],
            ['inlineEnd', 'حاشیه چپ'],
          ] as const
        ).map(([key, label]) => (
          <Input
            key={key}
            label={label}
            type="number"
            min={0}
            max={100}
            value={template.page.margins[key]}
            onChange={(event) =>
              onChange({
                ...template,
                page: {
                  ...template.page,
                  margins: { ...template.page.margins, [key]: Number(event.target.value) },
                },
              })
            }
          />
        ))}
      </div>

      <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
        عرض قابل چاپ با این تنظیمات: {toPersianDigits(String(printable))} میلی‌متر
      </p>

      <details className="rounded-md border border-border p-2.5">
        <summary className="cursor-pointer text-xs font-medium">قلم و خطوط</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="نام قلم"
            dir="ltr"
            value={template.styles.fontFamily}
            maxLength={100}
            onChange={(event) =>
              onChange({
                ...template,
                styles: { ...template.styles, fontFamily: event.target.value },
              })
            }
          />
          <Input
            label="اندازه قلم پایه (pt)"
            type="number"
            min={5}
            max={24}
            value={template.styles.baseFontSizePt}
            onChange={(event) =>
              onChange({
                ...template,
                styles: { ...template.styles, baseFontSizePt: Number(event.target.value) },
              })
            }
          />
          <Input
            label="اندازه قلم سرصفحه (pt)"
            type="number"
            min={5}
            max={36}
            value={template.styles.headingFontSizePt}
            onChange={(event) =>
              onChange({
                ...template,
                styles: { ...template.styles, headingFontSizePt: Number(event.target.value) },
              })
            }
          />
          <Input
            label="اندازه قلم جدول (pt)"
            type="number"
            min={5}
            max={20}
            value={template.styles.tableFontSizePt}
            onChange={(event) =>
              onChange({
                ...template,
                styles: { ...template.styles, tableFontSizePt: Number(event.target.value) },
              })
            }
          />
          <Input
            label="ضخامت خط جدول (px)"
            type="number"
            min={0}
            max={5}
            value={template.styles.borderWidthPx}
            onChange={(event) =>
              onChange({
                ...template,
                styles: { ...template.styles, borderWidthPx: Number(event.target.value) },
              })
            }
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          پالت خروجی چاپی سیاه‌وسفید است و رنگ‌ها عمداً در طراح تنظیم نمی‌شوند: خروجی
          روی چاپگر سیاه‌وسفید سازمان خوانا بماند.
        </p>
      </details>
    </div>
  );
}
