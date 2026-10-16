import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * شمارش کوئری هر درخواست — ابزار **اثبات** نبودِ N+1 (معیار پذیرش ۶ فاز ۸).
 *
 * چرا این ابزار لازم شد: «تعداد کوئری ثابت است» را نمی‌شود با چشم دید و با تست واحد
 * هم نمی‌شود سنجید (تست واحد به دیتابیس نمی‌رسد). پس شمارنده‌ای لازم بود که در یک
 * آزمون زنده بگوید فهرست با ۱ ردیف و فهرست با ۲۵ ردیف **چند** کوئری زدند.
 *
 * سه قید که این را از یک کانال اطلاعاتی ناخواسته جدا می‌کند:
 *
 *  ۱. فقط با متغیر محیطی `EXPOSE_QUERY_COUNT=true` روشن می‌شود.
 *  ۲. در `NODE_ENV=production` **هرگز** روشن نمی‌شود، حتی با آن متغیر.
 *  ۳. چیزی جز یک عدد بیرون نمی‌دهد: نه متن کوئری، نه پارامترها، نه زمان‌بندی. متن
 *     کوئری می‌توانست ساختار داخلی و حتی مقدارها را لو بدهد.
 */

interface QueryCountStore {
  count: number;
}

const storage = new AsyncLocalStorage<QueryCountStore>();

export const QUERY_COUNT_HEADER = 'x-query-count';

export function isQueryCountEnabled(): boolean {
  return (
    process.env.EXPOSE_QUERY_COUNT === 'true' && process.env.NODE_ENV !== 'production'
  );
}

/** یک کوئری اجرا شد — اگر درخواستی در جریان باشد، شمرده می‌شود. */
export function recordQuery(): void {
  const store = storage.getStore();
  if (store) store.count += 1;
}

export function currentQueryCount(): number | null {
  return storage.getStore()?.count ?? null;
}

/**
 * میان‌افزار شمارش.
 *
 * هدر پیش از نوشتن سرآیندهای پاسخ گذاشته می‌شود (با پوشاندن `writeHead`)، تا هم
 * پاسخ‌های معمولی و هم پاسخ‌های استریمی (دانلود فایل) عدد را داشته باشند.
 */
export function queryCountMiddleware(request: Request, response: Response, next: NextFunction): void {
  const store: QueryCountStore = { count: 0 };

  const originalWriteHead = response.writeHead.bind(response);
  response.writeHead = ((...args: Parameters<typeof originalWriteHead>) => {
    try {
      response.setHeader(QUERY_COUNT_HEADER, String(store.count));
    } catch {
      // سرآیندها قبلاً رفته‌اند؛ شمارنده یک ابزار تشخیصی است و نباید پاسخ را بشکند.
    }
    return originalWriteHead(...args);
  }) as typeof response.writeHead;

  void request;
  storage.run(store, () => next());
}
