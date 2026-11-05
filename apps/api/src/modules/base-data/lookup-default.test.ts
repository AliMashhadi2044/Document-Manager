import { describe, expect, it, vi } from 'vitest';

import { LookupService } from './lookup.service';

/**
 * پیش‌فرض اطلاعات پایه.
 *
 * سه ادعا، و همه دربارهٔ یک قاعده: **فقط یک پیش‌فرض**، و آن هم روی ردیفی که
 * واقعاً در فرم‌ها دیده می‌شود.
 *
 *  ۱. پیش‌فرض کردن یک ردیف، علامت را از بقیه برمی‌دارد.
 *  ۲. ردیف غیرفعال پیش‌فرض نمی‌ماند — انتخابی که در فهرست گزینه‌ها نیست.
 *  ۳. ردیفی که پیش‌فرض نمی‌شود، چیزی را از بقیه برنمی‌دارد.
 */
const ROW = {
  id: 'row-1',
  title: 'عدد',
  isActive: true,
  sortOrder: 0,
  isDefault: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService(before = ROW) {
  const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }));
  const update = vi.fn(async (_args: unknown) => ({ ...before, isDefault: true }));

  const delegate = {
    findUnique: vi.fn(async () => before),
    findMany: vi.fn(async () => [before]),
    count: vi.fn(async () => 0),
    create: vi.fn(async () => before),
    update,
    updateMany,
    delete: vi.fn(async () => before),
  };

  const prisma = {
    measurementUnit: delegate,
    // سرویس تراکنش را فقط برای اتمی بودن می‌خواهد؛ اجرا همان‌جاست.
    $transaction: vi.fn(async (run: () => Promise<unknown>) => run()),
  };

  const service = new LookupService(prisma as never, { record: vi.fn() } as never);
  return { service, update, updateMany };
}

describe('پیش‌فرض اطلاعات پایه', () => {
  it('پیش‌فرض کردن یک ردیف، علامت را از بقیه برمی‌دارد', async () => {
    const { service, updateMany, update } = makeService();

    await service.update('measurement-units', 'row-1', { isDefault: true }, 'actor-1');

    const where = (updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ isDefault: true, id: { not: 'row-1' } });

    const data = (update.mock.calls[0]?.[0] as { data: { isDefault: boolean } }).data;
    expect(data.isDefault).toBe(true);
  });

  it('ردیف غیرفعال پیش‌فرض نمی‌ماند', async () => {
    const { service, update, updateMany } = makeService({ ...ROW, isDefault: true });

    await service.update('measurement-units', 'row-1', { isActive: false }, 'actor-1');

    const data = (update.mock.calls[0]?.[0] as { data: { isDefault: boolean } }).data;
    expect(data.isDefault).toBe(false);
    // و چون پیش‌فرضی در کار نیست، چیزی هم از بقیه برداشته نمی‌شود.
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('اصلاح عنوان، پیش‌فرض بقیه را دست نمی‌زند', async () => {
    const { service, updateMany } = makeService();

    await service.update('measurement-units', 'row-1', { title: 'کیلوگرم' }, 'actor-1');

    expect(updateMany).not.toHaveBeenCalled();
  });
});
