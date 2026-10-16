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
  conditionDepth,
  expressionDepth,
  walkConditionPaths,
  walkExpressionPaths,
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
  /**
   * مجموعه‌های مجاز و **نام ستون‌های هر مجموعه**.
   *
   * فهرست ستون‌ها از همان ابتدا بخشی از ورودی است، نه افزوده‌ای اختیاری: بدون آن،
   * مسیرهای `row.*` هیچ‌جا سنجیده نمی‌شدند و یک غلط تایپی در نام ستون، به‌جای خطای
   * اعتبارسنجی، یک سلول **خالی** در گزارش مالی می‌شد.
   */
  readonly collections: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * بررسی ساختاری قالب در برابر Data Dictionary.
 *
 * مسیرهای `row.*` به ردیف جاری جدول اشاره دارند، پس در **دامنه همان جدول** سنجیده
 * می‌شوند: `row.x` تنها وقتی معتبر است که `x` یکی از ستون‌های منبع داده همان جدول
 * باشد. بیرون از جدول، `row.*` اصلاً معنا ندارد و خطاست.
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

    /**
     * شرط نمایش یک **جدول** در دامنه خودِ جدول نیست: جدول تصمیم می‌گیرد که آیا
     * اصلاً رندر شود، پیش از آنکه ردیفی وجود داشته باشد. پس `row.*` در آن مجاز نیست.
     */
    if (block.visibleWhen) {
      checkCondition(block.visibleWhen, `${at}.visibleWhen`, dictionary, null, problems);
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
        checkExpression(block.value, `${at}.value`, dictionary, null, problems);
        break;

      case 'table': {
        const rowSource = dictionary.collections.has(block.dataSource) ? block.dataSource : null;
        if (rowSource === null) {
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

          checkExpression(
            column.value,
            `${at}.columns.${column.key}`,
            dictionary,
            rowSource,
            problems,
          );
          for (const line of column.multiline?.lines ?? []) {
            checkExpression(
              line.value,
              `${at}.columns.${column.key}.line`,
              dictionary,
              rowSource,
              problems,
            );
          }
          if (column.visibleWhen) {
            checkCondition(
              column.visibleWhen,
              `${at}.columns.${column.key}.visibleWhen`,
              dictionary,
              rowSource,
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
  rowSource: string | null,
  problems: TemplateProblem[],
): void {
  if (expressionDepth(expression) > MAX_EXPRESSION_DEPTH) {
    problems.push({ path: at, message: `عمق عبارت از ${MAX_EXPRESSION_DEPTH} بیشتر است` });
  }
  walkExpressionPaths(expression, rowSource, (path, scope) =>
    checkPath(path, scope, at, dictionary, problems),
  );
}

function checkCondition(
  condition: Condition,
  at: string,
  dictionary: TemplateValidationInput,
  rowSource: string | null,
  problems: TemplateProblem[],
): void {
  if (conditionDepth(condition) > MAX_EXPRESSION_DEPTH) {
    problems.push({ path: at, message: `عمق شرط از ${MAX_EXPRESSION_DEPTH} بیشتر است` });
  }
  walkConditionPaths(condition, rowSource, (path, scope) =>
    checkPath(path, scope, at, dictionary, problems),
  );
}

/**
 * بررسی یک مسیر در دامنه‌اش.
 *
 * `rowSource === null` یعنی «اینجا ردیفی در دامنه نیست»، پس `row.*` خطاست. وقتی
 * دامنه‌ای هست، نام ستون باید در همان مجموعه وجود داشته باشد — یک غلط تایپی در نام
 * ستون نباید به سلول خالی تبدیل شود.
 */
function checkPath(
  path: string,
  rowSource: string | null,
  at: string,
  dictionary: TemplateValidationInput,
  problems: TemplateProblem[],
): void {
  if (path.startsWith('row.')) {
    if (rowSource === null) {
      problems.push({
        path: at,
        message: `مسیر «${path}» دامنه ردیف ندارد؛ فقط داخل ستون جدول یا تابع تجمیعی معنا دارد`,
      });
      return;
    }

    const fields = dictionary.collections.get(rowSource);
    // منبع داده ناشناخته، خطای جداگانه خودش را دارد؛ اینجا دوباره گزارش نمی‌شود.
    if (!fields) return;

    const field = path.slice('row.'.length);
    if (!fields.has(field)) {
      problems.push({
        path: at,
        message: `ستون «${field}» در منبع داده «${rowSource}» وجود ندارد`,
      });
    }
    return;
  }

  if (dictionary.allowedValuePaths.has(path) || dictionary.collections.has(path)) return;
  problems.push({ path: at, message: `مسیر داده «${path}» مجاز نیست` });
}
