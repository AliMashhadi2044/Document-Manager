/**
 * تنظیم‌های سازمانی گزارش‌ها — مقادیری که قالب‌ها به آن‌ها اشاره می‌کنند.
 *
 * چرا تنظیم و نه عدد داخل قالب: آستانهٔ «مبلغ بزرگ» یک تصمیم سازمانی است که سالی
 * یک بار عوض می‌شود، و قالب یک سند طراحی است که دست همه در آن نیست. نوشتن عدد در
 * قالب یعنی هر تغییرِ آستانه، ویرایش و انتشار نسخهٔ تازهٔ قالب — و قالبِ کپی‌شدهٔ هر
 * کاربر، عددِ خودش را نگه می‌داشت.
 *
 * قالب فقط می‌گوید «از این آستانه بیشتر شد، علامت بزن»؛ خودِ عدد اینجاست.
 */

import { z } from 'zod';

export const reportSettingsSchema = z.object({
  /**
   * آستانهٔ علامت‌گذاری مبلغ در گزارش مالیات — رشتهٔ رقمی ریالی.
   *
   * رشته است و نه number، چون مبلغ در کل سامانه رشتهٔ صحیح است (ADR-0003): یک
   * آستانهٔ ده میلیارد ریالی از محدودهٔ امن `number` بیرون نمی‌زند، ولی یکی‌نبودنِ
   * نوعِ مبلغ در دو جای سامانه، همان جایی است که خطا در آن پنهان می‌شود.
   *
   * خالی یعنی **خاموش**: هیچ سلولی علامت نمی‌خورد. صفر یعنی روشن با آستانهٔ صفر —
   * هر مبلغ ناصفر علامت می‌خورد، که تصمیم عجیبی است ولی تصمیمِ کاربر.
   */
  taxHighlightAbove: z
    .string()
    .regex(/^\d*$/u, 'آستانهٔ مبلغ فقط رقم است')
    .max(18, 'آستانهٔ مبلغ بیش از حد بزرگ است')
    .default(''),
});

export type ReportSettings = z.infer<typeof reportSettingsSchema>;

export const DEFAULT_REPORT_SETTINGS: ReportSettings = { taxHighlightAbove: '' };

/** خواندن امن از JSON ذخیره‌شده؛ مقدار نامعتبر به پیش‌فرض برمی‌گردد. */
export function parseReportSettings(value: unknown): ReportSettings {
  const parsed = reportSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_REPORT_SETTINGS;
}
