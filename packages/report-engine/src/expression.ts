/**
 * عبارت و شرط قالب — **AST بسته** (ADR-0007، docs/09 §۴).
 *
 * ممنوعیت مطلق: `eval`، `new Function`، قالب رشته‌ای اجراشدنی، SQL دلخواه، دسترسی به
 * شبکه یا دیتابیس از داخل قالب. آنچه اینجا تعریف می‌شود یک **درخت داده** است، نه کد؛
 * ارزیاب فقط همین گره‌های شمرده‌شده را می‌شناسد و هر چیز دیگری خطای اعتبارسنجی است.
 *
 * چرا درخت و نه یک زبان کوچک با parser: parser یعنی یک سطح حمله تازه و یک دستور زبان
 * که باید نگهداری شود. درخت JSON با Zod اعتبارسنجی می‌شود، در دیتابیس می‌نشیند، در
 * طراح بصری ساخته می‌شود و هیچ‌وقت «اجرا» نمی‌شود — فقط پیموده می‌شود.
 */

import { z } from 'zod';

export const FORMAT_KINDS = [
  'currency',
  'integer',
  'decimal',
  'jalaliDate',
  'text',
  'economicCode',
] as const;
export type FormatKind = (typeof FORMAT_KINDS)[number];

export const formatSpecSchema = z.object({
  kind: z.enum(FORMAT_KINDS),
  /** ارقام فارسی؟ پیش‌فرض بله، چون خروجی چاپی فارسی است. */
  persianDigits: z.boolean().default(true),
  /** جداکننده هزارگان برای اعداد. */
  thousandSeparator: z.boolean().default(true),
  /** تعداد رقم اعشار؛ فقط برای `decimal` معنا دارد. */
  decimals: z.number().int().min(0).max(6).default(0),
  /** متن جایگزین وقتی مقدار تهی است. برای مبالغ «۰» و برای متن «—». */
  emptyText: z.string().max(20).default(''),
});
export type FormatSpec = z.infer<typeof formatSpecSchema>;

const constSchema = z.object({
  k: z.literal('const'),
  type: z.enum(['money', 'number', 'text', 'boolean', 'date']),
  /** مقدار **همیشه رشته** است: مبلغ ریالی از محدوده امن `number` بیرون می‌زند. */
  v: z.string(),
});

const varSchema = z.object({
  k: z.literal('var'),
  /** باید در Data Dictionary باشد؛ اعتبارسنجی‌اش کار لایه API است. */
  path: z.string().min(1).max(120),
});

/**
 * عمق و اندازه درخت محدود است (docs/09 §۴). بدون این سقف، یک قالب دست‌کاری‌شده
 * می‌توانست با تودرتویی عمیق، پشته ارزیاب را پر کند.
 */
export const MAX_EXPRESSION_DEPTH = 20;
export const MAX_TEMPLATE_NODES = 5_000;

export type Expression =
  | z.infer<typeof constSchema>
  | z.infer<typeof varSchema>
  | { k: 'agg'; fn: 'sum' | 'count' | 'min' | 'max'; over: string; of?: Expression }
  | { k: 'arith'; op: 'add' | 'sub' | 'mul' | 'divRound'; args: [Expression, Expression] }
  | { k: 'concat'; args: Expression[]; sep?: string }
  | { k: 'if'; cond: Condition; then: Expression; else: Expression }
  | { k: 'fmt'; of: Expression; format: FormatSpec };

export type Condition =
  | { k: 'cmp'; op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; args: [Expression, Expression] }
  | { k: 'in'; of: Expression; values: string[] }
  | { k: 'empty'; of: Expression }
  | { k: 'and'; args: Condition[] }
  | { k: 'or'; args: Condition[] }
  | { k: 'not'; of: Condition };

export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion('k', [
    constSchema,
    varSchema,
    z.object({
      k: z.literal('agg'),
      fn: z.enum(['sum', 'count', 'min', 'max']),
      over: z.string().min(1).max(120),
      of: z.lazy(() => expressionSchema).optional(),
    }),
    z.object({
      k: z.literal('arith'),
      op: z.enum(['add', 'sub', 'mul', 'divRound']),
      args: z.tuple([
        z.lazy(() => expressionSchema),
        z.lazy(() => expressionSchema),
      ]),
    }),
    z.object({
      k: z.literal('concat'),
      args: z.array(z.lazy(() => expressionSchema)).max(20),
      sep: z.string().max(10).optional(),
    }),
    z.object({
      k: z.literal('if'),
      cond: z.lazy(() => conditionSchema),
      then: z.lazy(() => expressionSchema),
      else: z.lazy(() => expressionSchema),
    }),
    z.object({
      k: z.literal('fmt'),
      of: z.lazy(() => expressionSchema),
      format: formatSpecSchema,
    }),
  ]),
) as z.ZodType<Expression>;

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('k', [
    z.object({
      k: z.literal('cmp'),
      op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
      args: z.tuple([
        z.lazy(() => expressionSchema),
        z.lazy(() => expressionSchema),
      ]),
    }),
    z.object({
      k: z.literal('in'),
      of: z.lazy(() => expressionSchema),
      values: z.array(z.string().max(200)).max(100),
    }),
    z.object({ k: z.literal('empty'), of: z.lazy(() => expressionSchema) }),
    z.object({ k: z.literal('and'), args: z.array(z.lazy(() => conditionSchema)).max(20) }),
    z.object({ k: z.literal('or'), args: z.array(z.lazy(() => conditionSchema)).max(20) }),
    z.object({ k: z.literal('not'), of: z.lazy(() => conditionSchema) }),
  ]),
) as z.ZodType<Condition>;

/** عمق درخت یک عبارت — برای بررسی سقف پیش از ذخیره و پیش از اجرا. */
export function expressionDepth(expression: Expression): number {
  switch (expression.k) {
    case 'const':
    case 'var':
      return 1;
    case 'agg':
      return 1 + (expression.of ? expressionDepth(expression.of) : 0);
    case 'arith':
      return 1 + Math.max(expressionDepth(expression.args[0]), expressionDepth(expression.args[1]));
    case 'concat':
      return 1 + Math.max(0, ...expression.args.map(expressionDepth));
    case 'if':
      return (
        1 +
        Math.max(
          conditionDepth(expression.cond),
          expressionDepth(expression.then),
          expressionDepth(expression.else),
        )
      );
    case 'fmt':
      return 1 + expressionDepth(expression.of);
  }
}

export function conditionDepth(condition: Condition): number {
  switch (condition.k) {
    case 'cmp':
      return 1 + Math.max(expressionDepth(condition.args[0]), expressionDepth(condition.args[1]));
    case 'in':
    case 'empty':
      return 1 + expressionDepth(condition.of);
    case 'and':
    case 'or':
      return 1 + Math.max(0, ...condition.args.map(conditionDepth));
    case 'not':
      return 1 + conditionDepth(condition.of);
  }
}

/** همه مسیرهای متغیری که یک عبارت به آن‌ها اشاره می‌کند — برای بررسی مجوز. */
export function collectVariablePaths(expression: Expression, into = new Set<string>()): Set<string> {
  switch (expression.k) {
    case 'var':
      into.add(expression.path);
      break;
    case 'agg':
      into.add(expression.over);
      if (expression.of) collectVariablePaths(expression.of, into);
      break;
    case 'arith':
      collectVariablePaths(expression.args[0], into);
      collectVariablePaths(expression.args[1], into);
      break;
    case 'concat':
      for (const argument of expression.args) collectVariablePaths(argument, into);
      break;
    case 'if':
      collectConditionPaths(expression.cond, into);
      collectVariablePaths(expression.then, into);
      collectVariablePaths(expression.else, into);
      break;
    case 'fmt':
      collectVariablePaths(expression.of, into);
      break;
    case 'const':
      break;
  }
  return into;
}

export function collectConditionPaths(condition: Condition, into = new Set<string>()): Set<string> {
  switch (condition.k) {
    case 'cmp':
      collectVariablePaths(condition.args[0], into);
      collectVariablePaths(condition.args[1], into);
      break;
    case 'in':
    case 'empty':
      collectVariablePaths(condition.of, into);
      break;
    case 'and':
    case 'or':
      for (const argument of condition.args) collectConditionPaths(argument, into);
      break;
    case 'not':
      collectConditionPaths(condition.of, into);
      break;
  }
  return into;
}
