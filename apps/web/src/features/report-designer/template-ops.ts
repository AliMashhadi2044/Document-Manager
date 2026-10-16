import {
  MAX_EXPRESSION_DEPTH,
  expressionDepth,
  printableWidthMm,
  tableWidthMm,
  validateTemplate,
  type Block,
  type Condition,
  type Expression,
  type FormatSpec,
  type TableBlock,
  type TableColumn,
  type TemplateProblem,
  type TemplateV1,
} from '@dm/report-engine';

import type { DataSourceDto } from './templates.api';

/**
 * عملیات ویرایش قالب — توابع **خالص**، بدون هیچ وابستگی به React.
 *
 * چرا جدا: طراح بصری در نهایت یک ویرایشگر JSON است و منطقش (افزودن بلوک، جابه‌جایی
 * ستون، ساخت عبارت پیش‌فرض) هیچ ربطی به رندر ندارد. جدا بودنش یعنی می‌شود بدون
 * mount کردن رابط کاربری تستش کرد.
 *
 * و یک قاعده: اعتبارسنجی اینجا **همان تابع موتور** است، نه یک کپی. بسته
 * `@dm/report-engine` عمداً ایزومورفیک ساخته شد تا همین امکان‌پذیر باشد؛ اگر مرورگر
 * قواعد خودش را داشت، روزی با سرور اختلاف پیدا می‌کرد و کاربر قالبی می‌ساخت که
 * «اینجا سبز است ولی ذخیره نمی‌شود».
 */

export type Band = 'header' | 'body' | 'footer';

export const BAND_LABELS: Record<Band, string> = {
  header: 'سربرگ',
  body: 'بدنه',
  footer: 'پابرگ',
};

export const BLOCK_TYPE_LABELS: Record<Block['type'], string> = {
  text: 'متن',
  variable: 'مقدار',
  table: 'جدول',
  signature: 'امضا',
  signatureRow: 'ردیف امضاها',
  divider: 'خط جدا‌کننده',
  spacer: 'فاصله',
  pageNumber: 'شماره صفحه',
  generatedAt: 'تاریخ تولید',
};

export const FORMAT_KIND_LABELS: Record<FormatSpec['kind'], string> = {
  currency: 'مبلغ ریالی',
  integer: 'عدد صحیح',
  decimal: 'عدد اعشاری',
  jalaliDate: 'تاریخ شمسی',
  text: 'متن',
  economicCode: 'شماره اقتصادی',
};

export const EXPRESSION_KIND_LABELS: Record<Expression['k'], string> = {
  var: 'مقدار یک فیلد',
  const: 'مقدار ثابت',
  arith: 'عملیات حساب',
  agg: 'تابع تجمیعی',
  concat: 'چسباندن متن',
  if: 'شرطی',
  fmt: 'قالب‌بندی صریح',
};

export const CONDITION_KIND_LABELS: Record<Condition['k'], string> = {
  cmp: 'مقایسه',
  in: 'عضویت در فهرست',
  empty: 'تهی بودن',
  and: 'همه شرط‌ها (و)',
  or: 'یکی از شرط‌ها (یا)',
  not: 'نقض شرط',
};

export const ARITH_OP_LABELS: Record<'add' | 'sub' | 'mul' | 'divRound', string> = {
  add: 'جمع',
  sub: 'تفریق',
  mul: 'ضرب',
  divRound: 'تقسیم با گرد کردن',
};

export const CMP_OP_LABELS: Record<'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte', string> = {
  eq: 'برابر',
  neq: 'نابرابر',
  gt: 'بزرگ‌تر',
  gte: 'بزرگ‌تر یا برابر',
  lt: 'کوچک‌تر',
  lte: 'کوچک‌تر یا برابر',
};

export const AGG_FN_LABELS: Record<'sum' | 'count' | 'min' | 'max', string> = {
  sum: 'جمع',
  count: 'تعداد',
  min: 'کمینه',
  max: 'بیشینه',
};

/** فهرست داده به شکلی که `validateTemplate` می‌خواهد. */
export function dictionaryOf(sources: readonly DataSourceDto[]): {
  allowedValuePaths: Set<string>;
  collections: Map<string, Set<string>>;
} {
  const allowedValuePaths = new Set<string>();
  const collections = new Map<string, Set<string>>();

  for (const source of sources) {
    if (source.cardinality === 'single') {
      for (const field of source.fields) allowedValuePaths.add(`${source.key}.${field.key}`);
    } else {
      collections.set(source.key, new Set(source.fields.map((field) => field.key)));
    }
  }

  return { allowedValuePaths, collections };
}

export function templateProblems(
  template: TemplateV1,
  sources: readonly DataSourceDto[],
): TemplateProblem[] {
  return validateTemplate(template, dictionaryOf(sources));
}

/** عرض قابل چاپ صفحه و مجموع عرض ستون‌های یک جدول — برای نمایش زنده در طراح. */
export function widthReport(
  template: TemplateV1,
  block: TableBlock,
): { printable: number; used: number; overflow: number } {
  const printable = printableWidthMm(template.page);
  const used = tableWidthMm(block);
  return { printable, used, overflow: Math.max(0, used - printable) };
}

export function bandBlocks(template: TemplateV1, band: Band): readonly Block[] {
  return band === 'body' ? template.body : template[band].blocks;
}

export function setBandBlocks(template: TemplateV1, band: Band, blocks: Block[]): TemplateV1 {
  if (band === 'body') return { ...template, body: blocks };
  return { ...template, [band]: { ...template[band], blocks } } as TemplateV1;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/** شناسه یکتا و خوانا برای بلوک تازه؛ شناسه تکراری، قالب را خراب می‌کند. */
export function uniqueBlockId(template: TemplateV1, base: string): string {
  const used = new Set<string>();
  const collect = (blocks: readonly Block[]): void => {
    for (const block of blocks) {
      used.add(block.id);
      if (block.type === 'signatureRow') collect(block.blocks);
    }
  };
  collect(template.header.blocks);
  collect(template.body);
  collect(template.footer.blocks);

  if (!used.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export const TEXT_FORMAT: FormatSpec = {
  kind: 'text',
  persianDigits: false,
  thousandSeparator: false,
  decimals: 0,
  emptyText: '',
};

export const CURRENCY_FORMAT: FormatSpec = {
  kind: 'currency',
  persianDigits: true,
  thousandSeparator: true,
  decimals: 0,
  emptyText: '۰',
};

export const INTEGER_FORMAT: FormatSpec = {
  kind: 'integer',
  persianDigits: true,
  thousandSeparator: false,
  decimals: 0,
  emptyText: '',
};

export const JALALI_FORMAT: FormatSpec = {
  kind: 'jalaliDate',
  persianDigits: true,
  thousandSeparator: false,
  decimals: 0,
  emptyText: '',
};

/** قالب‌بندی پیش‌فرض یک فیلد بر اساس نوعش — تا کاربر کمتر دستی تنظیم کند. */
export function formatForFieldType(type: DataSourceDto['fields'][number]['type']): FormatSpec {
  switch (type) {
    case 'money':
      return CURRENCY_FORMAT;
    case 'integer':
      return INTEGER_FORMAT;
    case 'date':
    case 'jalaliDate':
      return JALALI_FORMAT;
    default:
      return TEXT_FORMAT;
  }
}

export function newBlock(type: Block['type'], id: string, firstCollection: string): Block {
  switch (type) {
    case 'text':
      return { id, type, text: 'متن تازه', align: 'center', bold: false };

    case 'variable':
      return {
        id,
        type,
        labelFa: 'برچسب',
        value: { k: 'const', type: 'text', v: '' },
        format: TEXT_FORMAT,
        align: 'start',
      };

    case 'table':
      return {
        id,
        type,
        dataSource: firstCollection,
        columns: [
          {
            key: 'rowNo',
            titleFa: 'ردیف',
            width: { unit: 'mm', value: 10 },
            align: 'center',
            value: { k: 'var', path: 'row.index' },
            format: INTEGER_FORMAT,
          },
        ],
        sortBy: [],
        minRows: 0,
        pagination: { repeatHeaderOnNewPage: true, avoidRowBreak: true },
      };

    case 'signature':
      return { id, type, signatoryRoleKey: '', align: 'center', spaceMm: 18 };

    case 'signatureRow':
      return {
        id,
        type,
        blocks: [
          { id: `${id}-a`, type: 'signature', signatoryRoleKey: '', align: 'center', spaceMm: 18 },
        ],
      };

    case 'divider':
      return { id, type };

    case 'spacer':
      return { id, type, heightMm: 5 };

    case 'pageNumber':
      return { id, type, templateFa: 'صفحه {{page}} از {{pages}}' };

    case 'generatedAt':
      return { id, type, labelFa: 'تاریخ تولید گزارش' };
  }
}

export function newColumn(key: string): TableColumn {
  return {
    key,
    titleFa: 'ستون تازه',
    width: { unit: 'mm', value: 20 },
    align: 'start',
    value: { k: 'const', type: 'text', v: '' },
    format: TEXT_FORMAT,
  };
}

/** شناسه یکتای ستون در همان جدول. */
export function uniqueColumnKey(block: TableBlock, base: string): string {
  const used = new Set(block.columns.map((column) => column.key));
  if (!used.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export function emptyExpression(kind: Expression['k']): Expression {
  switch (kind) {
    case 'const':
      return { k: 'const', type: 'text', v: '' };
    case 'var':
      return { k: 'var', path: '' };
    case 'agg':
      return { k: 'agg', fn: 'sum', over: '' };
    case 'arith':
      return {
        k: 'arith',
        op: 'add',
        args: [
          { k: 'const', type: 'money', v: '0' },
          { k: 'const', type: 'money', v: '0' },
        ],
      };
    case 'concat':
      return { k: 'concat', args: [{ k: 'const', type: 'text', v: '' }], sep: ' ' };
    case 'if':
      return {
        k: 'if',
        cond: { k: 'empty', of: { k: 'const', type: 'text', v: '' } },
        then: { k: 'const', type: 'text', v: '' },
        else: { k: 'const', type: 'text', v: '' },
      };
    case 'fmt':
      return { k: 'fmt', of: { k: 'const', type: 'text', v: '' }, format: TEXT_FORMAT };
  }
}

export function emptyCondition(kind: Condition['k']): Condition {
  switch (kind) {
    case 'cmp':
      return {
        k: 'cmp',
        op: 'eq',
        args: [
          { k: 'const', type: 'text', v: '' },
          { k: 'const', type: 'text', v: '' },
        ],
      };
    case 'in':
      return { k: 'in', of: { k: 'const', type: 'text', v: '' }, values: [] };
    case 'empty':
      return { k: 'empty', of: { k: 'const', type: 'text', v: '' } };
    case 'and':
      return { k: 'and', args: [] };
    case 'or':
      return { k: 'or', args: [] };
    case 'not':
      return { k: 'not', of: { k: 'empty', of: { k: 'const', type: 'text', v: '' } } };
  }
}

/**
 * آیا می‌شود زیرعبارت تازه‌ای در این عمق افزود؟
 *
 * طراح نباید اجازه دهد کاربر عبارتی بسازد که بعد ذخیره‌اش رد شود. سقف همان سقف موتور
 * است و از همان ثابت خوانده می‌شود، نه یک عدد دست‌نویس.
 */
export function canNest(expression: Expression, depthSoFar: number): boolean {
  return depthSoFar + expressionDepth(expression) < MAX_EXPRESSION_DEPTH;
}

export { MAX_EXPRESSION_DEPTH };
