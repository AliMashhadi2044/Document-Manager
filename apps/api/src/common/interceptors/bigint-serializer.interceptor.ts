import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * سریالایز امن مقادیر عددی در مرز API (ADR-0003، ریسک R2).
 *
 * دو نوع مقدار اینجا به **رشته** تبدیل می‌شوند:
 *
 *  - `bigint` (مبالغ ریالی): `JSON.stringify` رویش خطا می‌دهد و `Number(bigint)`
 *    بالای ۲^۵۳ دقت را خاموشانه از بین می‌برد.
 *  - `Prisma.Decimal` (مقدار/تعداد): به‌صورت پیش‌فرض **عدد** سریالایز می‌شود، که
 *    هم قرارداد «مقدار = رشته» را می‌شکند و هم مقدار اعشاری را در معرض خطای
 *    ممیز شناور می‌گذارد. با سه رقم اعشار ثابت به رشته می‌رود.
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

  // مقدار/تعداد همیشه با سه رقم اعشار، مطابق NUMERIC(18,3) در دیتابیس.
  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toFixed(3);
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
