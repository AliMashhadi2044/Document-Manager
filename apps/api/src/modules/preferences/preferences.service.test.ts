import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '@dm/shared';

import { PreferencesService } from './preferences.service';

/**
 * ترجیح‌های کاربر، سمت سرور.
 *
 * ادعای مرکزی: **دامنه همیشه کاربرِ نشست است.** هر دو متد شناسه را از فراخوان
 * می‌گیرند و فراخوان تنها جایی است که شناسه از نشست می‌آید؛ هیچ مسیری ورودیِ
 * کاربر را به `where` نمی‌رساند.
 *
 * و دو ادعای دیگر که کاربر مستقیم می‌بیندشان: کاربرِ تازه بدون ردیف هم ترجیح
 * پیش‌فرض می‌گیرد (نه خطا)، و ترجیحِ خالی کلیدی در پروفایل جا نمی‌گذارد.
 */
function makeService(row: unknown = null) {
  const upsert = vi.fn(async (_args: unknown) => ({}));
  const findUnique = vi.fn(async () => row);
  const prisma = { userPreferences: { findUnique, upsert } };
  return { service: new PreferencesService(prisma as never), findUnique, upsert };
}

const FULL = {
  theme: 'dark' as const,
  primaryColor: 'amber' as const,
  lastSection: 'documents',
  select: { k: { pinned: ['a'], order: ['a'], labels: { a: 'آب' } } },
};

describe('ترجیح‌های کاربر', () => {
  it('کاربر بدون ردیف، پیش‌فرض می‌گیرد و خطا نمی‌دهد', async () => {
    const { service, findUnique } = makeService(null);

    await expect(service.get('user-1')).resolves.toEqual(DEFAULT_PREFERENCES);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('ردیفِ قدیمی با مقدار بی‌ربط، ترجیح معتبر می‌دهد', async () => {
    // ستون‌ها رشته‌اند و از نسخهٔ قبلی سامانه هر چیزی می‌تواند در آن‌ها مانده باشد.
    const { service } = makeService({
      theme: 'neon',
      primaryColor: 'teal',
      lastSection: null,
      selectPrefs: null,
    });

    await expect(service.get('user-1')).resolves.toEqual({
      theme: 'system',
      primaryColor: 'teal',
      lastSection: null,
      select: {},
    });
  });

  it('ذخیره، روی پروفایل همان کاربر می‌نشیند', async () => {
    const { service, upsert } = makeService();

    await service.replace('user-1', FULL);

    const call = upsert.mock.calls[0]?.[0] as unknown as {
      where: { userId: string };
      create: Record<string, unknown>;
    };
    expect(call.where).toEqual({ userId: 'user-1' });
    expect(call.create).toMatchObject({ userId: 'user-1', theme: 'dark', primaryColor: 'amber' });
  });

  it('ترجیح خالی یک فهرست، کلیدی در پروفایل نمی‌گذارد', async () => {
    const { service, upsert } = makeService();

    const result = await service.replace('user-1', {
      ...FULL,
      select: { empty: { pinned: [], order: [], labels: {} }, kept: FULL.select.k },
    });

    expect(Object.keys(result.select)).toEqual(['kept']);
    const call = upsert.mock.calls[0]?.[0] as unknown as {
      update: { selectPrefs: Record<string, unknown> };
    };
    expect(Object.keys(call.update.selectPrefs)).toEqual(['kept']);
  });
});
