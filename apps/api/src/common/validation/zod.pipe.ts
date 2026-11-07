import { ArgumentMetadata, Injectable, Logger, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { AppError } from '../errors/app-error';

/**
 * اعتبارسنجی ورودی با همان Zod schemaهایی که Frontend استفاده می‌کند.
 *
 * دلیل انتخاب Zod به‌جای class-validator: schema بین کلاینت و سرور **مشترک** است،
 * پس قاعده اعتبارسنجی و پیام خطا در دو جا واگرا نمی‌شوند.
 */
@Injectable()
export class ZodBody<TOut, TIn = unknown> implements PipeTransform<unknown, TOut> {
  private static readonly logger = new Logger('ZodBody');

  /**
   * نوع ورودی و خروجی جدا هستند: schemaهایی که `default` یا `transform` دارند،
   * ورودی و خروجی متفاوتی دارند و یکی گرفتنشان تایپ را می‌شکند.
   */
  constructor(private readonly schema: ZodType<TOut, TIn>) {}

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

    /*
      کلیدی که فرم می‌فرستد و schema نمی‌شناسد، **خاموشانه** دور انداخته می‌شود.

      این دقیقاً شکلِ یک باگِ بی‌صدا است: zod کلید ناشناخته را حذف می‌کند، سرویس
      آن را `undefined` می‌بیند و پاسخ ۲۰۰ برمی‌گردد — کاربر پیام «ذخیره شد»
      می‌گیرد و هیچ‌چیز عوض نشده. ویرایش شماره و تاریخ گردشِ سند همین بود.
      خطا نمی‌دهیم (کلاینت قدیمی‌تر نباید بشکند) ولی در لاگ **دیده** می‌شود.

      فقط نامِ کلیدها لاگ می‌شوند و نه مقدارشان؛ بدنهٔ درخواست می‌تواند داده
      حساس داشته باشد.
    */
    const dropped = droppedKeys(value, result.data);
    if (dropped.length > 0) {
      ZodBody.logger.warn(
        { dropped },
        'کلیدهای ناشناخته در بدنهٔ درخواست نادیده گرفته شدند',
      );
    }

    return result.data;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * کلیدهایی که در ورودی بودند و در خروجیِ parse نیستند.
 *
 * بازگشتی، تا کلیدِ گم‌شده در یک شیء تودرتو (مثل `payment` یا `stad`) هم دیده
 * شود. schemaهایی که با `transform` شکل داده را عوض می‌کنند می‌توانند هشدار
 * بی‌مورد بسازند؛ به همین دلیل این هشدار است و نه خطا.
 */
export function droppedKeys(input: unknown, output: unknown, path = ''): string[] {
  if (Array.isArray(input) && Array.isArray(output)) {
    return input.flatMap((item, index) =>
      droppedKeys(item, output[index], `${path}[${index}]`),
    );
  }

  if (!isPlainObject(input) || !isPlainObject(output)) return [];

  const found: string[] = [];
  for (const [key, inner] of Object.entries(input)) {
    const here = path === '' ? key : `${path}.${key}`;
    if (!(key in output)) {
      // `undefined` صریح، چیزی برای از دست دادن نیست.
      if (inner !== undefined) found.push(here);
      continue;
    }
    found.push(...droppedKeys(inner, output[key], here));
  }
  return found;
}
