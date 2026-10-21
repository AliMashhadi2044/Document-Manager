import type { Block, SignatureBlock, TemplateV1 } from '@dm/report-engine';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import {
  ConditionBuilder,
  ExpressionBuilder,
  FieldShortcut,
  FormatEditor,
} from './expression-builder';
import { TableEditor } from './table-editor';
import { BLOCK_TYPE_LABELS, emptyCondition } from './template-ops';
import type { DataSourceDto, SignatoryRole } from './templates.api';

const ALIGN_OPTIONS = [
  { value: 'start', label: 'ابتدا (راست)' },
  { value: 'center', label: 'وسط' },
  { value: 'end', label: 'انتها (چپ)' },
];

/**
 * پنل تنظیمات عنصر انتخاب‌شده.
 *
 * هر نوع بلوک فرم خودش را دارد و فرم‌ها **از schema قالب** می‌آیند، نه از حدس: اگر
 * فیلدی در schema نیست، در این پنل هم نیست. پس هیچ‌وقت نمی‌شود چیزی را تنظیم کرد که
 * موتور آن را نمی‌خواند.
 */
export function BlockSettings({
  template,
  block,
  onChange,
  sources,
  signatories,
}: {
  template: TemplateV1;
  block: Block;
  onChange: (next: Block) => void;
  sources: readonly DataSourceDto[];
  signatories: readonly SignatoryRole[];
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">تنظیمات {BLOCK_TYPE_LABELS[block.type]}</h3>
        <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
          {block.id}
        </code>
      </div>

      {block.type === 'text' ? (
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium">متن</span>
            <textarea
              value={block.text}
              maxLength={2000}
              rows={3}
              onChange={(event) => onChange({ ...block, text: event.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <span className="block text-xs text-muted-foreground">
              متغیر را به شکل {'{{document.title}}'} بنویسید. مقدار جای‌گذاری‌شده کامل
              escape می‌شود، پس تگ یا کد در داده هیچ اثری ندارد.
            </span>
          </label>

          <PlaceholderHelp sources={sources} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="چینش"
              placeholder={null}
              value={block.align}
              onChange={(nextValue) =>
                onChange({ ...block, align: nextValue as 'start' | 'center' | 'end' })
              }
              options={ALIGN_OPTIONS}
            />
            <Input
              label="اندازه قلم (pt)"
              type="number"
              min={5}
              max={36}
              value={block.fontSizePt ?? ''}
              hint="خالی یعنی اندازه پیش‌فرض قالب"
              onChange={(event) =>
                onChange({
                  ...block,
                  fontSizePt: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.bold}
              onChange={(event) => onChange({ ...block, bold: event.target.checked })}
            />
            درشت (bold)
          </label>
        </div>
      ) : null}

      {block.type === 'variable' ? (
        <div className="space-y-3">
          <Input
            label="برچسب"
            value={block.labelFa ?? ''}
            maxLength={200}
            hint="خالی یعنی بدون برچسب، فقط مقدار"
            onChange={(event) =>
              onChange({
                ...block,
                labelFa: event.target.value === '' ? undefined : event.target.value,
              })
            }
          />
          <Select
            label="چینش"
            placeholder={null}
            value={block.align}
            onChange={(nextValue) =>
              onChange({ ...block, align: nextValue as 'start' | 'center' | 'end' })
            }
            options={ALIGN_OPTIONS}
          />
          <FieldShortcut
            sources={sources}
            rowSourceKey={null}
            onPick={(expression, format) => onChange({ ...block, value: expression, format })}
          />
          <ExpressionBuilder
            label="مقدار"
            value={block.value}
            onChange={(next) => onChange({ ...block, value: next })}
            sources={sources}
            rowSourceKey={null}
          />
          <FormatEditor
            value={block.format}
            onChange={(next) => onChange({ ...block, format: next })}
          />
        </div>
      ) : null}

      {block.type === 'table' ? (
        <TableEditor
          template={template}
          block={block}
          onChange={(next) => onChange(next)}
          sources={sources}
        />
      ) : null}

      {block.type === 'signature' ? (
        <SignatureSettings
          block={block}
          signatories={signatories}
          onChange={(next) => onChange(next)}
        />
      ) : null}

      {block.type === 'signatureRow' ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            بلوک‌های این ردیف در یک خط و با فاصله برابر چاپ می‌شوند — مثل «مسئول
            کارپردازی» در راست و «مدیرکل» در چپ.
          </p>
          {block.blocks.map((item, index) => (
            <div key={item.id} className="space-y-2 rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">امضای {index + 1}</span>
                {block.blocks.length > 1 ? (
                  <button
                    type="button"
                    className="text-[11px] text-destructive hover:underline"
                    onClick={() =>
                      onChange({
                        ...block,
                        blocks: block.blocks.filter((_entry, position) => position !== index),
                      })
                    }
                  >
                    حذف
                  </button>
                ) : null}
              </div>
              <SignatureSettings
                block={item}
                signatories={signatories}
                onChange={(next) =>
                  onChange({
                    ...block,
                    blocks: block.blocks.map((entry, position) =>
                      position === index ? (next as SignatureBlock) : entry,
                    ),
                  })
                }
              />
            </div>
          ))}
          {block.blocks.length < 4 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                onChange({
                  ...block,
                  blocks: [
                    ...block.blocks,
                    {
                      id: `${block.id}-${block.blocks.length + 1}`,
                      type: 'signature',
                      signatoryRoleKey: '',
                      align: 'center',
                      spaceMm: 18,
                    },
                  ],
                })
              }
            >
              افزودن امضا
            </Button>
          ) : null}
        </div>
      ) : null}

      {block.type === 'spacer' ? (
        <Input
          label="ارتفاع (میلی‌متر)"
          type="number"
          min={0}
          max={100}
          value={block.heightMm}
          onChange={(event) => onChange({ ...block, heightMm: Number(event.target.value) })}
        />
      ) : null}

      {block.type === 'pageNumber' ? (
        <Input
          label="الگوی شماره صفحه"
          value={block.templateFa}
          maxLength={100}
          hint="{{page}} و {{pages}} را موتور چاپ پر می‌کند"
          onChange={(event) => onChange({ ...block, templateFa: event.target.value })}
        />
      ) : null}

      {block.type === 'generatedAt' ? (
        <Input
          label="برچسب تاریخ تولید"
          value={block.labelFa}
          maxLength={100}
          onChange={(event) => onChange({ ...block, labelFa: event.target.value })}
        />
      ) : null}

      {block.type === 'divider' ? (
        <p className="text-xs text-muted-foreground">خط جداکننده تنظیمی ندارد.</p>
      ) : null}

      {/*
        شرط نمایش بلوک در دامنه ردیف نیست: بلوک پیش از وجود هر ردیفی تصمیم می‌گیرد که
        چاپ شود یا نه، پس فیلدهای «ردیف» اینجا در دسترس نیستند.
      */}
      <div className="space-y-2 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={block.visibleWhen !== undefined}
            onChange={(event) =>
              onChange({
                ...block,
                visibleWhen: event.target.checked ? emptyCondition('empty') : undefined,
              })
            }
          />
          نمایش مشروط این عنصر
        </label>
        {block.visibleWhen ? (
          <ConditionBuilder
            label="این عنصر وقتی چاپ شود که"
            value={block.visibleWhen}
            onChange={(next) => onChange({ ...block, visibleWhen: next })}
            sources={sources}
            rowSourceKey={null}
          />
        ) : null}
      </div>
    </div>
  );
}

function SignatureSettings({
  block,
  signatories,
  onChange,
}: {
  block: SignatureBlock;
  signatories: readonly SignatoryRole[];
  onChange: (next: SignatureBlock) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      <Select
        label="نقش امضاکننده"
        required
        placeholder="انتخاب کنید…"
        value={block.signatoryRoleKey}
        onChange={(nextValue) => onChange({ ...block, signatoryRoleKey: nextValue })}
        options={signatories.map((item) => ({
          value: item.roleKey,
          label: `${item.positionTitle} — ${item.fullName}`,
        }))}
        hint="نام و سمت در لحظه تولید خروجی خوانده می‌شوند، نه از قالب"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="چینش"
          placeholder={null}
          value={block.align}
          onChange={(nextValue) =>
            onChange({ ...block, align: nextValue as 'start' | 'center' | 'end' })
          }
          options={ALIGN_OPTIONS}
        />
        <Input
          label="فضای امضا (میلی‌متر)"
          type="number"
          min={0}
          max={60}
          value={block.spaceMm}
          onChange={(event) => onChange({ ...block, spaceMm: Number(event.target.value) })}
        />
      </div>
    </div>
  );
}

/** فهرست متغیرهایی که در بلوک متنی می‌شود نوشت — بدون نیاز به حفظ کردن مسیرها. */
function PlaceholderHelp({ sources }: { sources: readonly DataSourceDto[] }): JSX.Element {
  const singles = sources.filter((source) => source.cardinality === 'single');

  return (
    <details className="rounded-md border border-border p-2.5">
      <summary className="cursor-pointer text-xs font-medium">متغیرهای در دسترس</summary>
      <div className="mt-2 space-y-2">
        {singles.map((source) => (
          <div key={source.key}>
            <p className="text-[11px] font-medium text-muted-foreground">{source.titleFa}</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {source.fields.map((field) => (
                <li
                  key={field.key}
                  dir="ltr"
                  title={field.titleFa}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {`{{${source.key}.${field.key}}}`}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
