/**
 * اعتبارسنجی قالب **پیش از ذخیره** و **پیش از اجرا** (docs/09 §۴).
 *
 * چرا هر دو بار: ذخیره‌شدن قالب تضمین نمی‌کند که Data Dictionary از آن زمان عوض نشده
 * باشد. قالبی که دیروز معتبر بود، امروز می‌تواند به مسیری اشاره کند که دیگر وجود ندارد
 * یا مجوزش عوض شده است. بررسی دوباره پیش از اجرا، همان قاعده fail-closed نگهبان دسترسی
 * است، یک لایه بالاتر.
 */

import {
  MAX_EXPRESSION_DEPTH,
  MAX_TEMPLATE_NODES,
  collectConditionPaths,
  collectVariablePaths,
  conditionDepth,
  expressionDepth,
  type Condition,
  type Expression,
} from './expression.js';
import { countTemplateNodes } from './layout.js';
import { allBlocks, textPlaceholders, type TableBlock, type TemplateV1 } from './template.js';

export interface TemplateProblem {
  readonly path: string;
  readonly message: string;
}

/** عرض و ارتفاع کاغذ بر حسب میلی‌متر، در حالت عمودی. */
const A4_MM = { width: 210, height: 297 };

const PAGE_SIZES_MM: Record<string, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  LETTER: { width: 216, height: 279 },
};

/** عرض قابل چاپ صفحه: عرض کاغذ منهای حاشیه‌های کناری. */
export function printableWidthMm(page: TemplateV1['page']): number {
  const size = PAGE_SIZES_MM[page.size] ?? A4_MM;
  const paperWidth = page.orientation === 'landscape' ? size.height : size.width;
  return paperWidth - page.margins.inlineStart - page.margins.inlineEnd;
}

/**
 * مجموع عرض ستون‌های یک جدول (فقط ستون‌هایی که عرض میلی‌متری دارند).
 *
 * ستون با عرض `auto` یا درصدی در این جمع نمی‌آید، چون اندازه‌اش به بقیه بستگی دارد.
 */
export function tableWidthMm(block: TableBlock): number {
  return block.columns.reduce((total, column) => {
    if (column.width.unit !== 'mm' || column.width.value === undefined) return total;
    return total + column.width.value;
  }, 0);
}

export interface TemplateValidationInput {
  /** مسیرهای تکیِ مجاز، از Data Dictionary. */
  readonly allowedValuePaths: ReadonlySet<string>;
  /** کلیدهای مجموعه‌های مجاز. */
  readonly allowedCollections: ReadonlySet<string>;
}

/**
 * بررسی ساختاری قالب در برابر Data Dictionary.
 *
 * مسیرهایی که با `row.` شروع می‌شوند بررسی نمی‌شوند: آن‌ها به ردیف جاری جدول اشاره
 * دارند و اعتبارشان به ستون‌های همان منبع داده بستگی دارد، نه به فهرست سراسری.
 */
export function validateTemplate(
  template: TemplateV1,
  dictionary: TemplateValidationInput,
): TemplateProblem[] {
  const problems: TemplateProblem[] = [];

  const nodes = countTemplateNodes(template);
  if (nodes > MAX_TEMPLATE_NODES) {
    problems.push({
      path: 'template',
      message: `تعداد گره‌های قالب (${nodes}) از حد مجاز ${MAX_TEMPLATE_NODES} بیشتر است`,
    });
  }

  const printableWidth = printableWidthMm(template.page);

  for (const block of allBlocks(template)) {
    const at = `block.${block.id}`;

    if (block.visibleWhen) {
      checkCondition(block.visibleWhen, `${at}.visibleWhen`, dictionary, problems);
    }

    switch (block.type) {
      case 'text':
        for (const path of textPlaceholders(block.text)) {
          if (!dictionary.allowedValuePaths.has(path)) {
            problems.push({ path: `${at}.text`, message: `متغیر «${path}» در فهرست داده نیست` });
          }
        }
        break;

      case 'variable':
        checkExpression(block.value, `${at}.value`, dictionary, problems);
        break;

      case 'table': {
        if (!dictionary.allowedCollections.has(block.dataSource)) {
          problems.push({
            path: `${at}.dataSource`,
            message: `منبع داده «${block.dataSource}» در فهرست داده نیست`,
          });
        }

        const keys = new Set<string>();
        for (const column of block.columns) {
          if (keys.has(column.key)) {
            problems.push({
              path: `${at}.columns.${column.key}`,
              message: `کلید ستون «${column.key}» تکراری است`,
            });
          }
          keys.add(column.key);

          checkExpression(column.value, `${at}.columns.${column.key}`, dictionary, problems);
          for (const line of column.multiline?.lines ?? []) {
            checkExpression(line.value, `${at}.columns.${column.key}.line`, dictionary, problems);
          }
          if (column.visibleWhen) {
            checkCondition(
              column.visibleWhen,
              `${at}.columns.${column.key}.visibleWhen`,
              dictionary,
              problems,
            );
          }
        }

        /**
         * ستون بریده‌شده، نقصی است که فقط در چاپ واقعی دیده می‌شود و تا آن لحظه
         * هیچ تستی قرمز نمی‌شود. این بررسی همان را به زمان ذخیره قالب می‌آورد.
         *
         * (در آزمون PDF فاز ۶ دقیقاً همین اتفاق افتاد: مجموع ۳۲۴ میلی‌متر در عرض
         * قابل چاپ ۲۷۷ میلی‌متری، دو ستون آخر را از صفحه بیرون انداخت.)
         */
        const width = tableWidthMm(block);
        if (width > printableWidth) {
          problems.push({
            path: `${at}.columns`,
            message:
              `مجموع عرض ستون‌ها ${width} میلی‌متر است ولی عرض قابل چاپ صفحه ` +
              `${printableWidth} میلی‌متر؛ ستون‌های آخر بریده می‌شوند`,
          });
        }

        for (const key of Object.keys(block.totalsRow?.cells ?? {})) {
          if (!keys.has(key)) {
            problems.push({
              path: `${at}.totalsRow`,
              message: `ردیف جمع به ستون ناموجود «${key}» اشاره می‌کند`,
            });
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return problems;
}

function checkExpression(
  expression: Expression,
  at: string,
  dictionary: TemplateValidationInput,
  problems: TemplateProblem[],
): void {
  if (expressionDepth(expression) > MAX_EXPRESSION_DEPTH) {
    problems.push({ path: at, message: `عمق عبارت از ${MAX_EXPRESSION_DEPTH} بیشتر است` });
  }
  checkPaths(collectVariablePaths(expression), at, dictionary, problems);
}

function checkCondition(
  condition: Condition,
  at: string,
  dictionary: TemplateValidationInput,
  problems: TemplateProblem[],
): void {
  if (conditionDepth(condition) > MAX_EXPRESSION_DEPTH) {
    problems.push({ path: at, message: `عمق شرط از ${MAX_EXPRESSION_DEPTH} بیشتر است` });
  }
  checkPaths(collectConditionPaths(condition), at, dictionary, problems);
}

function checkPaths(
  paths: ReadonlySet<string>,
  at: string,
  dictionary: TemplateValidationInput,
  problems: TemplateProblem[],
): void {
  for (const path of paths) {
    if (path.startsWith('row.')) continue;
    if (dictionary.allowedValuePaths.has(path) || dictionary.allowedCollections.has(path)) continue;
    problems.push({ path: at, message: `مسیر داده «${path}» مجاز نیست` });
  }
}
