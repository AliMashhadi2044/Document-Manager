/**
 * ارزیاب AST قالب.
 *
 * سه قاعده‌ای که این فایل حولشان ساخته شده:
 *
 *  ۱. **هیچ چیز اجرا نمی‌شود.** درخت پیموده می‌شود و هر گره ناشناخته، خطاست.
 *
 *  ۲. **حساب مبلغ همان حساب سند است.** `divRound` از `roundDiv` بسته مشترک استفاده
 *     می‌کند — همان تابعی که محاسبه فاکتور با آن انجام شده. اگر گزارش حساب خودش را
 *     می‌داشت، روزی عددش با سند یک ریال فرق می‌کرد و هیچ‌کس نمی‌فهمید کدام درست است.
 *
 *  ۳. **مقدار عددی هرگز `number` نمی‌شود.** مبالغ ریالی از محدوده امن `number` بیرون
 *     می‌زنند (ADR-0003)، پس مقدار داخلی ارزیاب `bigint` است و تبدیل به رشته فقط در
 *     لحظه قالب‌بندی انجام می‌شود.
 */

import { roundDiv, type RoundingMode } from '@dm/shared';

import {
  MAX_EXPRESSION_DEPTH,
  conditionDepth,
  expressionDepth,
  type Condition,
  type Expression,
} from './expression.js';
import { formatValue } from './format.js';
import type { Value } from './types.js';

export class ReportEvaluationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ReportEvaluationError';
  }
}

export interface EvaluationScope {
  /** خواندن یک مسیر از داده حل‌شده؛ `undefined` یعنی مسیر وجود ندارد. */
  readonly read: (path: string) => unknown;
  /** فهرست ردیف‌های یک مجموعه، برای `agg`. */
  readonly list: (path: string) => readonly Record<string, unknown>[] | undefined;
  readonly roundingMode: RoundingMode;
}

export function evaluateExpression(expression: Expression, scope: EvaluationScope): Value {
  if (expressionDepth(expression) > MAX_EXPRESSION_DEPTH) {
    throw new ReportEvaluationError(
      `عمق عبارت از حد مجاز (${MAX_EXPRESSION_DEPTH}) بیشتر است`,
      'EXPRESSION_TOO_DEEP',
    );
  }
  return evaluateNode(expression, scope);
}

function evaluateNode(expression: Expression, scope: EvaluationScope): Value {
  switch (expression.k) {
    case 'const':
      return constantValue(expression.type, expression.v);

    case 'var':
      return toValue(scope.read(expression.path));

    case 'agg':
      return aggregate(expression, scope);

    case 'arith':
      return arithmetic(expression, scope);

    case 'concat': {
      const parts = expression.args
        .map((argument) => evaluateNode(argument, scope))
        .filter((value): value is Exclude<Value, null> => value !== null && value !== '')
        .map((value) => (typeof value === 'bigint' ? value.toString() : String(value)));
      return parts.length === 0 ? null : parts.join(expression.sep ?? ' ');
    }

    case 'if':
      return evaluateNode(
        evaluateCondition(expression.cond, scope) ? expression.then : expression.else,
        scope,
      );

    case 'fmt':
      return formatValue(evaluateNode(expression.of, scope), expression.format);
  }
}

function constantValue(type: string, raw: string): Value {
  if (type === 'money' || type === 'number') {
    try {
      return BigInt(raw);
    } catch {
      throw new ReportEvaluationError(`مقدار ثابت «${raw}» عدد صحیح نیست`, 'CONST_NOT_INTEGER');
    }
  }
  if (type === 'boolean') return raw === 'true';
  return raw;
}

function aggregate(
  expression: Extract<Expression, { k: 'agg' }>,
  scope: EvaluationScope,
): Value {
  const rows = scope.list(expression.over);
  if (!rows) {
    throw new ReportEvaluationError(
      `مجموعه «${expression.over}» در داده گزارش وجود ندارد`,
      'UNKNOWN_COLLECTION',
    );
  }

  if (expression.fn === 'count') return BigInt(rows.length);

  const inner = expression.of;
  if (!inner) {
    throw new ReportEvaluationError(
      `تجمیع «${expression.fn}» بدون عبارت مقدار معنا ندارد`,
      'AGGREGATE_WITHOUT_VALUE',
    );
  }

  const values: bigint[] = [];
  for (const row of rows) {
    const rowScope: EvaluationScope = {
      ...scope,
      // داخل تجمیع، `row.*` به ردیف جاری اشاره می‌کند و بقیه مسیرها مثل قبل‌اند.
      read: (path) => (path.startsWith('row.') ? readPath(row, path.slice(4)) : scope.read(path)),
    };
    const value = evaluateNode(inner, rowScope);
    if (value === null) continue;
    if (typeof value !== 'bigint') {
      throw new ReportEvaluationError(
        `تجمیع «${expression.fn}» روی مقدار غیرعددی ممکن نیست`,
        'AGGREGATE_ON_NON_NUMBER',
      );
    }
    values.push(value);
  }

  if (values.length === 0) return expression.fn === 'sum' ? 0n : null;

  switch (expression.fn) {
    case 'sum':
      return values.reduce((total, value) => total + value, 0n);
    case 'min':
      return values.reduce((best, value) => (value < best ? value : best));
    case 'max':
      return values.reduce((best, value) => (value > best ? value : best));
  }
}

function arithmetic(
  expression: Extract<Expression, { k: 'arith' }>,
  scope: EvaluationScope,
): Value {
  const left = requireNumber(evaluateNode(expression.args[0], scope), expression.op);
  const right = requireNumber(evaluateNode(expression.args[1], scope), expression.op);

  switch (expression.op) {
    case 'add':
      return left + right;
    case 'sub':
      return left - right;
    case 'mul':
      return left * right;
    case 'divRound':
      if (right === 0n) {
        throw new ReportEvaluationError('تقسیم بر صفر در عبارت گزارش', 'DIVISION_BY_ZERO');
      }
      // همان گرد کردن سند، نه یک پیاده‌سازی دوم.
      return roundDiv(left, right, scope.roundingMode);
  }
}

function requireNumber(value: Value, operation: string): bigint {
  // تهی در حساب، صفر شمرده می‌شود: ستون تخفیف نداشته یعنی تخفیف صفر.
  if (value === null) return 0n;
  if (typeof value !== 'bigint') {
    throw new ReportEvaluationError(
      `عملگر «${operation}» روی مقدار غیرعددی قابل اجرا نیست`,
      'ARITHMETIC_ON_NON_NUMBER',
    );
  }
  return value;
}

export function evaluateCondition(condition: Condition, scope: EvaluationScope): boolean {
  if (conditionDepth(condition) > MAX_EXPRESSION_DEPTH) {
    throw new ReportEvaluationError(
      `عمق شرط از حد مجاز (${MAX_EXPRESSION_DEPTH}) بیشتر است`,
      'CONDITION_TOO_DEEP',
    );
  }
  return evaluateConditionNode(condition, scope);
}

function evaluateConditionNode(condition: Condition, scope: EvaluationScope): boolean {
  switch (condition.k) {
    case 'cmp': {
      const left = evaluateNode(condition.args[0], scope);
      const right = evaluateNode(condition.args[1], scope);
      return compare(condition.op, left, right);
    }
    case 'in': {
      const value = evaluateNode(condition.of, scope);
      const text = value === null ? '' : String(value);
      return condition.values.includes(text);
    }
    case 'empty': {
      const value = evaluateNode(condition.of, scope);
      return value === null || value === '';
    }
    case 'and':
      return condition.args.every((item) => evaluateConditionNode(item, scope));
    case 'or':
      return condition.args.some((item) => evaluateConditionNode(item, scope));
    case 'not':
      return !evaluateConditionNode(condition.of, scope);
  }
}

function compare(op: string, left: Value, right: Value): boolean {
  if (op === 'eq' || op === 'neq') {
    const equal =
      left === null || right === null
        ? left === right
        : typeof left === 'bigint' && typeof right === 'bigint'
          ? left === right
          : String(left) === String(right);
    return op === 'eq' ? equal : !equal;
  }

  // مقایسه ترتیبی فقط روی عدد؛ مقایسه متن با «>» در گزارش مالی معنای روشنی ندارد.
  if (typeof left !== 'bigint' || typeof right !== 'bigint') {
    throw new ReportEvaluationError(
      `مقایسه «${op}» فقط روی مقدار عددی ممکن است`,
      'COMPARE_ON_NON_NUMBER',
    );
  }

  switch (op) {
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    default:
      throw new ReportEvaluationError(`عملگر مقایسه «${op}» شناخته نشد`, 'UNKNOWN_COMPARATOR');
  }
}

/**
 * تبدیل مقدار خام داده به مقدار ارزیاب.
 *
 * مبالغ از API به‌صورت **رشته عددی** می‌آیند (ADR-0003) و اینجا به `bigint` برمی‌گردند.
 * رشته‌ای که عدد صحیح نیست، متن می‌ماند — نام فروشنده نباید سهواً عدد شود.
 */
export function toValue(raw: unknown): Value {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return Number.isInteger(raw) ? BigInt(raw) : String(raw);
  if (typeof raw === 'string') {
    if (/^-?\d+$/.test(raw) && !hasLeadingZero(raw)) {
      try {
        return BigInt(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return String(raw);
}

/**
 * «۰» ابتدایی یعنی این رشته عدد نیست — شناسه است.
 *
 * کد ملی `0123456789`، کدپستی و شمارهٔ تلفن شهری، همه با صفر شروع می‌شوند و
 * همان صفر بخشی از خودِ شناسه است. اگر اینجا `bigint` شوند، صفر پیش از هر
 * قالب‌بندی‌ای از بین رفته است و هیچ ستونی دیگر نمی‌تواند برش گرداند: در گزارش
 * مالیات، کد ملیِ یک طرف قرارداد نه‌فقط بدقواره، که **اشتباه** چاپ می‌شود.
 *
 * مبلغ هیچ‌وقت این شکل را ندارد؛ عددِ متعارف یا «۰» است یا بی‌صفرِ ابتدایی.
 */
function hasLeadingZero(raw: string): boolean {
  return /^-?0\d/u.test(raw);
}

/** خواندن مسیر نقطه‌ای از یک شیء ساده؛ بدون prototype chain و بدون تابع. */
export function readPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    // فقط ویژگی خودِ شیء: جلوگیری از رسیدن به `__proto__` و `constructor`.
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'function' ? undefined : current;
}
