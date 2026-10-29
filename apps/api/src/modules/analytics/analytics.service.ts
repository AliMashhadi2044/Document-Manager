import { Injectable } from '@nestjs/common';
import type { Permission, ReportQuery } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';
import {
  DATASETS,
  DATASET_BY_KEY,
  ENUM_LABELS,
  allowedOperators,
  findField,
  plainPath,
  visibleFields,
  type DatasetDefinition,
  type ReportFieldDefinition,
} from './datasets';
import { buildOrderBy, buildWhere, nest } from './filter.builder';

/** یک سلول خروجی: مقدار خام (رشته‌شده) به‌علاوه نوعش، تا مرورگر بتواند قالب بدهد. */
export type ReportCellValue = string | number | boolean | null;

export interface ReportRow {
  readonly [column: string]: ReportCellValue;
}

export interface ReportResult {
  /** کلید فیلدی که ردیف را برای پنجرهٔ جزئیات می‌شناساند؛ `null` یعنی جزئیات ندارد. */
  readonly detailField?: string | null;
  readonly dataset: string;
  readonly columns: readonly { readonly key: string; readonly titleFa: string; readonly type: string }[];
  readonly rows: readonly ReportRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  /** جمع ستون‌های مبلغی **روی همه ردیف‌های فیلترشده**، نه فقط صفحه جاری. */
  readonly totals: Readonly<Record<string, string>>;
}

/**
 * اجرای گزارش‌های عمومی (فاز ۸).
 *
 * قاعده‌ای که شکل این سرویس را تعیین می‌کند: **فیلتر، مرتب‌سازی و صفحه‌بندی همیشه
 * سمت سرور** (معیار پذیرش ۱). هیچ مسیری کل جدول را برنمی‌گرداند؛ `pageSize` سقف
 * دارد و خروجی فایل هم همان `where` و `orderBy` را دوباره می‌سازد، نه یک مسیر دوم.
 *
 * سه لایه دسترسی، همان الگوی بقیه سامانه:
 *  ۱. مجوز مجموعه‌داده (`document:read`، `audit:read`، …).
 *  ۲. مجوز **سطح فیلد** — ستونی که کاربر مجوزش را ندارد نه خوانده می‌شود، نه قابل
 *     فیلتر و مرتب‌سازی است.
 *  ۳. دامنه دسترسی سند — همان شرط کوئری `DocumentAccessService`، چون چیزی که در
 *     فهرست اسناد دیده نمی‌شود نباید در گزارش دیده شود.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DocumentAccessService,
  ) {}

  /**
   * فهرست گزینه‌های یک فیلد، از **مقدارهای یکتایی که واقعاً در داده هست**.
   *
   * دامنهٔ دسترسی سند همین‌جا هم اعمال می‌شود: فهرست مدرسه‌ها خودش اطلاعات است و
   * کاربری که سند آن مدرسه را نمی‌بیند، نباید نامش را در فیلتر ببیند.
   *
   * سقف دارد چون این فهرست به یک `select` در مرورگر می‌رود؛ اگر پر شد، گزینه‌ها
   * حذف می‌شوند و فیلد به جعبهٔ متن آزاد برمی‌گردد — نصفِ یک فهرست، بدتر از نداشتنش
   * است، چون کاربر فکر می‌کند همهٔ گزینه‌ها را می‌بیند.
   */
  private static readonly OPTION_LIMIT = 300;

  private async fieldOptions(
    field: ReportFieldDefinition,
    user: AuthenticatedUser,
  ): Promise<readonly { value: string; label: string }[] | null> {
    const source = field.optionsFrom;
    if (!source) return null;

    const scope = this.access.scope(user) as Record<string, unknown>;
    const where = Object.keys(scope).length === 0 ? {} : nest(source.documentPath, scope);

    const rows = (await (
      this.prisma[source.model] as unknown as {
        findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
      }
    ).findMany({
      where,
      select: { [source.column]: true },
      distinct: [source.column],
      orderBy: { [source.column]: 'asc' },
      take: AnalyticsService.OPTION_LIMIT + 1,
    })) as Record<string, unknown>[];

    if (rows.length === 0 || rows.length > AnalyticsService.OPTION_LIMIT) return null;

    return rows
      .map((row) => String(row[source.column] ?? ''))
      .filter((value) => value !== '')
      .map((value) => ({ value, label: value }));
  }

  /** مجموعه‌داده‌هایی که این کاربر می‌تواند ببیند، با فیلدهای مجازش. */
  async describeDatasets(user: AuthenticatedUser) {
    const visible = DATASETS.filter((dataset) =>
      dataset.requiredPermissions.every((permission) => user.permissions.includes(permission)),
    );

    const options = new Map<string, readonly { value: string; label: string }[]>();
    for (const dataset of visible) {
      for (const field of visibleFields(dataset, user.permissions)) {
        if (!field.optionsFrom) continue;
        const resolved = await this.fieldOptions(field, user);
        if (resolved) options.set(`${dataset.key}.${field.key}`, resolved);
      }
    }

    return visible.map((dataset) => ({
      key: dataset.key,
      titleFa: dataset.titleFa,
      description: dataset.description,
      kind: dataset.kind,
      defaultColumns: dataset.defaultColumns,
      defaultSort: dataset.defaultSort,
      detailField: dataset.detailField ?? null,
      groupBy: dataset.groupBy ?? null,
      fields: visibleFields(dataset, user.permissions).map((field) => ({
        key: field.key,
        titleFa: field.titleFa,
        type: field.type,
        filterable: field.filterable !== false,
        sortable: field.sortable !== false,
        operators: field.filterable === false ? [] : allowedOperators(field),
        enumValues: field.enumValues ?? options.get(`${dataset.key}.${field.key}`) ?? null,
      })),
    }));
  }

  requireDataset(datasetKey: string, user: AuthenticatedUser): DatasetDefinition {
    const dataset = DATASET_BY_KEY.get(datasetKey);
    // مجموعه‌داده ناشناخته و مجموعه‌داده بدون مجوز هر دو ۴۰۴ می‌گیرند: وجود گزارشی
    // که کاربر حق دیدنش را ندارد هم اطلاعات است.
    if (!dataset) throw AppError.notFound('این گزارش وجود ندارد');
    if (!dataset.requiredPermissions.every((p) => user.permissions.includes(p))) {
      throw AppError.notFound('این گزارش وجود ندارد');
    }
    return dataset;
  }

  /** ستون‌های درخواستی، پس از بررسی وجود و مجوز. */
  resolveColumns(
    dataset: DatasetDefinition,
    requested: readonly string[],
    permissions: readonly Permission[],
  ): readonly ReportFieldDefinition[] {
    const keys = requested.length > 0 ? requested : dataset.defaultColumns;
    const columns: ReportFieldDefinition[] = [];

    for (const key of keys) {
      const field = findField(dataset, key);
      if (!field) throw AppError.validation(`ستون «${key}» در این گزارش وجود ندارد`);
      for (const required of field.requiredPermissions ?? []) {
        if (!permissions.includes(required)) {
          throw AppError.forbidden('یکی از ستون‌های خواسته‌شده در اختیار نقش شما نیست');
        }
      }
      if (!columns.some((existing) => existing.key === field.key)) columns.push(field);
    }

    if (columns.length === 0) {
      throw AppError.validation('دست‌کم یک ستون باید انتخاب شود');
    }
    return columns;
  }

  /**
   * شرط کامل کوئری: فیلتر کاربر **و** دامنه دسترسی سند.
   *
   * دو شرط با `AND` ترکیب می‌شوند و دامنه دسترسی همیشه بیرونی‌ترین لایه است؛ هیچ
   * فیلتری نمی‌تواند آن را باز کند.
   */
  whereFor(
    dataset: DatasetDefinition,
    query: Pick<ReportQuery, 'filter'>,
    user: AuthenticatedUser,
  ): Record<string, unknown> {
    const userWhere = buildWhere(dataset, query.filter, user.permissions);
    const parts = [this.scopeWhere(dataset, user), dataset.baseWhere ?? {}, userWhere].filter(
      (part) => Object.keys(part).length > 0,
    );

    if (parts.length === 0) return {};
    if (parts.length === 1) return parts[0] as Record<string, unknown>;
    return { AND: parts };
  }

  private scopeWhere(
    dataset: DatasetDefinition,
    user: AuthenticatedUser,
  ): Record<string, unknown> {
    if (dataset.documentScope === 'none') return {};

    const scope = this.access.scope(user) as Record<string, unknown>;
    if (Object.keys(scope).length === 0) return {};

    if (dataset.documentScope === 'root') return scope;
    return nest(dataset.documentPath as string, scope);
  }

  async run(datasetKey: string, query: ReportQuery, user: AuthenticatedUser): Promise<ReportResult> {
    const dataset = this.requireDataset(datasetKey, user);
    if (dataset.kind === 'grouped') return this.runGrouped(dataset, query, user);

    const columns = this.resolveColumns(dataset, query.columns, user.permissions);
    const where = this.whereFor(dataset, query, user);
    const orderBy = buildOrderBy(dataset, query.sort, user.permissions);

    const delegate = this.delegateOf(dataset);

    /*
      فیلدِ شناسایی ردیف، حتی وقتی ستونش انتخاب نشده.

      پنجرهٔ جزئیات باید بداند کدام ردیف را باز کند، و شناسه چیزی نیست که کاربر
      بخواهد در جدول ببیند. در **ستون‌های** پاسخ نمی‌آید، فقط در خودِ ردیف.
    */
    const detail = dataset.detailField
      ? findField(dataset, dataset.detailField)
      : undefined;
    const selected =
      detail && !columns.some((column) => column.key === detail.key)
        ? [...columns, detail]
        : columns;

    const [rows, total] = await Promise.all([
      delegate.findMany({
        where,
        orderBy,
        select: buildSelect(selected),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      delegate.count({ where }),
    ]);

    const totals = await this.sumMoneyColumns(dataset, columns, where);

    return {
      dataset: dataset.key,
      columns: columns.map((column) => ({
        key: column.key,
        titleFa: column.titleFa,
        type: column.type,
      })),
      rows: rows.map((row) => flatten(row, selected)),
      detailField: dataset.detailField ?? null,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
      totals,
    };
  }

  /**
   * خواندن **همه** ردیف‌های فیلترشده برای خروجی فایل.
   *
   * با همان `where` و `orderBy` کوئری جدول، پس خروجی دقیقاً همان چیزی است که کاربر
   * روی صفحه می‌بیند (معیار پذیرش ۲). خواندن به‌صورت صفحه‌صفحه انجام می‌شود تا یک
   * خروجی بزرگ، حافظه سرویس را یک‌جا پر نکند.
   */
  async *streamRows(
    datasetKey: string,
    query: ReportQuery,
    user: AuthenticatedUser,
    batchSize = 500,
  ): AsyncGenerator<readonly ReportRow[]> {
    const dataset = this.requireDataset(datasetKey, user);

    if (dataset.kind === 'grouped') {
      const result = await this.runGrouped(dataset, { ...query, page: 1, pageSize: 200 }, user);
      yield result.rows;
      return;
    }

    const columns = this.resolveColumns(dataset, query.columns, user.permissions);
    const where = this.whereFor(dataset, query, user);
    const orderBy = buildOrderBy(dataset, query.sort, user.permissions);
    const delegate = this.delegateOf(dataset);

    for (let skip = 0; ; skip += batchSize) {
      const batch = await delegate.findMany({
        where,
        orderBy,
        select: buildSelect(columns),
        skip,
        take: batchSize,
      });
      if (batch.length === 0) return;
      yield batch.map((row) => flatten(row, columns));
      if (batch.length < batchSize) return;
    }
  }

  async countRows(datasetKey: string, query: ReportQuery, user: AuthenticatedUser): Promise<number> {
    const dataset = this.requireDataset(datasetKey, user);
    if (dataset.kind === 'grouped') {
      const result = await this.runGrouped(dataset, { ...query, page: 1, pageSize: 200 }, user);
      return result.total;
    }
    return this.delegateOf(dataset).count({ where: this.whereFor(dataset, query, user) });
  }

  /**
   * گزارش تجمیعی «مبالغ و مالیات».
   *
   * `groupBy` Prisma تنها روی ستون‌های **همان جدول** کار می‌کند و دو بُعد این گزارش
   * (سال مالی و وضعیت سند) در جدول سند و یکی (نام فروشنده) در snapshot است. SQL خام
   * هم انتخاب نشد، چون گروه‌بندی پویا با نام ستونِ ساخته‌شده از ورودی، همان سطح
   * حمله‌ای است که این فاز سراسر از آن پرهیز می‌کند.
   *
   * پس ردیف‌های لازم — فقط ستون‌های بُعد و پنج مبلغ — خوانده و در حافظه تجمیع
   * می‌شوند، با سقف صریح. محدودیت صادقانه: برای داده‌ای به‌اندازه چند ده هزار فاکتور
   * کار می‌کند و بیشتر از آن خطای روشن می‌دهد، نه نتیجه ناقص.
   */
  private async runGrouped(
    dataset: DatasetDefinition,
    query: ReportQuery,
    user: AuthenticatedUser,
  ): Promise<ReportResult> {
    const dimensionKey = query.groupBy ?? dataset.groupBy?.[0]?.key ?? 'fiscalYear';
    const dimension = (dataset.groupBy ?? []).find((item) => item.key === dimensionKey);
    if (!dimension) throw AppError.validation('بُعد گروه‌بندی انتخاب‌شده مجاز نیست');

    const columns = this.resolveColumns(dataset, query.columns, user.permissions);
    const where = this.whereFor(dataset, query, user);

    /*
     * گروه‌بندی با Prisma انجام می‌شود، نه SQL خام: مقدار بُعد از یک رابطه می‌آید،
     * پس ردیف‌های لازم (فقط ستون بُعد و پنج مبلغ) خوانده و در حافظه تجمیع می‌شوند.
     * سقف `MAX_GROUPED_ROWS` جلوی خواندن بی‌مرز را می‌گیرد و وقتی به سقف برسیم،
     * خطای صریح می‌دهیم — نه یک نتیجه ناقصِ به‌ظاهر درست.
     */
    const MAX_GROUPED_ROWS = 50_000;
    const rows = (await this.prisma.invoice.findMany({
      where,
      select: {
        grossAmount: true,
        discountAmount: true,
        netAmount: true,
        taxAmount: true,
        totalAmount: true,
        invoiceKind: true,
        chapterTitleSnapshot: true,
        vendorSnapshot: { select: { name: true } },
        document: { select: { fiscalYear: true, status: true } },
      },
      take: MAX_GROUPED_ROWS + 1,
    })) as GroupedInvoiceRow[];

    if (rows.length > MAX_GROUPED_ROWS) {
      throw AppError.conflict(
        'REPORT_TOO_LARGE',
        `این گزارش روی بیش از ${MAX_GROUPED_ROWS.toLocaleString('en-US')} فاکتور تجمیع می‌کند؛ فیلتر را محدودتر کنید.`,
      );
    }

    const buckets = new Map<string, Record<string, bigint | number>>();
    for (const row of rows) {
      const key = groupKeyOf(row, dimensionKey);
      // کلیدهای سطل، همان کلید ستون‌های تجمیعی‌اند و پیشوند `sum` دارند تا با
      // فیلدهای فیلترِ فاکتور (که همین نام‌ها را دارند) یکی نشوند.
      const bucket = buckets.get(key) ?? {
        rowCount: 0,
        sumGross: 0n,
        sumDiscount: 0n,
        sumNet: 0n,
        sumTax: 0n,
        sumTotal: 0n,
      };
      bucket.rowCount = (bucket.rowCount as number) + 1;
      bucket.sumGross = (bucket.sumGross as bigint) + row.grossAmount;
      bucket.sumDiscount = (bucket.sumDiscount as bigint) + row.discountAmount;
      bucket.sumNet = (bucket.sumNet as bigint) + row.netAmount;
      bucket.sumTax = (bucket.sumTax as bigint) + row.taxAmount;
      bucket.sumTotal = (bucket.sumTotal as bigint) + row.totalAmount;
      buckets.set(key, bucket);
    }

    const sortField = query.sort[0]?.field ?? dataset.defaultSort[0]?.field ?? 'sumTotal';
    const sortDir = query.sort[0]?.dir ?? dataset.defaultSort[0]?.dir ?? 'desc';

    const all = [...buckets.entries()]
      .map(([group, bucket]) => ({ group, ...bucket }))
      .sort((left, right) => compareGroups(left, right, sortField, sortDir));

    const total = all.length;
    const page = all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);

    const totals: Record<string, string> = {};
    for (const column of columns) {
      if (column.type !== 'money') continue;
      let sum = 0n;
      for (const bucket of all) {
        const value = (bucket as unknown as Record<string, unknown>)[column.key];
        if (typeof value === 'bigint') sum += value;
      }
      totals[column.key] = sum.toString();
    }

    return {
      dataset: dataset.key,
      columns: columns.map((column) => ({
        key: column.key,
        titleFa: column.key === 'group' ? dimension.titleFa : column.titleFa,
        type: column.type,
      })),
      rows: page.map((bucket) => {
        const row: Record<string, ReportCellValue> = {};
        for (const column of columns) {
          const value = (bucket as Record<string, unknown>)[column.key];
          row[column.key] =
            typeof value === 'bigint'
              ? value.toString()
              : ((value ?? null) as ReportCellValue);
        }
        return row;
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
      totals,
    };
  }

  /**
   * جمع ستون‌های مبلغی روی **همه** ردیف‌های فیلترشده.
   *
   * جمع صفحه جاری در یک گزارش مالی گمراه‌کننده است: کاربر «جمع کل» را می‌خواند و
   * فرض می‌کند جمع همه ردیف‌های فیلترشده است. جمع با `aggregate` در دیتابیس انجام
   * می‌شود، نه با جمع کردن ردیف‌های خوانده‌شده.
   */
  private async sumMoneyColumns(
    dataset: DatasetDefinition,
    columns: readonly ReportFieldDefinition[],
    where: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const moneyColumns = columns.filter(
      (column) => column.type === 'money' && !column.path.includes('.'),
    );
    if (moneyColumns.length === 0) return {};

    const delegate = this.delegateOf(dataset) as unknown as {
      aggregate: (args: unknown) => Promise<{ _sum: Record<string, bigint | null> }>;
    };

    const sum: Record<string, true> = {};
    for (const column of moneyColumns) sum[column.path] = true;

    const result = await delegate.aggregate({ where, _sum: sum });

    const totals: Record<string, string> = {};
    for (const column of moneyColumns) {
      totals[column.key] = (result._sum[column.path] ?? 0n).toString();
    }
    return totals;
  }

  /**
   * delegate مدل.
   *
   * نام مدل از **فهرست بسته** `DatasetDefinition.model` می‌آید، نه از ورودی کاربر؛
   * پس این دسترسی پویا یک راه رسیدن به مدل دلخواه نیست.
   */
  private delegateOf(dataset: DatasetDefinition): {
    findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
    count: (args: unknown) => Promise<number>;
  } {
    const delegate = (this.prisma as unknown as Record<string, unknown>)[dataset.model];
    return delegate as {
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
      count: (args: unknown) => Promise<number>;
    };
  }
}

interface GroupedInvoiceRow {
  readonly grossAmount: bigint;
  readonly discountAmount: bigint;
  readonly netAmount: bigint;
  readonly taxAmount: bigint;
  readonly totalAmount: bigint;
  readonly invoiceKind: string;
  readonly chapterTitleSnapshot: string;
  readonly vendorSnapshot: { readonly name: string } | null;
  readonly document: { readonly fiscalYear: number; readonly status: string };
}

function groupKeyOf(row: GroupedInvoiceRow, dimension: string): string {
  switch (dimension) {
    case 'fiscalYear':
      return String(row.document.fiscalYear);
    case 'chapterTitle':
      return row.chapterTitleSnapshot;
    case 'vendorName':
      return row.vendorSnapshot?.name ?? 'بدون فروشنده';
    case 'invoiceKind':
      return ENUM_LABELS.invoiceKind?.[row.invoiceKind] ?? row.invoiceKind;
    case 'documentStatus':
      return ENUM_LABELS.documentStatus?.[row.document.status] ?? row.document.status;
    default:
      return '—';
  }
}

function compareGroups(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  field: string,
  dir: 'asc' | 'desc',
): number {
  const a = left[field];
  const b = right[field];
  let result: number;

  if (typeof a === 'bigint' && typeof b === 'bigint') result = a < b ? -1 : a > b ? 1 : 0;
  else if (typeof a === 'number' && typeof b === 'number') result = a - b;
  else result = String(a ?? '').localeCompare(String(b ?? ''), 'fa');

  // ترتیب ثانویه روی نام گروه، تا صفحه‌بندی پایدار بماند.
  if (result === 0) {
    result = String(left.group ?? '').localeCompare(String(right.group ?? ''), 'fa');
  }
  return dir === 'desc' ? -result : result;
}

/**
 * ساخت `select` از ستون‌های خواسته‌شده.
 *
 * **فقط** همان ستون‌ها خوانده می‌شوند. این هم بهینگی است (ستون متنی بزرگی که کسی
 * نخواسته، از دیتابیس بیرون نمی‌آید) و هم یک لایه کمتر برای افشای ناخواسته.
 */
export function buildSelect(columns: readonly ReportFieldDefinition[]): Record<string, unknown> {
  const select: Record<string, unknown> = {};

  for (const column of columns) {
    // نشان رابطهٔ یک‌به‌چند فقط برای فیلتر است؛ `select` همان مسیر ساده را می‌خواهد.
    const segments = plainPath(column.path).split('.');

    if (segments[0] === '_count') {
      const current = (select._count as { select?: Record<string, unknown> } | undefined) ?? {
        select: {},
      };
      // شرط شمارش، وقتی تعریف فیلد دارد: `_count` بیرون از `where` کوئری است و
      // دامنهٔ سند به آن نمی‌رسد.
      (current.select as Record<string, unknown>)[segments[1] as string] = column.countWhere
        ? { where: column.countWhere }
        : true;
      select._count = current;
      continue;
    }

    let cursor = select;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const key = segments[index] as string;
      const existing = cursor[key] as { select?: Record<string, unknown> } | undefined;
      const node = existing ?? { select: {} };
      cursor[key] = node;
      cursor = node.select as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1] as string] = true;
  }

  return select;
}

/** خواندن یک مسیر نقطه‌دار از نتیجه Prisma و تبدیلش به مقدار قابل سریالایز. */
export function flatten(
  row: Record<string, unknown>,
  columns: readonly ReportFieldDefinition[],
): ReportRow {
  const out: Record<string, ReportCellValue> = {};

  for (const column of columns) {
    const value = readPath(row, plainPath(column.path).split('.'));

    if (value === undefined || value === null) out[column.key] = null;
    else if (typeof value === 'bigint') out[column.key] = value.toString();
    else if (value instanceof Date) out[column.key] = value.toISOString();
    else if (typeof value === 'number' || typeof value === 'boolean') out[column.key] = value;
    else out[column.key] = String(value);
  }

  return out;
}

/**
 * خواندن یک مسیر، با عبور از رابطه‌های یک‌به‌چند.
 *
 * جایی که مقدار یک **آرایه** است، بقیهٔ مسیر روی تک‌تک اعضا خوانده و نتیجه با
 * «، » کنار هم گذاشته می‌شود — یک سلول خوانا به‌جای `[object Object]`. مقدارهای
 * تهی و تکراری کنار می‌روند: ستونِ «مدرسه» برای سندی با پنج قبضِ یک مدرسه باید نام
 * آن مدرسه را **یک بار** بگوید، نه پنج بار.
 *
 * هیچ عضوی، یعنی `null` و نه رشتهٔ خالی: بقیهٔ ستون‌ها هم نبودِ مقدار را همین‌طور
 * می‌گویند و جدول و خروجی Excel روی همین حساب می‌کنند.
 */
function readPath(source: unknown, segments: readonly string[]): unknown {
  let value: unknown = source;

  for (let index = 0; index < segments.length; index += 1) {
    if (value === null || value === undefined) return null;

    if (Array.isArray(value)) {
      const rest = segments.slice(index);
      const parts: string[] = [];
      for (const item of value) {
        const read = readPath(item, rest);
        if (read === null || read === undefined || read === '') continue;
        const text = read instanceof Date ? read.toISOString() : String(read);
        if (!parts.includes(text)) parts.push(text);
      }
      return parts.length === 0 ? null : parts.join('، ');
    }

    if (typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[segments[index] as string];
  }

  return value;
}
