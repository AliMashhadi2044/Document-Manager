import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * سریالایز امن BIGINT در مرز API (ADR-0003، ریسک R2).
 *
 * `JSON.stringify` روی `bigint` خطا می‌دهد و `Number(bigint)` بالای ۲^۵۳ دقت را
 * **خاموشانه** از بین می‌برد. این interceptor هر `bigint` را در پاسخ به رشته عددی
 * تبدیل می‌کند، پس هیچ مبلغی در مسیر خروج دقت از دست نمی‌دهد.
 */
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => serializeBigInts(value)));
  }
}

/** تبدیل بازگشتی هر `bigint` به رشته. ساختار داده حفظ می‌شود. */
export function serializeBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInts(item));
  }

  // Date، Buffer و نمونه‌های کلاس‌دار نباید باز شوند.
  if (value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      result[key] = serializeBigInts(source[key]);
    }
    return result;
  }

  return value;
}
