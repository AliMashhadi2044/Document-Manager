import { z } from 'zod';

/**
 * پارامترهای مشترک فهرست‌ها.
 *
 * الزام بهینگی (پاسخ Q12): فیلتر، مرتب‌سازی و صفحه‌بندی **همیشه سمت سرور** انجام
 * می‌شوند و سقف `pageSize` اجباری است تا هیچ درخواستی کل جدول را به مرورگر نیاورد.
 */

export const MAX_PAGE_SIZE = 200;

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  search: z.string().trim().max(200).optional(),
  /** `true` فقط فعال‌ها، `false` فقط غیرفعال‌ها، نبودن یعنی همه. */
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  sortBy: z.string().trim().max(50).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export function toPageResult<T>(
  items: readonly T[],
  total: number,
  query: Pick<ListQuery, 'page' | 'pageSize'>,
): PageResult<T> {
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export function paginationArgs(query: Pick<ListQuery, 'page' | 'pageSize'>): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/**
 * ساخت ترتیب مرتب‌سازی با **فهرست سفید** ستون‌ها.
 * بدون این، نام ستون از ورودی کاربر مستقیم به کوئری می‌رفت.
 */
export function orderByArg(
  query: Pick<ListQuery, 'sortBy' | 'sortDir'>,
  allowed: readonly string[],
  fallback: Record<string, 'asc' | 'desc'>[],
): Record<string, 'asc' | 'desc'>[] {
  if (query.sortBy && allowed.includes(query.sortBy)) {
    return [{ [query.sortBy]: query.sortDir }];
  }
  return fallback;
}
