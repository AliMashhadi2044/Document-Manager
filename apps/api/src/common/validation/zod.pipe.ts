import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

import { AppError } from '../errors/app-error';

/**
 * اعتبارسنجی ورودی با همان Zod schemaهایی که Frontend استفاده می‌کند.
 *
 * دلیل انتخاب Zod به‌جای class-validator: schema بین کلاینت و سرور **مشترک** است،
 * پس قاعده اعتبارسنجی و پیام خطا در دو جا واگرا نمی‌شوند.
 */
@Injectable()
export class ZodBody<TOut, TIn = unknown> implements PipeTransform<unknown, TOut> {
  /**
   * نوع ورودی و خروجی جدا هستند: schemaهایی که `default` یا `transform` دارند،
   * ورودی و خروجی متفاوتی دارند و یکی گرفتنشان تایپ را می‌شکند.
   */
  constructor(private readonly schema: ZodType<TOut, ZodTypeDef, TIn>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOut {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw AppError.validation(
        'اطلاعات ارسالی معتبر نیست',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    return result.data;
  }
}
