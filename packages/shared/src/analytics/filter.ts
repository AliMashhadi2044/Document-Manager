/**
 * قرارداد فیلتر گزارش‌گیری عمومی (فاز ۸).
 *
 * فیلتر یک **درخت داده بسته** است، مثل عبارت‌های موتور گزارش (ADR-0007): نه SQL
 * دلخواه، نه نام ستون آزاد، نه عملگر آزاد. هر شرط سه چیز دارد — کلید فیلدی که
 * **سرور** می‌شناسد، یکی از عملگرهای شمرده‌شده، و مقدار. هر چیز دیگری خطای
 * اعتبارسنجی است.
 *
 * چرا این شکل: فیلتر از مرورگر می‌آید و اگر نام ستون یا عملگر از ورودی کاربر
 * مستقیم به کوئری می‌رفت، همان لحظه یک سطح تزریق باز می‌شد. اینجا مرورگر فقط
 * می‌تواند بگوید «این فیلد، این عملگر، این مقدار» و سرور تصمیم می‌گیرد که آن فیلد
 * به کدام ستون نگاشته می‌شود و آیا این کاربر حق فیلتر کردن رویش را دارد.
 *
 * **مقدارها همیشه رشته‌اند** — مبلغ ریالی از محدوده امن `number` بیرون می‌زند
 * (ADR-0003)، تاریخ به‌صورت ISO رد می‌شود و بله/خیر به‌صورت `'true'`/`'false'`.
 * تبدیل به نوع واقعی، کار سرور است و بر اساس **نوع اعلام‌شده فیلد** انجام می‌شود،
 * نه حدس از شکل مقدار.
 */

import { z } from 'zod';

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'startsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
  'isEmpty',
  'isNotEmpty',
  'isTrue',
  'isFalse',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'برابر است با',
  neq: 'برابر نیست با',
  contains: 'شامل',
  startsWith: 'شروع می‌شود با',
  gt: 'بزرگ‌تر از',
  gte: 'بزرگ‌تر یا برابر',
  lt: 'کوچک‌تر از',
  lte: 'کوچک‌تر یا برابر',
  between: 'بین',
  in: 'یکی از',
  isEmpty: 'خالی است',
  isNotEmpty: 'خالی نیست',
  isTrue: 'بله',
  isFalse: 'خیر',
};

/** نوع داده‌ای یک فیلد گزارش — تعیین می‌کند چه عملگرهایی معنا دارند. */
export const FIELD_TYPES = [
  'text',
  'money',
  'integer',
  'date',
  'jalaliDate',
  'boolean',
  'enum',
  'uuid',
] as const;
export type ReportFieldType = (typeof FIELD_TYPES)[number];

/**
 * عملگرهای مجاز هر نوع.
 *
 * این جدول در **سرور** اعمال می‌شود و در مرورگر فقط فهرست گزینه‌ها را می‌سازد. پس
 * ساختن یک درخواست دستی با عملگر بی‌معنا (مثل `contains` روی مبلغ) رد می‌شود، نه
 * اینکه به یک کوئری عجیب تبدیل شود.
 */
export const OPERATORS_BY_TYPE: Record<ReportFieldType, readonly FilterOperator[]> = {
  text: ['contains', 'startsWith', 'eq', 'neq', 'isEmpty', 'isNotEmpty', 'in'],
  money: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
  integer: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
  jalaliDate: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
  boolean: ['isTrue', 'isFalse'],
  enum: ['eq', 'neq', 'in', 'isEmpty', 'isNotEmpty'],
  uuid: ['eq', 'neq', 'in', 'isEmpty', 'isNotEmpty'],
};

/** عملگرهایی که مقدار نمی‌گیرند. */
export const VALUELESS_OPERATORS: readonly FilterOperator[] = [
  'isEmpty',
  'isNotEmpty',
  'isTrue',
  'isFalse',
];

export function operatorNeedsValue(op: FilterOperator): boolean {
  return !VALUELESS_OPERATORS.includes(op);
}

export function operatorValueCount(op: FilterOperator): 0 | 1 | 2 | 'many' {
  if (!operatorNeedsValue(op)) return 0;
  if (op === 'between') return 2;
  if (op === 'in') return 'many';
  return 1;
}

export const filterConditionSchema = z.object({
  field: z.string().min(1).max(80),
  op: z.enum(FILTER_OPERATORS),
  /**
   * مقدارها همیشه فهرستی از رشته‌اند، حتی برای یک مقدار.
   *
   * یک شکل برای همه عملگرها یعنی یک مسیر اعتبارسنجی؛ شکل‌های جداگانه (`value` و
   * `values` و `from`/`to`) سه مسیر می‌شد و سه جای ممکن برای جا افتادن یک بررسی.
   */
  values: z.array(z.string().max(300)).max(100).default([]),
});
export type FilterCondition = z.infer<typeof filterConditionSchema>;

/** حداکثر عمق تودرتویی گروه‌های فیلتر. */
export const MAX_FILTER_DEPTH = 3;
export const MAX_FILTER_CONDITIONS = 40;

export interface FilterGroup {
  readonly combine: 'and' | 'or';
  readonly conditions: readonly FilterCondition[];
  readonly groups?: readonly FilterGroup[];
}

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    combine: z.enum(['and', 'or']).default('and'),
    conditions: z.array(filterConditionSchema).max(MAX_FILTER_CONDITIONS).default([]),
    groups: z.array(z.lazy(() => filterGroupSchema)).max(10).optional(),
  }),
) as z.ZodType<FilterGroup>;

export const EMPTY_FILTER: FilterGroup = { combine: 'and', conditions: [] };

/** شمارش شرط‌ها و عمق — سقف‌ها پیش از ساختن کوئری بررسی می‌شوند. */
export function filterStats(group: FilterGroup, depth = 1): { conditions: number; depth: number } {
  let conditions = group.conditions.length;
  let maxDepth = depth;

  for (const child of group.groups ?? []) {
    const stats = filterStats(child, depth + 1);
    conditions += stats.conditions;
    maxDepth = Math.max(maxDepth, stats.depth);
  }

  return { conditions, depth: maxDepth };
}

export const sortSchema = z.object({
  field: z.string().min(1).max(80),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type ReportSort = z.infer<typeof sortSchema>;

/**
 * درخواست یک گزارش.
 *
 * `columns` فهرست ستون‌های خواسته‌شده است و **سرور فقط همان‌ها را می‌خواند**: اگر
 * ستونی خواسته نشده، از دیتابیس هم خوانده نمی‌شود. این هم بهینگی است و هم یک لایه
 * کمتر برای افشای ناخواسته.
 */
export const reportQuerySchema = z.object({
  columns: z.array(z.string().min(1).max(80)).max(60).default([]),
  filter: filterGroupSchema.default(EMPTY_FILTER),
  sort: z.array(sortSchema).max(3).default([]),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
  /** فقط برای مجموعه‌داده‌های تجمیعی: بر اساس کدام بُعد گروه‌بندی شود. */
  groupBy: z.string().min(1).max(80).optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
