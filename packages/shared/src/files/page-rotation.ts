import { z } from 'zod';

/**
 * چرخش برگه‌های یک اسکن.
 *
 * قاعده یک‌جا نوشته می‌شود و هر سه طرف از همین‌جا می‌خوانند: نمایشگر در مرورگر،
 * اعتبارسنجی سرور، و قید `CHECK` دیتابیس که همین سه مقدار را می‌پذیرد.
 *
 * «بدون چرخش» یعنی **نبودِ ردیف** و نه صفر؛ یک حالت نباید دو نمایش داشته باشد.
 */
export const PAGE_ROTATIONS = [90, 180, 270] as const;

export type PageRotation = (typeof PAGE_ROTATIONS)[number];

/** چرخش بعدی با یک کلیک ساعتگرد؛ ۲۷۰ به «بدون چرخش» برمی‌گردد. */
export function nextRotation(current: number, direction: 1 | -1): 0 | PageRotation {
  const next = (((current + direction * 90) % 360) + 360) % 360;
  return next as 0 | PageRotation;
}

/**
 * حداکثر تعداد برگه‌ای که در یک درخواست می‌آید.
 *
 * سقف `page_count` واقعی نیست چون آن مقدار اختیاری است؛ این فقط جلوی درخواست
 * بی‌انتها را می‌گیرد.
 */
export const MAX_ROTATED_PAGES = 2000;

export const pageRotationsSchema = z.object({
  rotations: z
    .array(
      z.object({
        page: z.number().int().min(1).max(100_000),
        rotation: z.union([z.literal(90), z.literal(180), z.literal(270)]),
      }),
    )
    .max(MAX_ROTATED_PAGES),
});

export type PageRotationsInput = z.infer<typeof pageRotationsSchema>;
