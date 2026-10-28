import {
  MAX_FILTER_CONDITIONS,
  MAX_FILTER_DEPTH,
  filterStats,
  operatorValueCount,
  type FilterCondition,
  type FilterGroup,
  type Permission,
  type ReportFieldType,
} from '@dm/shared';

import { AppError } from '../../common/errors/app-error';
import {
  allowedOperators,
  findField,
  hasListHop,
  splitListPath,
  type DatasetDefinition,
  type ReportFieldDefinition,
} from './datasets';

/**
 * تبدیل درخت فیلتر به شرط Prisma.
 *
 * چهار دروازه، به همین ترتیب، و هیچ‌کدام قابل رد شدن نیست:
 *
 *  ۱. **فیلد باید در مجموعه‌داده باشد.** نام ستون هرگز از ورودی کاربر به کوئری
 *     نمی‌رسد؛ کلید عمومی به مسیر داخلی **نگاشت** می‌شود.
 *  ۲. **کاربر باید مجوز آن فیلد را داشته باشد.** وگرنه ۴۰۳ — نه «نتیجه خالی»، چون
 *     فیلتر روی ستونی که نباید ببیند، خودش یک کانال استنتاج است: با فیلتر کردن روی
 *     مبلغی که حق دیدنش را ندارد، می‌شد مقدارش را حدس زد.
 *  ۳. **عملگر باید با نوع فیلد بخواند.** `contains` روی مبلغ رد می‌شود.
 *  ۴. **مقدار باید با نوع فیلد بخواند.** مبلغ باید عدد صحیح باشد، تاریخ باید تاریخ
 *     معتبر باشد. تبدیل بر اساس **نوع اعلام‌شده** انجام می‌شود، نه حدس از شکل مقدار.
 */

export function buildWhere(
  dataset: DatasetDefinition,
  filter: FilterGroup,
  permissions: readonly Permission[],
): Record<string, unknown> {
  const stats = filterStats(filter);
  if (stats.conditions > MAX_FILTER_CONDITIONS) {
    throw AppError.validation(`تعداد شرط‌های فیلتر از ${MAX_FILTER_CONDITIONS} بیشتر است`);
  }
  if (stats.depth > MAX_FILTER_DEPTH) {
    throw AppError.validation(`عمق گروه‌های فیلتر از ${MAX_FILTER_DEPTH} بیشتر است`);
  }

  return groupToWhere(dataset, filter, permissions);
}

function groupToWhere(
  dataset: DatasetDefinition,
  group: FilterGroup,
  permissions: readonly Permission[],
): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [];

  for (const condition of group.conditions) {
    parts.push(conditionToWhere(dataset, condition, permissions));
  }
  for (const child of group.groups ?? []) {
    const nested = groupToWhere(dataset, child, permissions);
    if (Object.keys(nested).length > 0) parts.push(nested);
  }

  if (parts.length === 0) return {};
  if (parts.length === 1 && group.combine === 'and') return parts[0] as Record<string, unknown>;

  return group.combine === 'or' ? { OR: parts } : { AND: parts };
}

function conditionToWhere(
  dataset: DatasetDefinition,
  condition: FilterCondition,
  permissions: readonly Permission[],
): Record<string, unknown> {
  const field = findField(dataset, condition.field);
  if (!field) {
    throw AppError.validation(`فیلد «${condition.field}» در این گزارش وجود ندارد`);
  }
  if (field.filterable === false) {
    throw AppError.validation(`روی فیلد «${field.titleFa}» نمی‌شود فیلتر گذاشت`);
  }
  for (const required of field.requiredPermissions ?? []) {
    if (!permissions.includes(required)) {
      // نام مجوز لو نمی‌رود؛ همان قاعده پیام‌های دسترسی بقیه سامانه.
      throw AppError.forbidden('فیلتر روی این فیلد در اختیار نقش شما نیست');
    }
  }
  if (!allowedOperators(field).includes(condition.op)) {
    throw AppError.validation(
      `عملگر انتخاب‌شده با نوع فیلد «${field.titleFa}» نمی‌خواند`,
    );
  }

  const expected = operatorValueCount(condition.op);
  if (expected === 0 && condition.values.length > 0) {
    throw AppError.validation(`عملگر انتخاب‌شده برای «${field.titleFa}» مقدار نمی‌گیرد`);
  }
  if (expected === 1 && condition.values.length !== 1) {
    throw AppError.validation(`برای «${field.titleFa}» یک مقدار لازم است`);
  }
  if (expected === 2 && condition.values.length !== 2) {
    throw AppError.validation(`برای «${field.titleFa}» دو مقدار (از و تا) لازم است`);
  }
  if (expected === 'many' && condition.values.length === 0) {
    throw AppError.validation(`برای «${field.titleFa}» دست‌کم یک مقدار لازم است`);
  }

  return nestField(field, leafCondition(field, condition));
}

/**
 * شرط را زیر مسیر فیلد می‌نشاند.
 *
 * برای رابطهٔ یک‌به‌چند، یک `some` وسط می‌آید: «فاکتوری که **دست‌کم یکی** از
 * ردیف‌هایش این شرح را دارد». بدون آن، Prisma شرط را نمی‌شناسد و کوئری می‌شکند.
 */
function nestField(field: ReportFieldDefinition, leaf: unknown): Record<string, unknown> {
  const split = splitListPath(field.path);
  if (!split) return nest(field.path, leaf);

  // بقیهٔ مسیر خودش می‌تواند پرش یک‌به‌چند دیگری داشته باشد؛ بازگشتی حلش می‌کنیم.
  const inner =
    split.after === ''
      ? leaf
      : nestField({ ...field, path: split.after }, leaf);

  return nest(split.before, { some: inner });
}

/** شرط برگ — همان چیزی که زیر مسیر فیلد می‌نشیند. */
function leafCondition(field: ReportFieldDefinition, condition: FilterCondition): unknown {
  const values = condition.values;

  switch (condition.op) {
    case 'isEmpty':
      return null;
    case 'isNotEmpty':
      return { not: null };
    case 'isTrue':
      return true;
    case 'isFalse':
      return false;

    case 'contains':
      return { contains: values[0] as string, mode: 'insensitive' };
    case 'startsWith':
      return { startsWith: values[0] as string, mode: 'insensitive' };

    case 'in':
      return { in: values.map((value) => coerce(field, value)) };

    case 'between': {
      const [from, to] = [coerce(field, values[0] as string), coerce(field, values[1] as string)];
      return { gte: from, lte: to };
    }

    case 'eq':
      return coerce(field, values[0] as string);
    case 'neq':
      return { not: coerce(field, values[0] as string) };

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { [condition.op]: coerce(field, values[0] as string) };
  }
}

/**
 * تبدیل مقدار رشته‌ای به نوع واقعی.
 *
 * مبلغ به `bigint` تبدیل می‌شود، نه `number`: مبلغ ریالی از محدوده امن `number`
 * بیرون می‌زند (ADR-0003) و یک مقایسه با عدد گردشده، ردیف‌های مرزی را بی‌صدا جا
 * می‌گذارد.
 */
export function coerce(field: ReportFieldDefinition, raw: string): unknown {
  return coerceByType(field.type, raw, field.titleFa);
}

export function coerceByType(type: ReportFieldType, raw: string, titleFa: string): unknown {
  switch (type) {
    case 'money': {
      if (!/^-?\d{1,20}$/u.test(raw)) {
        throw AppError.validation(`مقدار «${titleFa}» باید عدد صحیح باشد`);
      }
      return BigInt(raw);
    }

    case 'integer': {
      if (!/^-?\d{1,10}$/u.test(raw)) {
        throw AppError.validation(`مقدار «${titleFa}» باید عدد صحیح باشد`);
      }
      return Number(raw);
    }

    case 'boolean':
      return raw === 'true';

    case 'date':
    case 'jalaliDate': {
      // تاریخ همیشه به‌صورت ISO میلادی رد می‌شود؛ تبدیل شمسی در مرورگر انجام
      // می‌شود، چون قرارداد مرز API در کل سامانه همین است.
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) {
        throw AppError.validation(`مقدار «${titleFa}» تاریخ معتبری نیست`);
      }
      return date;
    }

    case 'uuid': {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(raw)) {
        throw AppError.validation(`مقدار «${titleFa}» شناسه معتبری نیست`);
      }
      return raw;
    }

    case 'text':
    case 'enum':
    default:
      return raw;
  }
}

/** `a.b.c` + شرط ← `{ a: { b: { c: شرط } } }` */
export function nest(path: string, leaf: unknown): Record<string, unknown> {
  const segments = path.split('.');
  let result: unknown = leaf;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    result = { [segments[index] as string]: result };
  }
  return result as Record<string, unknown>;
}

/**
 * یک بند `orderBy` از مسیر فیلد.
 *
 * شمارش رابطه شکل خودش را دارد: `{ invoices: { _count: 'asc' } }` و نه
 * `{ _count: { invoices: 'asc' } }`. مسیر `_count.invoices` را برای `select`
 * نوشته‌ایم و همان‌طور که بود به `orderBy` می‌رفت — شرطی که پریزما نمی‌شناسد و
 * مرتب‌سازی روی «تعداد فاکتور» را ۵۰۰ می‌کرد.
 */
function orderNode(path: string, dir: 'asc' | 'desc'): Record<string, unknown> {
  const segments = path.split('.');
  if (segments[0] === '_count' && segments.length === 2) {
    return { [segments[1] as string]: { _count: dir } };
  }
  return nest(path, dir);
}

/**
 * ترتیب مرتب‌سازی، با همان دروازه‌ها.
 *
 * مرتب‌سازی روی ستونی که کاربر حق دیدنش را ندارد هم رد می‌شود: ترتیب ردیف‌ها، مقدار
 * آن ستون را لو می‌دهد بی‌آنکه ستون در خروجی باشد.
 */
export function buildOrderBy(
  dataset: DatasetDefinition,
  sort: readonly { field: string; dir: 'asc' | 'desc' }[],
  permissions: readonly Permission[],
): Record<string, unknown>[] {
  const order: Record<string, unknown>[] = [];

  for (const entry of sort) {
    const definition = findField(dataset, entry.field);
    if (!definition) {
      throw AppError.validation(`فیلد «${entry.field}» در این گزارش وجود ندارد`);
    }
    if (definition.sortable === false || hasListHop(definition.path)) {
      throw AppError.validation(`روی فیلد «${definition.titleFa}» نمی‌شود مرتب‌سازی کرد`);
    }
    for (const required of definition.requiredPermissions ?? []) {
      if (!permissions.includes(required)) {
        throw AppError.forbidden('مرتب‌سازی روی این فیلد در اختیار نقش شما نیست');
      }
    }
    order.push(orderNode(definition.path, entry.dir));
  }

  if (order.length === 0) {
    for (const entry of dataset.defaultSort) {
      const definition = findField(dataset, entry.field);
      if (definition) order.push(orderNode(definition.path, entry.dir));
    }
  }

  /*
   * ترتیب ثانویه پایدار.
   *
   * بدون آن، دو ردیف با مقدار برابرِ ستون مرتب‌سازی می‌توانند بین صفحه اول و دوم
   * جابه‌جا شوند و کاربر یک ردیف را دو بار ببیند و یکی را هیچ‌وقت — همان قاعده‌ای
   * که فهرست فاکتورها از فاز ۳ دارد.
   */
  const identity = dataset.model === 'invoicePayment' ? 'invoiceId' : 'id';
  if (dataset.model !== 'archiveMetadata') {
    order.push({ [identity]: 'asc' });
  } else {
    order.push({ documentId: 'asc' });
  }

  return order;
}
