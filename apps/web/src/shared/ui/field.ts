/**
 * کلاس‌های مشترک کنترل‌های فرم.
 *
 * چرا یک جا: پیش از این هر کنترل (ورودی متن، انتخاب، مبلغ، تاریخ) کلاس‌های خودش را
 * داشت و با گذر زمان ارتفاع و شعاع و فاصله‌هایشان یک پیکسل‌هایی با هم فرق کرده بود.
 * در یک فرم دوستونی همین اختلاف کوچک، ردیف‌ها را ناهم‌تراز نشان می‌دهد.
 *
 * ارتفاع **ثابت** (`h-10`) عمدی است، نه `py-2`: ارتفاع حاصل از padding به ارتفاع خط
 * قلم وابسته است و `select` بومی با `input` یکی نمی‌شود.
 */

export const CONTROL_CLASS =
  'block h-10 w-full rounded-lg border bg-card px-3 text-sm transition-colors ' +
  'placeholder:text-muted-foreground hover:border-muted-foreground/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

/** حالت خطا و حالت عادی مرز کنترل. */
export const borderClass = (hasError: boolean): string =>
  hasError ? 'border-destructive' : 'border-input';

/**
 * برچسب کنترل.
 *
 * ارتفاع کمینه دارد تا در یک ردیف دوستونی، کنترلی که برچسبش یک خط است با کنترلی که
 * برچسبش دو خط شده، از یک خط شروع شوند.
 */
export const LABEL_CLASS =
  'flex min-h-5 items-center text-sm font-medium leading-5 text-foreground';

/** متن راهنما و خطا — هر دو یک اندازه، تا ارتفاع ردیف با جابه‌جایی‌شان نپرد. */
export const HELP_CLASS = 'text-xs leading-5';

/**
 * کنترل‌هایی که مقدارشان عدد است.
 *
 * `tabular-nums` عرض ارقام را یکسان می‌کند و فاصله منفی حروف، ارقام فارسی را — که
 * ذاتاً بازند — کمی جمع می‌کند تا مبالغ بلند در ستون جا شوند.
 */
export const NUMERIC_CLASS = 'money text-start';
