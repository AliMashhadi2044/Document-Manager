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
  type TableColumn,
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
  /**
   * این سلول پس‌زمینهٔ خاکستری می‌گیرد (`shadeWhen` ستون).
   *
   * فقط **نشان** است و نه رنگ: اینکه خاکستری چقدر روشن باشد، تصمیم خروجی‌گیر
   * است — HTML و Excel دو رسانهٔ متفاوتند. رنگ متن در هیچ‌کدام عوض نمی‌شود.
   */
  readonly shaded: boolean;
}

export interface LaidOutTable {
  readonly kind: 'table';
  readonly id: string;
  readonly columns: readonly {
    readonly key: string;
    readonly titleFa: string;
    /**
     * خط دوم سرستون؛ `null` یعنی سرستون یک‌خطی.
     *
     * وقتی **هر** ستونی زیرعنوان داشته باشد، سرستون جدول دو طبقه می‌شود و ستون‌های
     * بی‌زیرعنوان هر دو طبقه را می‌گیرند — همان کاری که فرم کاغذی با ادغام عمودی
     * خانه می‌کند.
     */
    readonly subtitleFa: string | null;
    readonly width: { unit: 'mm' | 'percent' | 'auto'; value?: number | undefined };
    readonly align: 'start' | 'center' | 'end';
    readonly isNumeric: boolean;
    /**
     * روی کاغذ نمی‌آید.
     *
     * در چیدمانِ `print` چنین ستونی اصلاً ساخته نشده است؛ این نشان برای چیدمانِ
     * `screen` است، تا نمایش‌دهندهٔ صفحه هنگام چاپِ مرورگر خودش پنهانش کند.
     */
    readonly screenOnly: boolean;
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

/**
 * متنِ بلوک «شماره صفحه»، اگر قالب چنین بلوکی داشته باشد.
 *
 * HTML شمارهٔ صفحه را نمی‌داند و این بلوک را رندر نمی‌کند؛ تولیدکنندهٔ PDF از
 * همین تابع متنش را می‌گیرد و به پابرگِ چاپ می‌دهد. اولین بلوک برنده است —
 * دو پابرگِ شماره‌دار روی یک صفحه معنا ندارد.
 */
export function pageNumberTemplateOf(report: LaidOutReport): string | null {
  for (const band of [report.footer, report.header, report.body]) {
    for (const block of band) {
      if (block.kind === 'pageNumber') return block.templateFa;
    }
  }
  return null;
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
  /**
   * این چیدمان برای **صفحه** است یا برای **کاغذ**.
   *
   * تنها فرقشان ستون‌های `screenOnly` است: روی صفحه هستند و روی کاغذ نه. حذف
   * در همین‌جا و پیش از ساختِ چیدمان انجام می‌شود، پس ردیف جمع، ادغام خانه‌ها و
   * ردیف‌های پرکننده همه با همان کدِ موجود برای ستون‌های واقعیِ همان خروجی حساب
   * می‌شوند — نه با یک حذفِ بعدی در خروجی‌گیر که باید پهنای سلول‌ها را از نو
   * بشمارد.
   *
   * پیش‌فرض `'screen'` است: خروجیِ کامل، و هر فراخوانِ موجود بدون تغییر همان را
   * می‌گیرد.
   */
  readonly target?: 'screen' | 'print' | undefined;
}

/**
 * قالب، آن‌طور که این خروجی می‌بیندش.
 *
 * برای کاغذ، ستون‌های «فقط صفحه» از جدول‌ها برداشته می‌شوند. جدولی که ستونی از
 * دست نمی‌دهد، دست‌نخورده برمی‌گردد تا بی‌دلیل شیء تازه ساخته نشود.
 */
function templateForTarget(template: TemplateV1, target: 'screen' | 'print'): TemplateV1 {
  if (target === 'screen') return template;

  const strip = (blocks: readonly Block[]): Block[] =>
    blocks.map((block) => {
      if (block.type !== 'table') return block;
      const columns = block.columns.filter((column) => !column.screenOnly);
      return columns.length === block.columns.length ? block : { ...block, columns };
    });

  return {
    ...template,
    header: { ...template.header, blocks: strip(template.header.blocks) },
    body: strip(template.body),
    footer: { ...template.footer, blocks: strip(template.footer.blocks) },
  };
}

export function layoutReport(
  rawTemplate: TemplateV1,
  dataset: ReportDataset,
  options: LayoutOptions = {},
): LaidOutReport {
  const template = templateForTarget(rawTemplate, options.target ?? 'screen');
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

  const allColumns = block.columns
    .filter((column) => !column.visibleWhen || evaluateCondition(column.visibleWhen, scope))
    .flatMap((column) => expandColumn(column, dataset));

  const ordered = sortRows(source, block.sortBy);

  /*
    کدام تکهٔ هر ستون، در کلِ جدول دست‌کم یک بار مقدار داشته است.

    `partSeen[columnIndex][partIndex]` — تکهٔ ۰ خودِ `value` ستون است و بقیه
    خط‌های `multiline`. سرستونِ ساخته‌شده از تکه‌ها به همین نیاز دارد، و چون
    دربارهٔ **ستون** است و نه یک ردیف، باید روی همهٔ ردیف‌ها دیده شود.
  */
  const partSeen = allColumns.map((column) =>
    Array.from({ length: 1 + (column.multiline?.lines ?? []).length }, () => false),
  );

  const allRows = ordered.map((row, index) => {
    const rowScope = rowScopeFor(scope, row, index);
    return allColumns.map((column, columnIndex): LaidOutCell => {
      const cellScope = columnScopeFor(rowScope, column);
      const raw = evaluateExpression(column.value, cellScope);

      const parts = [
        { text: formatValue(raw, column.format), muted: false },
        ...(column.multiline?.lines ?? []).map((line) => ({
          text: formatValue(evaluateExpression(line.value, cellScope), line.format),
          muted: line.muted,
        })),
      ];

      const seen = partSeen[columnIndex] as boolean[];
      for (const [partIndex, part] of parts.entries()) {
        if (part.text !== '') seen[partIndex] = true;
      }

      /*
        خط خالی، خط نیست — و این شاملِ **خط اول** هم می‌شود.

        پیش از این فقط خط‌های اضافی فیلتر می‌شدند. نتیجه این بود که فروشنده‌ای
        با چند فاکتور — که طبق قاعدهٔ تجمیع شمارهٔ صورت‌حساب نمی‌گیرد — سلولی
        با نیمهٔ بالای **خالی** و تاریخ در نیمهٔ پایین می‌گرفت: یک خط افقیِ
        بی‌دلیل وسط سلول، و تاریخی که در نیمهٔ پایین پنهان شده بود.

        حالا تکه‌های بی‌متن از هر جای سلول می‌افتند و اولین تکهٔ مانده، خودِ
        سلول می‌شود. تکه‌ای که تنها می‌ماند «کم‌رنگ» هم نمی‌ماند: کم‌رنگی برای
        خطِ دومِ یک سلول دوبخشی است و این سلول دیگر دوبخشی نیست.
      */
      const shown = parts.filter((part) => part.text !== '');

      return {
        text: shown[0]?.text ?? '',
        // مقدار خام همان تکهٔ اصلی می‌ماند، حتی اگر متنش چیز دیگری شده باشد:
        // جمع ستون و سلول عددیِ Excel با همین کار می‌کنند.
        raw,
        align: column.align,
        extraLines: shown.slice(1).map((part) => ({ text: part.text, muted: part.muted })),
        shaded: column.shadeWhen ? evaluateCondition(column.shadeWhen, cellScope) : false,
      };
    });
  });

  /*
    ستون‌هایی که در این اجرا همه‌جا صفرند، حذف می‌شوند.

    اینجا و نه پیش از ساختِ ردیف‌ها، چون «صفر بودن» را فقط مقدارِ محاسبه‌شدهٔ
    سلول‌ها می‌گوید. پس از این نقطه، ردیف جمع، ادغام خانه‌ها و ردیف‌های پرکننده
    همه با همان کدِ موجود و برای ستون‌هایی حساب می‌شوند که واقعاً مانده‌اند.

    دو حالت دست نگه می‌دارد: جدولِ بی‌ردیف (فرمِ خالی برای پر کردن با دست، که
    ستون‌هایش باید سر جایشان بمانند) و حالتی که حذف، جدول را **بی‌ستون** می‌کرد —
    جدولِ بی‌ستون گزارش نیست.
  */
  const isZeroCell = (cell: LaidOutCell | undefined): boolean =>
    cell === undefined || cell.raw === null || cell.raw === 0n || cell.raw === '';

  const keep = allColumns.map((column, columnIndex) => {
    if (!column.dropWhenAllZero || allRows.length === 0) return true;
    return allRows.some((row) => !isZeroCell(row[columnIndex]));
  });
  const dropping = keep.includes(false) && keep.includes(true);

  const columns = dropping ? allColumns.filter((_column, index) => keep[index]) : allColumns;
  const rows = dropping
    ? allRows.map((row) => row.filter((_cell, index) => keep[index]))
    : allRows;
  // دیده‌شدنِ تکه‌ها هم باید با ستون‌های مانده هم‌تراز بماند، وگرنه سرستونِ یک
  // ستون از روی تکه‌های ستونِ دیگری ساخته می‌شد.
  const seenOf = dropping ? partSeen.filter((_seen, index) => keep[index]) : partSeen;

  /**
   * جمع خام یک ستون، از **مقادیر همان ستون** و نه از محاسبهٔ دوباره.
   *
   * کلید، کلیدِ **قالب** است و نه کلیدِ ستونِ بازشده: یک ستونِ تکرارشونده روی کاغذ
   * چند ستون است ولی در قالب یکی. پس همهٔ ستون‌هایی که از آن یکی ساخته شده‌اند با
   * هم جمع می‌شوند — همان «جمع فصل‌ها» که ته فرم می‌آید.
   */
  const sumOfColumn = (key: string): bigint => {
    let sum = 0n;
    for (const [columnIndex, column] of columns.entries()) {
      if (column.key !== key) continue;
      for (const row of rows) {
        const cell = row[columnIndex];
        if (cell && typeof cell.raw === 'bigint') sum += cell.raw;
      }
    }
    return sum;
  };

  const totals = block.totalsRow?.enabled
    ? columns.map((column, columnIndex): LaidOutCell => {
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
            // ردیف جمع، نشانِ سلولِ ردیف‌ها را به ارث نمی‌برد: شرط برای یک ردیف
            // معنا دارد و جمع، ردیف نیست.
            shaded: false,
          };
        }

        if (aggregate === 'none') {
          return { text: '', raw: null, align: column.align, extraLines: [], shaded: false };
        }
        if (aggregate === 'count') {
          const count = BigInt(rows.length);
          return {
            text: formatValue(count, column.format),
            raw: count,
            align: column.align,
            extraLines: [],
            shaded: false,
          };
        }

        /*
          جمع ستون از **مقادیر خام همان ستون** گرفته می‌شود، نه از محاسبه دوباره:
          اگر فردا عبارت ستون عوض شود، جمع هم با آن عوض می‌شود.

          اینجا «همان ستون» یعنی همین ستونِ بازشده و نه همهٔ هم‌کلیدهایش: ته ستون
          «تعمیرات» باید جمعِ تعمیرات بنشیند، نه جمع همهٔ فصل‌ها.
        */
        let sum = 0n;
        for (const row of rows) {
          const cell = row[columnIndex];
          if (cell && typeof cell.raw === 'bigint') sum += cell.raw;
        }
        return {
          text: formatValue(sum, column.format),
          raw: sum,
          align: column.align,
          extraLines: [],
          shaded: false,
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
        return { text: '', raw: null, align: column.align, extraLines: [], shaded: false };
      }
      const number = BigInt(rows.length + offset + 1);
      return {
        text: formatValue(number, column.format),
        raw: number,
        align: column.align,
        extraLines: [],
        shaded: false,
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
    columns: columns.map((column, columnIndex) => ({
      key: column.resolvedKey,
      titleFa: titleOf(column, seenOf[columnIndex] ?? []),
      subtitleFa: column.resolvedSubtitle,
      width: { unit: column.width.unit, value: column.width.value },
      align: column.align,
      isNumeric: column.format.kind === 'currency' || column.format.kind === 'integer',
      screenOnly: column.screenOnly,
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

/**
 * سرستونِ نهایی: یا همان عنوان ثابت، یا ساخته‌شده از تکه‌هایی که داده داشته‌اند.
 *
 * ستون تکرارشونده کنار گذاشته می‌شود چون سرستونش از خودِ مجموعه می‌آید (عنوان
 * فصل)، و چسباندن تکه‌ها به آن بی‌معنا بود.
 */
function titleOf(column: ExpandedColumn, seen: readonly boolean[]): string {
  const spec = column.titleParts;
  if (spec === undefined || column.repeatFor !== undefined) return column.resolvedTitle;

  const titles = [spec.mainTitleFa, ...(column.multiline?.lines ?? []).map((line) => line.titleFa)];
  const kept = titles.filter(
    (title, index): title is string => title !== undefined && seen[index] === true,
  );

  // هیچ تکه‌ای داده ندارد ⇒ عنوان ثابت می‌ماند؛ سرستونِ خالی بدتر از سرستونِ کامل است.
  return kept.length === 0 ? column.resolvedTitle : kept.join(spec.separator);
}

/**
 * یک ستونِ قالب، پس از باز شدن.
 *
 * ستونِ معمولی یکی می‌ماند و ستونِ تکرارشونده به تعداد ردیف‌های مجموعه‌اش باز
 * می‌شود. `key` همان کلیدِ قالب می‌ماند — ردیف جمع با آن کار می‌کند — و
 * `resolvedKey` کلیدِ یکتای همین ستونِ روی کاغذ است.
 */
interface ExpandedColumn extends TableColumn {
  readonly resolvedKey: string;
  readonly resolvedTitle: string;
  readonly resolvedSubtitle: string | null;
  /** ردیفِ مجموعه‌ای که این ستون از آن ساخته شده؛ `null` برای ستون معمولی. */
  readonly source: Record<string, unknown> | null;
}

function expandColumn(column: TableColumn, dataset: ReportDataset): ExpandedColumn[] {
  if (!column.repeatFor) {
    return [
      {
        ...column,
        resolvedKey: column.key,
        resolvedTitle: column.titleFa,
        resolvedSubtitle: column.subtitleFa ?? null,
        source: null,
      },
    ];
  }

  const items = dataset.collections[column.repeatFor.over];
  if (!items) {
    throw new ReportEvaluationError(
      `منبع داده «${column.repeatFor.over}» در داده گزارش وجود ندارد`,
      'UNKNOWN_DATA_SOURCE',
    );
  }

  const spec = column.repeatFor;
  const asText = (value: unknown): string => {
    const resolved = toValue(value);
    return resolved === null ? '' : String(resolved);
  };

  /*
    مجموعهٔ خالی یعنی **هیچ ستونی**، نه یک ستونِ خالی.

    فرمی که هیچ فصلی ندارد، ستون فصل هم ندارد؛ ستونِ بی‌سرستون فقط یک خط عمودی
    بی‌معنا روی کاغذ است.
  */
  if (items.length > spec.maxColumns) {
    throw new ReportEvaluationError(
      `ستون «${column.titleFa}» ${items.length} بار تکرار می‌شود ولی سقف قالب ` +
        `${spec.maxColumns} است؛ ستون‌های آخر از عرض صفحه بیرون می‌زنند`,
      'TOO_MANY_COLUMNS',
    );
  }

  return items.map((item) => ({
    ...column,
    resolvedKey: `${column.key}:${asText(item[spec.keyFrom])}`,
    resolvedTitle: asText(item[spec.titleFrom]),
    resolvedSubtitle: spec.subtitleFrom === undefined ? null : asText(item[spec.subtitleFrom]),
    source: item,
  }));
}

/**
 * دامنهٔ یک سلول: ردیف، به‌علاوهٔ ستونی که سلول در آن است.
 *
 * `column.*` تنها در ستونِ تکرارشونده معنا دارد و همان است که به عبارت اجازه
 * می‌دهد بپرسد «آیا فصلِ این ردیف، همین ستون است؟». در ستون معمولی خالی برمی‌گردد
 * و اعتبارسنجی قالب هم از همان ابتدا جلویش را می‌گیرد.
 */
function columnScopeFor(scope: EvaluationScope, column: ExpandedColumn): EvaluationScope {
  if (!column.repeatFor) return scope;
  const spec = column.repeatFor;
  const source = column.source ?? {};

  return {
    ...scope,
    read: (path) => {
      if (path === 'column.key') return source[spec.keyFrom] ?? null;
      if (path === 'column.title') return source[spec.titleFrom] ?? null;
      if (path === 'column.code') {
        return spec.subtitleFrom === undefined ? null : (source[spec.subtitleFrom] ?? null);
      }
      return scope.read(path);
    },
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
          if (column.shadeWhen) count += conditionNodes(column.shadeWhen);
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
