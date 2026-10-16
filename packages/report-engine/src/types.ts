/** تایپ‌های مشترکی که بین ماژول‌های موتور رد و بدل می‌شوند. */

export type { Condition, Expression, FormatKind, FormatSpec } from './expression.js';

/** مقدار میانی ارزیاب. `null` یعنی «تهی»، که با صفر یکی نیست. */
export type Value = bigint | string | boolean | null;
