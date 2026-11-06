/**
 * سیاست نشست — تنظیم سازمانی، نه سلیقهٔ هر کاربر.
 *
 * «کاربر بی‌تحرک پس از چند دقیقه بیرون انداخته شود» تا امروز فقط در متغیر محیطی
 * `SESSION_IDLE_TTL_MINUTES` بود؛ یعنی عوض کردنش به دسترسی سرور و یک راه‌اندازی
 * دوباره نیاز داشت. این تنظیم همان عدد را به دست مدیر سامانه می‌دهد.
 *
 * چرا سازمانی: مهلت بی‌تحرکی یک **کنترل امنیتی** است. اگر هر کاربر خودش
 * تعیینش می‌کرد، هر کسی مهلت خودش را بی‌نهایت می‌کرد و کنترل بی‌معنا می‌شد.
 *
 * مقدار ذخیره‌نشده یعنی «همان چیزی که در محیط تنظیم شده» — پس نصب‌های موجود
 * بدون هیچ تغییری همان رفتار قبلی را دارند.
 */

import { z } from 'zod';

/** کمینهٔ معقول: زیر پنج دقیقه، کاربر وسط پر کردن یک فرم بیرون می‌افتد. */
export const SESSION_IDLE_MIN_MINUTES = 5;
/** بیشینه: ۱۲ ساعت، برابر سقف مطلق پیش‌فرض نشست. */
export const SESSION_IDLE_MAX_MINUTES = 720;

export const sessionPolicySchema = z.object({
  /**
   * مهلت بی‌تحرکی به دقیقه.
   *
   * `null` یعنی «از تنظیم محیطی پیروی کن» — حالت پیش‌فرض و رفتار پیشین.
   */
  idleMinutes: z.coerce
    .number()
    .int('مهلت بی‌تحرکی باید عدد صحیح باشد')
    .min(SESSION_IDLE_MIN_MINUTES, 'مهلت بی‌تحرکی کمتر از ۵ دقیقه نمی‌شود')
    .max(SESSION_IDLE_MAX_MINUTES, 'مهلت بی‌تحرکی بیشتر از ۷۲۰ دقیقه (۱۲ ساعت) نمی‌شود')
    .nullable()
    .default(null),
});

export type SessionPolicy = z.infer<typeof sessionPolicySchema>;

export const DEFAULT_SESSION_POLICY: SessionPolicy = { idleMinutes: null };

/** خواندن امن از JSON ذخیره‌شده؛ مقدار نامعتبر به پیش‌فرض برمی‌گردد. */
export function parseSessionPolicy(value: unknown): SessionPolicy {
  const parsed = sessionPolicySchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_SESSION_POLICY;
}
