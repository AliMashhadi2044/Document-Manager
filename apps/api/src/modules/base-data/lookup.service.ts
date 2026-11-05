import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import {
  orderByArg,
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';
import {
  LOOKUP_RESOURCES,
  LOOKUP_SORTABLE,
  type LookupResource,
} from './lookup.registry';

export const lookupInputSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الزامی است').max(200),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  /**
   * پیش‌فرض این فهرست.
   *
   * هر جا این فهرست در فرمی دیده می‌شود، پیش‌فرض از پیش انتخاب است. فقط یک ردیف
   * می‌تواند پیش‌فرض باشد و همین را ایندکس جزئی یکتا در پایگاه داده هم تضمین
   * می‌کند — نه فقط کد.
   */
  isDefault: z.boolean().default(false),
});

export type LookupInput = z.infer<typeof lookupInputSchema>;

export const reorderSchema = z.object({
  /** شناسهٔ ردیف‌های دیده‌شده، به ترتیب تازه. */
  ids: z.array(z.string().uuid()).min(2).max(500),
});

export type ReorderInput = z.infer<typeof reorderSchema>;

export interface LookupRecord {
  id: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** تعداد رکوردهایی که به این مورد ارجاع می‌دهند. */
  usageCount?: number;
}

interface Delegate {
  findMany(args: unknown): Promise<LookupRecord[]>;
  updateMany(args: unknown): Promise<{ count: number }>;
  findUnique(args: unknown): Promise<LookupRecord | null>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<LookupRecord>;
  update(args: unknown): Promise<LookupRecord>;
  delete(args: unknown): Promise<LookupRecord>;
}

@Injectable()
export class LookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private delegate(resource: LookupResource): Delegate {
    const { model } = LOOKUP_RESOURCES[resource];
    const client = this.prisma as unknown as Record<string, Delegate>;
    const delegate = client[model];
    if (!delegate) {
      throw AppError.notFound('منبع اطلاعات پایه یافت نشد');
    }
    return delegate;
  }

  async list(resource: LookupResource, query: ListQuery): Promise<PageResult<LookupRecord>> {
    const delegate = this.delegate(resource);

    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where['isActive'] = query.isActive;
    if (query.search) {
      where['title'] = { contains: query.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        // پیش‌فرض همیشه بالای فهرست می‌آید، مگر کاربر خودش مرتب‌سازی دیگری خواسته باشد.
        orderBy: orderByArg(query, LOOKUP_SORTABLE, [
          { isDefault: 'desc' },
          { sortOrder: 'asc' },
          { title: 'asc' },
        ]),
        ...paginationArgs(query),
      }),
      delegate.count({ where }),
    ]);

    // شمارش استفاده برای همان صفحه، نه کل جدول — یک کوئری تجمیعی به‌ازای هر ارجاع.
    const withUsage = await this.attachUsage(resource, items);
    return toPageResult(withUsage, total, query);
  }

  async get(resource: LookupResource, id: string): Promise<LookupRecord> {
    const record = await this.delegate(resource).findUnique({ where: { id } });
    if (!record) throw AppError.notFound();
    const [withUsage] = await this.attachUsage(resource, [record]);
    return withUsage as LookupRecord;
  }

  async create(
    resource: LookupResource,
    input: LookupInput,
    actorId: string,
  ): Promise<LookupRecord> {
    const delegate = this.delegate(resource);

    // پیش‌فرضِ تازه باید پیش‌فرض قبلی را بردارد، وگرنه ایندکس یکتا نوشتن را رد
    // می‌کند و کاربر یک خطای پایگاه داده می‌بیند به‌جای جابه‌جا شدن پیش‌فرض.
    const created = await this.prisma.$transaction(async () => {
      if (input.isDefault) await this.clearDefault(delegate, null);
      return delegate.create({ data: input });
    });

    await this.audit.record({
      actorId,
      action: 'BASE_DATA_CREATE',
      entityType: LOOKUP_RESOURCES[resource].model,
      entityId: created.id,
      after: created,
    });

    return created;
  }

  async update(
    resource: LookupResource,
    id: string,
    input: Partial<LookupInput>,
    actorId: string,
  ): Promise<LookupRecord> {
    const delegate = this.delegate(resource);
    const before = await delegate.findUnique({ where: { id } });
    if (!before) throw AppError.notFound();

    /*
      پیش‌فرض و «غیرفعال» با هم نمی‌خوانند.

      ردیف غیرفعال در هیچ فرمی دیده نمی‌شود؛ پیش‌فرض ماندنش یعنی فرم مقداری را از
      پیش انتخاب می‌کند که در فهرست گزینه‌هایش نیست.
    */
    const wantsDefault = (input.isDefault ?? before.isDefault) && (input.isActive ?? before.isActive);

    const updated = await this.prisma.$transaction(async () => {
      if (wantsDefault) await this.clearDefault(delegate, id);
      return delegate.update({ where: { id }, data: { ...input, isDefault: wantsDefault } });
    });

    await this.audit.record({
      actorId,
      action: 'BASE_DATA_UPDATE',
      entityType: LOOKUP_RESOURCES[resource].model,
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  /** برداشتن علامت پیش‌فرض از بقیهٔ ردیف‌ها. */
  private async clearDefault(delegate: Delegate, keepId: string | null): Promise<void> {
    await delegate.updateMany({
      where: { isDefault: true, ...(keepId === null ? {} : { id: { not: keepId } }) },
      data: { isDefault: false },
    });
  }

  /**
   * جابه‌جایی ترتیب نمایش.
   *
   * کلاینت فقط صفحهٔ دیده‌شده را می‌شناسد، پس سرور ترتیب تازه را **در جایگاه‌های
   * همان ردیف‌ها** می‌نشاند: جایگاه‌هایی که این شناسه‌ها در فهرست کامل اشغال کرده‌اند ثابت
   * می‌مانند و فقط محتوایشان جابه‌جا می‌شود. بدون این، یک جابه‌جایی در صفحهٔ دوم، ردیف‌های
   * صفحهٔ اول را هم به‌هم می‌ریخت.
   *
   * شماره‌گذاری دوباره‌ی کامل عمدی است: مقدار پیش‌فرض `sortOrder` برای همه صفر است و
   * بدون شماره‌گذاری، هیچ ترتیبی قابل ذخیره نیست.
   */
  async reorder(
    resource: LookupResource,
    ids: readonly string[],
    actorId: string,
  ): Promise<void> {
    const delegate = this.delegate(resource);

    const all = await delegate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    const byId = new Map(all.map((record) => [record.id, record]));
    const moving = ids.filter((id, index) => byId.has(id) && ids.indexOf(id) === index);
    if (moving.length < 2) {
      throw AppError.validation('ترتیب تازه باید دست‌کم دو مورد معتبر داشته باشد');
    }

    const movingSet = new Set(moving);
    const slots = all.map((record, index) => ({ record, index })).filter((entry) => movingSet.has(entry.record.id));
    if (slots.length !== moving.length) {
      throw AppError.validation('برخی از موارد این ترتیب، در این منبع نیستند');
    }

    const next = [...all];
    slots.forEach((slot, position) => {
      next[slot.index] = byId.get(moving[position] as string) as LookupRecord;
    });

    const changed = next
      .map((record, index) => ({ id: record.id, sortOrder: index }))
      .filter((entry, index) => (next[index] as LookupRecord).sortOrder !== entry.sortOrder);

    if (changed.length === 0) return;

    await this.prisma.$transaction(
      changed.map((entry) =>
        (delegate as unknown as {
          update(args: unknown): Promise<LookupRecord>;
        }).update({ where: { id: entry.id }, data: { sortOrder: entry.sortOrder } }),
      ) as never,
    );

    await this.audit.record({
      actorId,
      action: 'BASE_DATA_REORDER',
      entityType: LOOKUP_RESOURCES[resource].model,
      entityId: resource,
      after: { order: next.map((record) => record.id) },
    });
  }

  /**
   * حذف — فقط وقتی رکورد **استفاده نشده** باشد.
   *
   * الزام §۸.۱۰: جلوگیری از حذف اطلاعات استفاده‌شده، با نمایش تعداد رکوردهای مرتبط.
   * روش پیشنهادی به کاربر، غیرفعال کردن است تا سوابق تاریخی سالم بمانند.
   */
  async remove(resource: LookupResource, id: string, actorId: string): Promise<void> {
    const delegate = this.delegate(resource);
    const before = await delegate.findUnique({ where: { id } });
    if (!before) throw AppError.notFound();

    const usage = await this.countUsage(resource, id);
    if (usage.total > 0) {
      const detail = usage.parts.map((part) => `${part.count} ${part.titleFa}`).join('، ');
      throw AppError.conflict(
        'BASE_DATA_IN_USE',
        `این مورد در ${detail} استفاده شده است و حذف نمی‌شود. برای کنار گذاشتن آن، غیرفعالش کنید.`,
      );
    }

    await delegate.delete({ where: { id } });

    await this.audit.record({
      actorId,
      action: 'BASE_DATA_DELETE',
      entityType: LOOKUP_RESOURCES[resource].model,
      entityId: id,
      before,
    });
  }

  private async countUsage(
    resource: LookupResource,
    id: string,
  ): Promise<{ total: number; parts: Array<{ titleFa: string; count: number }> }> {
    const refs = LOOKUP_RESOURCES[resource].usage;
    const parts: Array<{ titleFa: string; count: number }> = [];
    let total = 0;

    for (const ref of refs) {
      const client = this.prisma as unknown as Record<string, { count(args: unknown): Promise<number> }>;
      const delegate = client[ref.model];
      if (!delegate) continue;

      const count = await delegate.count({ where: { [ref.field]: id } });
      if (count > 0) {
        parts.push({ titleFa: ref.titleFa, count });
        total += count;
      }
    }

    return { total, parts };
  }

  private async attachUsage(
    resource: LookupResource,
    records: readonly LookupRecord[],
  ): Promise<LookupRecord[]> {
    const refs = LOOKUP_RESOURCES[resource].usage;
    if (refs.length === 0 || records.length === 0) {
      return records.map((record) => ({ ...record, usageCount: 0 }));
    }

    const ids = records.map((record) => record.id);
    const counts = new Map<string, number>();

    for (const ref of refs) {
      const client = this.prisma as unknown as Record<
        string,
        { groupBy(args: unknown): Promise<Array<Record<string, unknown>>> }
      >;
      const delegate = client[ref.model];
      if (!delegate) continue;

      // یک کوئری گروهی برای کل صفحه — نه یک کوئری به‌ازای هر ردیف (ضد N+1).
      const grouped = await delegate.groupBy({
        by: [ref.field],
        where: { [ref.field]: { in: ids } },
        _count: { _all: true },
      });

      for (const row of grouped) {
        const key = row[ref.field] as string;
        const count = (row['_count'] as { _all: number })._all;
        counts.set(key, (counts.get(key) ?? 0) + count);
      }
    }

    return records.map((record) => ({ ...record, usageCount: counts.get(record.id) ?? 0 }));
  }
}
