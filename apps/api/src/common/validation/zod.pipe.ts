import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

import { AppError } from '../errors/app-error';

/**
 * اعتبارسنجی ورودی با همان Zod schemaهایی که Frontend استفاده می‌کند.
 *
 * دلیل انتخاب Zod به‌جای class-validator: schema بین کلاینت و سرور **مشترک** است،
 * پس قاعده اعتبارسنجی و پیام خطا در دو جا واگرا نمی‌شوند.
 */
@Injectable()
export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
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
