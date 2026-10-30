import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  MAX_SELECT_ENTRIES,
  normalizeSelectPrefs,
  parsePreferences,
  userPreferencesSchema,
} from './preferences.js';

/**
 * ترجیح‌های شخصی‌سازی.
 *
 * دو ادعای جدا:
 *
 *  ۱. **خواندن بخشنده است.** این سند از مرورگر و از ردیف‌های قدیمی دیتابیس می‌آید؛
 *     یک مقدار بی‌ربط در آن نباید کاربر را بی‌ترجیح — یا بدتر، با صفحهٔ خطا — رها
 *     کند. هرچه معنا دارد می‌ماند و بقیه پیش‌فرض می‌گیرد.
 *  ۲. **نوشتن سخت‌گیر است.** بدنهٔ `PUT` از مرورگر می‌آید، پس سقف‌ها واقعی‌اند.
 */
describe('خواندن ترجیح', () => {
  it('سند کامل را همان‌طور که هست می‌پذیرد', () => {
    const input = {
      theme: 'dark',
      primaryColor: 'amber',
      lastSection: 'documents',
      density: 'compact',
      pageSize: 50,
      hiddenColumns: { documents: ['createdAt'] },
      select: { 'نوع کالا': { pinned: ['a'], order: ['a', 'b'], labels: { a: 'آب' } } },
    };
    expect(parsePreferences(input)).toEqual(input);
  });

  it('سند خالی، همان پیش‌فرض‌ها را می‌دهد', () => {
    expect(parsePreferences({})).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it('مقدار بی‌ربط را دور می‌ریزد و بقیه را نگه می‌دارد', () => {
    // تم ناشناس نباید رنگِ درست را هم با خودش ببرد.
    const result = parsePreferences({ theme: 'neon', primaryColor: 'teal', lastSection: '' });
    expect(result).toEqual({
      ...DEFAULT_PREFERENCES,
      primaryColor: 'teal',
    });
  });

  it('فهرستِ خرابِ یک انتخاب، بقیهٔ فهرست‌ها را از بین نمی‌برد', () => {
    const result = parsePreferences({
      select: {
        ok: { pinned: ['x'], order: [], labels: {} },
        broken: { pinned: 'یک رشته، نه آرایه' },
      },
    });
    expect(Object.keys(result.select)).toEqual(['ok']);
  });
});

describe('اعتبارسنجی نوشتن', () => {
  it('فهرست بیش از حد بلند رد می‌شود', () => {
    const pinned = Array.from({ length: MAX_SELECT_ENTRIES + 1 }, (_, index) => `v${index}`);
    const result = userPreferencesSchema.safeParse({ select: { k: { pinned } } });
    expect(result.success).toBe(false);
  });

  it('اندازهٔ صفحهٔ بیرون از دامنه رد می‌شود', () => {
    // سقف، همان سقف سرور است؛ رابط نباید چیزی بدهد که سرور ردش می‌کند.
    expect(userPreferencesSchema.safeParse({ pageSize: 5_000 }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ pageSize: 50 }).success).toBe(true);
  });

  it('اندازهٔ صفحهٔ بی‌ربط در خواندن، به پیش‌فرض برمی‌گردد', () => {
    expect(parsePreferences({ pageSize: 5_000 }).pageSize).toBe(25);
    expect(parsePreferences({ pageSize: 'خیلی' }).pageSize).toBe(25);
  });

  it('نام بخشِ بیش از حد بلند رد می‌شود', () => {
    expect(userPreferencesSchema.safeParse({ lastSection: 'x'.repeat(61) }).success).toBe(false);
  });
});

describe('پاک‌سازی ترجیح یک فهرست', () => {
  it('ترجیح خالی یعنی «کلید را دور بریز»', () => {
    expect(normalizeSelectPrefs({ pinned: [], order: [], labels: {} })).toBeNull();
  });

  it('عنوانِ گزینه‌ای که دیگر پین نیست نگه داشته نمی‌شود', () => {
    // وگرنه با هر پین و برداشتن، ردی دائمی از نام رکوردها در پروفایل جمع می‌شد.
    const result = normalizeSelectPrefs({
      pinned: ['a'],
      order: ['a', 'b'],
      labels: { a: 'آب', b: 'برق' },
    });
    expect(result?.labels).toEqual({ a: 'آب' });
  });
});
