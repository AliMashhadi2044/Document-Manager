/**
 * چیدمان: قالب + داده ← سند میانی.
 *
 * این لایه **هیچ HTML تولید نمی‌کند** و هیچ چیز را escape نمی‌کند؛ خروجی‌اش داده‌ای
 * است که هم رندر HTML و هم خروجی Excel از آن ساخته می‌شوند. دلیلش ساده است: اگر جدول
 * فقط داخل تولیدکننده HTML وجود داشت، Excel مجبور بود همان قواعد را دوباره پیاده کند
 * و روزی یکی از آن دو عقب می‌ماند.
 *
 * **هیچ دسترسی به دیتابیس اینجا نیست** (docs/09 §۱): ورودی، داده‌ای است که لایه API با
 * مجوز کاربر اجراکننده حل کرده است.
 */

import { numberToPersianWords, type RoundingMode } from '@dm/shared';

import {
  conditionNodes,
  expressionNodes,
} from './expression.js';
import {
  evaluateCondition,
  evaluateExpression,
  readPath,
  toValue,
  ReportEvaluationError,
  type EvaluationScope,
} from './evaluate.js';
import { formatValue } from './format.js';
import {
  allBlocks,
  textPlaceholders,
  type Block,
  type TableBlock,
  type TemplateV1,
} from './template.js';
import type { Value } from './types.js';

export const MAX_TABLE_ROWS = 50_000;

export interface SignatorySnapshot {
  readonly roleKey: string;
  readonly fullName: string;
  readonly positionTitle: string;
}

export interface ReportDataset {
  /** داده‌های تکی، با مسیرهای نقطه‌ای مثل `document.title`. */
  readonly values: Record<string, unknown>;
  /** مجموعه‌ها، با کلید منبع داده مثل `document.vendorAggregates`. */
  readonly collections: Record<string, readonly Record<string, unknown>[]>;
  readonly signatories: readonly SignatorySnapshot[];
  readonly roundingMode: RoundingMode;
  /** زمان تولید، به‌صورت ISO؛ ورودی است نه `new Date()` داخلی، تا خروجی بازتولیدپذیر بماند. */
  readonly generatedAt: string;
}

export interface LaidOutCell {
  readonly text: string;
  /** مقدار خام برای Excel؛ `bigint` یعنی سلول عددی واقعی. */
  readonly raw: Value;
  readonly align: 'start' | 'center' | 'end';
  /** خطوط اضافی همان سلول. */
  readonly extraLines: readonly { readonly text: string; readonly muted: boolean }[];
}

export interface LaidOutTable {
  readonly kind: 'table';
  readonly id: string;
  readonly columns: readonly {
    readonly key: string;
    readonly titleFa: string;
    readonly width: { unit: 'mm' | 'percent' | 'auto'; value?: number | undefined };
    readonly align: 'start' | 'center' | 'end';
    readonly isNumeric: boolean;
  }[];
  readonly rows: readonly (readonly LaidOutCell[])[];
  /**
   * ردیف‌های خالیِ پرکننده تا `minRows` — ساخته‌شده، نه فقط شمرده‌شده.
   *
   * پیش از این فقط تعدادشان می‌آمد و هر خروجی‌گیر خودش می‌ساختشان؛ نتیجه این بود
   * که در HTML هر ستون عددی «۰» می‌گرفت. ردیفِ خالی یعنی خالی: فقط شمارهٔ ردیف
   * دارد، که شمارش را پیوسته نگه می‌دارد.
   */
  readonly fillerRows: readonly (readonly LaidOutCell[])[];
  readonly totals: readonly LaidOutCell[] | null;
  /**
   * پهنای هر سلول ردیف جمع، به تعداد ستون.
   *
   * `0` یعنی این سلول را رد کن؛ سلولِ پیش از آن پوشانده‌اش. لازم شد چون جمعِ
   * نوشته‌شده به حروف در یک ستون باریک جا نمی‌شود و باید تا ستون عددی بعدی کشیده
   * شود — همان کاری که فرم کاغذی با ادغام خانه‌ها می‌کند.
   *
   * ستون‌هایی که برچسب «جمع کل» می‌پوشاندشان هم اینجا `0`اند؛ `totalsLabelSpan`
   * پهنای خودِ برچسب را می‌گوید.
   */
  readonly totalsSpans: readonly number[];
  readonly totalsLabel: string | null;
  /**
   * چند ستون را برچسب «جمع کل» می‌پوشاند.
   *
   * ستون اول «ردیف» است و عرضش چند میلی‌متر؛ نوشتن «جمع کل» در همان، متن را
   * می‌شکند و از سلول بیرون می‌زند. برچسب ستون‌های ابتدایی را — همان‌هایی که جمع
   * ندارند — با هم می‌گیرد، مثل خودِ فرم کاغذی.
   */
  readonly totalsLabelSpan: number;
  readonly repeatHeaderOnNewPage: boolean;
  readonly avoidRowBreak: boolean;
}

export interface LaidOutText {
  readonly kind: 'text';
  readonly id: string;
  readonly text: string;
  readonly align: 'start' | 'center' | 'end';
  readonly bold: boolean;
  readonly fontSizePt: number | null;
}

export interface LaidOutVariable {
  readonly kind: 'variable';
  readonly id: string;
  readonly labelFa: string | null;
  readonly text: string;
  readonly align: 'start' | 'center' | 'end';
}

export interface LaidOutSignature {
  readonly kind: 'signature';
  readonly id: string;
  readonly positionTitle: string;
  readonly fullName: string;
  readonly align: 'start' | 'center' | 'end';
  readonly spaceMm: number;
}

export interface LaidOutSignatureRow {
  readonly kind: 'signatureRow';
  readonly id: string;
  readonly blocks: readonly LaidOutSignature[];
}

export interface LaidOutDivider {
  readonly kind: 'divider';
  readonly id: string;
}
export interface LaidOutSpacer {
  readonly kind: 'spacer';
  readonly id: string;
  readonly heightMm: number;
}
export interface LaidOutPageNumber {
  readonly kind: 'pageNumber';
  readonly id: string;
  readonly templateFa: string;
}

export type LaidOutBlock =
  | LaidOutTable
  | LaidOutText
  | LaidOutVariable
  | LaidOutSignature
  | LaidOutSignatureRow
  | LaidOutDivider
  | LaidOutSpacer
  | LaidOutPageNumber;

export interface LaidOutReport {
  readonly titleFa: string;
  readonly page: TemplateV1['page'];
  readonly styles: TemplateV1['styles'];
  readonly header: readonly LaidOutBlock[];
  readonly repeatHeader: boolean;
  readonly body: readonly LaidOutBlock[];
  readonly footer: readonly LaidOutBlock[];
  readonly repeatFooter: boolean;
  readonly generatedAt: string;
}

export interface LayoutOptions {
  /**
   * جایگزینیِ متنِ بلوک‌های متنی، با کلید شناسهٔ بلوک.
   *
   * قالب می‌گوید چه چیزی **معمولاً** بالای گزارش بنشیند؛ ولی یک خروجی مشخص گاهی
   * عنوان یا توضیح دیگری می‌خواهد — نامهٔ همراه، اصلاحیه، عبارتی که اداره خواسته.
   * تا پیش از این، تنها راهش عوض کردن خودِ قالب بود: یعنی عوض کردن همهٔ گزارش‌های
   * بعدی برای یک بار.
   *
   * جایگزینی **پس از** جای‌گذاری متغیرها اعمال می‌شود؛ کاربر همان متن نهایی را
   * می‌بیند و ویرایش می‌کند، نه قالب `{{...}}` را. پس اینجا هیچ متغیری تفسیر
   * نمی‌شود و متن کاربر همان‌طور که هست می‌نشیند.
   */
  readonly textOverrides?: Readonly<Record<string, string>> | undefined;
}

export function layoutReport(
  template: TemplateV1,
  dataset: ReportDataset,
  options: LayoutOptions = {},
): LaidOutReport {
  const scope = makeScope(dataset);
  const overrides = options.textOverrides ?? {};

  const applyOverrides = (blocks: readonly LaidOutBlock[]): LaidOutBlock[] =>
    blocks.map((block) =>
      block.kind === 'text' && overrides[block.id] !== undefined
        ? { ...block, text: overrides[block.id] as string }
        : block,
    );

  return {
    titleFa: template.titleFa,
    page: template.page,
    styles: template.styles,
    header: applyOverrides(layoutBlocks(template.header.blocks, scope, dataset)),
    repeatHeader: template.header.repeatOnEveryPage,
    body: applyOverrides(layoutBlocks(template.body, scope, dataset)),
    footer: applyOverrides(layoutBlocks(template.footer.blocks, scope, dataset)),
    repeatFooter: template.footer.repeatOnEveryPage,
    generatedAt: dataset.generatedAt,
  };
}

function makeScope(dataset: ReportDataset): EvaluationScope {
  return {
    read: (path) => readPath(dataset.values, path),
    list: (path) => dataset.collections[path],
    roundingMode: dataset.roundingMode,
  };
}

function layoutBlocks(
  blocks: readonly Block[],
  scope: EvaluationScope,
  dataset: ReportDataset,
): LaidOutBlock[] {
  const out: LaidOutBlock[] = [];

  for (const block of blocks) {
    if (block.visibleWhen && !evaluateCondition(block.visibleWhen, scope)) continue;
    const laidOut = layoutBlock(block, scope, dataset);
    if (laidOut) out.push(laidOut);
  }

  return out;
}

function layoutBlock(
  block: Block,
  scope: EvaluationScope,
  dataset: ReportDataset,
): LaidOutBlock | null {
  switch (block.type) {
    case 'text':
      return {
        kind: 'text',
        id: block.id,
        text: interpolate(block.text, scope),
        align: block.align,
        bold: block.bold,
        fontSizePt: block.fontSizePt ?? null,
      };

    case 'variable':
      return {
        kind: 'variable',
        id: block.id,
        labelFa: block.labelFa ?? null,
        text: formatValue(evaluateExpression(block.value, scope), block.format),
        align: block.align,
      };

    case 'table':
      return layoutTable(block, scope, dataset);

    case 'signature':
      return layoutSignature(block, dataset);

    case 'signatureRow':
      return {
        kind: 'signatureRow',
        id: block.id,
        blocks: block.blocks
          .filter((item) => !item.visibleWhen || evaluateCondition(item.visibleWhen, scope))
          .map((item) => layoutSignature(item, dataset)),
      };

    case 'divider':
      return { kind: 'divider', id: block.id };

    case 'spacer':
      return { kind: 'spacer', id: block.id, heightMm: block.heightMm };

    case 'pageNumber':
      return { kind: 'pageNumber', id: block.id, templateFa: block.templateFa };

    case 'generatedAt':
      return {
        kind: 'variable',
        id: block.id,
        labelFa: block.labelFa,
        text: formatValue(dataset.generatedAt, {
          kind: 'jalaliDate',
          persianDigits: true,
          thousandSeparator: false,
          decimals: 0,
          emptyText: '',
        }),
        align: 'start',
      };
  }
}

function layoutSignature(
  block: Extract<Block, { type: 'signature' }>,
  dataset: ReportDataset,
): LaidOutSignature {
  const signatory = dataset.signatories.find((item) => item.roleKey === block.signatoryRoleKey);

  return {
    kind: 'signature',
    id: block.id,
    // امضاکننده ثبت‌نشده، بلوک را حذف نمی‌کند: کادر امضا با نام خالی چاپ می‌شود تا
    // جای امضای دستی بماند. حذف بلوک، چیدمان پابرگ را به‌هم می‌ریخت.
    positionTitle: signatory?.positionTitle ?? '',
    fullName: signatory?.fullName ?? '',
    align: block.align,
    spaceMm: block.spaceMm,
  };
}

function layoutTable(
  block: TableBlock,
  scope: EvaluationScope,
  dataset: ReportDataset,
): LaidOutTable {
  const source = dataset.collections[block.dataSource];
  if (!source) {
    throw new ReportEvaluationError(
      `منبع داده «${block.dataSource}» در داده گزارش وجود ندارد`,
      'UNKNOWN_DATA_SOURCE',
    );
  }
  if (source.length > MAX_TABLE_ROWS) {
    throw new ReportEvaluationError(
      `تعداد ردیف‌های جدول از حد مجاز (${MAX_TABLE_ROWS}) بیشتر است`,
      'TABLE_TOO_LARGE',
    );
  }

  const columns = block.columns.filter(
    (column) => !column.visibleWhen || evaluateCondition(column.visibleWhen, scope),
  );

  const ordered = sortRows(source, block.sortBy);

  const rows = ordered.map((row, index) => {
    const rowScope = rowScopeFor(scope, row, index);
    return columns.map((column): LaidOutCell => {
      const raw = evaluateExpression(column.value, rowScope);
      return {
        text: formatValue(raw, column.format),
        raw,
        align: column.align,
        /*
          خط خالی، خط نیست.

          ستون «شماره صورت‌حساب — تاریخ» وقتی تاریخ ندارد نباید نیمهٔ خالی بسازد؛
          سلول باید مثل یک سلول معمولی دیده شود. پس خط‌های بی‌متن حذف می‌شوند و
          تصمیمِ «این سلول دوبخشی است یا نه» به خروجی‌گیر می‌رسد، نه به حدس او.
        */
        extraLines: (column.multiline?.lines ?? [])
          .map((line) => ({
            text: formatValue(evaluateExpression(line.value, rowScope), line.format),
            muted: line.muted,
          }))
          .filter((line) => line.text !== ''),
      };
    });
  });

  /** جمع خام یک ستون، از **مقادیر همان ستون** و نه از محاسبهٔ دوباره. */
  const sumOfColumn = (key: string): bigint => {
    const columnIndex = columns.findIndex((column) => column.key === key);
    if (columnIndex === -1) return 0n;

    let sum = 0n;
    for (const row of rows) {
      const cell = row[columnIndex];
      if (cell && typeof cell.raw === 'bigint') sum += cell.raw;
    }
    return sum;
  };

  const totals = block.totalsRow?.enabled
    ? columns.map((column): LaidOutCell => {
        const aggregate = block.totalsRow?.cells[column.key] ?? 'none';

        if (typeof aggregate === 'object') {
          // جمع از ستونی می‌آید که `of` می‌گوید؛ ستونِ خودِ حروف متنی است و جمعش صفر.
          const sum = sumOfColumn(aggregate.of);
          const words = numberToPersianWords(sum);
          return {
            text: aggregate.suffix === '' ? words : `${words} ${aggregate.suffix}`,
            raw: sum,
            align: 'center',
            extraLines: [],
          };
        }

        if (aggregate === 'none') {
          return { text: '', raw: null, align: column.align, extraLines: [] };
        }
        if (aggregate === 'count') {
          const count = BigInt(rows.length);
          return {
            text: formatValue(count, column.format),
            raw: count,
            align: column.align,
            extraLines: [],
          };
        }

        // جمع ستون از **مقادیر خام همان ستون** گرفته می‌شود، نه از محاسبه دوباره:
        // اگر فردا عبارت ستون عوض شود، جمع هم با آن عوض می‌شود.
        const sum = sumOfColumn(column.key);
        return {
          text: formatValue(sum, column.format),
          raw: sum,
          align: column.align,
          extraLines: [],
        };
      })
    : null;

  /*
    ردیف‌های پرکننده.

    فقط ستونِ شمارهٔ ردیف پر می‌شود و شمارش از آخرین ردیف واقعی ادامه می‌یابد؛
    بقیهٔ سلول‌ها خالی‌اند. «۰» در ستون مبلغِ یک ردیفِ خالی، عددی است که وجود
    ندارد — و در یک فرم مالی، عدد نبودن با صفر بودن یکی نیست.
  */
  const fillerCount = Math.max(0, block.minRows - rows.length);
  const fillerRows = Array.from({ length: fillerCount }, (_unused, offset) =>
    columns.map((column): LaidOutCell => {
      if (!column.rowNumber) {
        return { text: '', raw: null, align: column.align, extraLines: [] };
      }
      const number = BigInt(rows.length + offset + 1);
      return {
        text: formatValue(number, column.format),
        raw: number,
        align: column.align,
        extraLines: [],
      };
    }),
  );

  /*
    گسترهٔ برچسب جمع: ستون‌های ابتدایی که جمعی ندارند.

    حداقل یک ستون، تا وقتی جدول هیچ ستون جمع‌داری ندارد هم برچسب جایی داشته باشد.
  */
  const firstAggregated = columns.findIndex(
    (column) => (block.totalsRow?.cells[column.key] ?? 'none') !== 'none',
  );
  /** آیا این ستون در ردیف جمع، «جمع به حروف» است؟ */
  const isWords = (key: string): boolean => {
    const cell = block.totalsRow?.cells[key];
    return typeof cell === 'object' && cell.kind === 'sumInWords';
  };
  const totalsLabelSpan = firstAggregated === -1 ? 1 : Math.max(1, firstAggregated);

  /*
    پهنای سلول‌های ردیف جمع.

    قاعده یک خط است: هر سلول یک ستون است، مگر سلولِ «جمع به حروف» که تا ستون
    تجمیع‌شدهٔ بعدی کشیده می‌شود. ستون‌هایی که برچسب یا یک سلولِ کشیده پوشانده،
    پهنای صفر می‌گیرند تا خروجی‌گیرها ردشان کنند.
  */
  const totalsSpans: number[] = columns.map((_column, index) => (index < totalsLabelSpan ? 0 : 1));
  if (totalsSpans.length > 0) totalsSpans[0] = totalsLabelSpan;

  for (let index = totalsLabelSpan; index < columns.length; index += 1) {
    const column = columns[index] as (typeof columns)[number];
    if (!isWords(column.key)) continue;

    let end = index + 1;
    while (
      end < columns.length &&
      (block.totalsRow?.cells[(columns[end] as (typeof columns)[number]).key] ?? 'none') === 'none'
    ) {
      end += 1;
    }

    totalsSpans[index] = end - index;
    for (let covered = index + 1; covered < end; covered += 1) totalsSpans[covered] = 0;
    index = end - 1;
  }

  return {
    kind: 'table',
    id: block.id,
    columns: columns.map((column) => ({
      key: column.key,
      titleFa: column.titleFa,
      width: { unit: column.width.unit, value: column.width.value },
      align: column.align,
      isNumeric: column.format.kind === 'currency' || column.format.kind === 'integer',
    })),
    rows,
    fillerRows,
    totals,
    totalsSpans,
    totalsLabel: block.totalsRow?.enabled ? block.totalsRow.labelFa : null,
    totalsLabelSpan,
    repeatHeaderOnNewPage: block.pagination.repeatHeaderOnNewPage,
    avoidRowBreak: block.pagination.avoidRowBreak,
  };
}

function rowScopeFor(
  scope: EvaluationScope,
  row: Record<string, unknown>,
  index: number,
): EvaluationScope {
  return {
    ...scope,
    read: (path) => {
      if (path === 'row.index') return index + 1;
      if (path.startsWith('row.')) return readPath(row, path.slice(4));
      return scope.read(path);
    },
  };
}

function sortRows(
  rows: readonly Record<string, unknown>[],
  sortBy: readonly { path: string; dir: 'asc' | 'desc' }[],
): readonly Record<string, unknown>[] {
  if (sortBy.length === 0) return rows;

  // مرتب‌سازی پایدار: ترتیب ورودی برای مقادیر برابر حفظ می‌شود، پس خروجی بازتولیدپذیر است.
  return [...rows].sort((a, b) => {
    for (const rule of sortBy) {
      const left = toValue(readPath(a, rule.path.replace(/^row\./u, '')));
      const right = toValue(readPath(b, rule.path.replace(/^row\./u, '')));
      const comparison = compareValues(left, right);
      if (comparison !== 0) return rule.dir === 'asc' ? comparison : -comparison;
    }
    return 0;
  });
}

function compareValues(left: Value, right: Value): number {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  if (typeof left === 'bigint' && typeof right === 'bigint') {
    return left === right ? 0 : left < right ? -1 : 1;
  }
  const a = String(left);
  const b = String(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * جای‌گذاری `{{path}}` در متن.
 *
 * مقدارها **به‌صورت متن خام** برمی‌گردند و escape کردنشان کار رندر HTML است؛ اینجا
 * عمداً هیچ HTML‌ای ساخته نمی‌شود تا فرار از escape ممکن نباشد.
 */
function interpolate(text: string, scope: EvaluationScope): string {
  let out = text;
  for (const path of textPlaceholders(text)) {
    const value = toValue(scope.read(path));
    const replacement = value === null ? '' : String(value);
    out = out.replaceAll(new RegExp(`\\{\\{\\s*${escapeRegExp(path)}\\s*\\}\\}`, 'gu'), replacement);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * شمارش گره‌های یک قالب — سقف `MAX_TEMPLATE_NODES` پیش از ذخیره بررسی می‌شود.
 *
 * گره‌های **عبارت‌ها** هم شمرده می‌شوند، نه فقط بلوک‌ها و ستون‌ها. نسخه اول این تابع
 * تنها بلوک و ستون می‌شمرد و در نتیجه سقف عملاً دست‌نیافتنی بود: حتی قالبی با حداکثر
 * تعداد بلوک و ستونِ مجازِ schema هم به ۵۰۰۰ نمی‌رسید، در حالی که بزرگ‌شدن واقعی یک
 * قالب از سمت عبارت‌های تودرتو می‌آید.
 */
export function countTemplateNodes(template: TemplateV1): number {
  let count = 0;

  for (const block of allBlocks(template)) {
    count += 1;
    if (block.visibleWhen) count += conditionNodes(block.visibleWhen);

    switch (block.type) {
      case 'variable':
        count += expressionNodes(block.value);
        break;

      case 'table':
        for (const column of block.columns) {
          count += 1 + expressionNodes(column.value);
          if (column.visibleWhen) count += conditionNodes(column.visibleWhen);
          for (const line of column.multiline?.lines ?? []) {
            count += expressionNodes(line.value);
          }
        }
        break;

      default:
        break;
    }
  }

  return count;
}
