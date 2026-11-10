import { toPersianDigits } from './money';

/**
 * اندازهٔ فایل از رشتهٔ عددی.
 *
 * ورودی رشته است چون `size_bytes` در پایگاه داده `bigint` است و همان قرارداد مبلغ
 * را دارد: روی سیم، رشته. ولی برخلاف مبلغ، تقسیم اینجا بی‌خطر است — این بایت است و
 * نه ریال، و «۱٫۴ مگابایت» دقیقاً همان چیزی است که کاربر می‌خواهد ببیند.
 *
 * سه نسخهٔ یکسان از این تابع در سه فایل افتاده بود؛ یک‌جا شدن، تنها راهِ یکسان
 * ماندنشان است.
 */
export function formatFileSize(bytes: string | number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${toPersianDigits(String(value))} بایت`;
  if (value < 1024 * 1024) return `${toPersianDigits((value / 1024).toFixed(1))} کیلوبایت`;
  return `${toPersianDigits((value / (1024 * 1024)).toFixed(1))} مگابایت`;
}
