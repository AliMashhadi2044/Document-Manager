/**
 * عدد به **حروف فارسی**.
 *
 * فرم‌های مالی کاغذی جمع کل را دو بار می‌نویسند: یک بار با رقم و یک بار با حروف.
 * دلیلش هم روشن است — رقم را می‌شود با یک قلم عوض کرد، حروف را نه. پس این تابع یک
 * تزیین نیست؛ بخشی از سندی است که امضا می‌شود.
 *
 * ورودی `bigint` است و نه `number` (ADR-0003): مبالغ این سامانه از ۲^۵۳ هم رد
 * می‌شوند و همان عددی که به حروف نوشته می‌شود باید دقیقاً همانی باشد که در ستون
 * جمع آمده است.
 *
 * چرا در `format/` و نه `money/`: اینجا هیچ **محاسبهٔ** مالی انجام نمی‌شود. تقسیم و
 * باقیمانده‌ها فقط رقم‌های همان عدد را بیرون می‌کشند تا نامشان خوانده شود. لایهٔ
 * مالی عمداً تقسیم مستقیم را ممنوع کرده و آن ممنوعیت درست است؛ راهِ درستِ رعایتش
 * این است که کدِ غیرمالی آنجا ننشیند، نه اینکه با یک `eslint-disable` دور زده شود.
 */

const ONES = [
  '',
  'یک',
  'دو',
  'سه',
  'چهار',
  'پنج',
  'شش',
  'هفت',
  'هشت',
  'نه',
] as const;

const TEENS = [
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
] as const;

const TENS = [
  '',
  '',
  'بیست',
  'سی',
  'چهل',
  'پنجاه',
  'شصت',
  'هفتاد',
  'هشتاد',
  'نود',
] as const;

const HUNDREDS = [
  '',
  'صد',
  'دویست',
  'سیصد',
  'چهارصد',
  'پانصد',
  'ششصد',
  'هفتصد',
  'هشتصد',
  'نهصد',
] as const;

/**
 * نام هر سه‌رقمی.
 *
 * فهرست عمداً تا «کوادریلیون» می‌رود و نه بیشتر: بالاتر از آن در ریال هم بی‌معناست،
 * و تابع به‌جای ساختن نامی که کسی نمی‌خواند، صریح خطا می‌دهد.
 */
const SCALES = ['', ' هزار', ' میلیون', ' میلیارد', ' بیلیون', ' بیلیارد'] as const;

const SEPARATOR = ' و ';

/** سه رقم (۱ تا ۹۹۹) به حروف. */
function tripletToWords(value: number): string {
  const parts: string[] = [];

  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  if (hundreds > 0) parts.push(HUNDREDS[hundreds] as string);

  if (remainder >= 10 && remainder <= 19) {
    parts.push(TEENS[remainder - 10] as string);
  } else {
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    if (tens > 0) parts.push(TENS[tens] as string);
    if (ones > 0) parts.push(ONES[ones] as string);
  }

  return parts.join(SEPARATOR);
}

/**
 * عدد صحیح به حروف فارسی.
 *
 * صفر «صفر» است و نه رشتهٔ خالی: در ردیف جمعِ یک فرم مالی، جای خالی یعنی «نوشته
 * نشده» و صفر یعنی «هیچ» — و این دو یکی نیستند. عدد منفی هم با «منفی» می‌آید،
 * هرچند در این سامانه نباید پیش بیاید.
 */
export function numberToPersianWords(value: bigint): string {
  if (value === 0n) return 'صفر';
  if (value < 0n) return `منفی ${numberToPersianWords(-value)}`;

  const groups: number[] = [];
  let rest = value;
  while (rest > 0n) {
    groups.push(Number(rest % 1000n));
    rest /= 1000n;
  }

  if (groups.length > SCALES.length) {
    throw new RangeError('عدد بزرگ‌تر از آن است که به حروف نوشته شود');
  }

  const parts: string[] = [];
  // از پرارزش‌ترین سه‌رقمی به کم‌ارزش‌ترین.
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index] as number;
    if (group === 0) continue;
    parts.push(`${tripletToWords(group)}${SCALES[index] as string}`);
  }

  return parts.join(SEPARATOR);
}

/** همان، با واحد پول — چیزی که روی فرم نوشته می‌شود. */
export function moneyToPersianWords(value: bigint, unit = 'ریال'): string {
  return `${numberToPersianWords(value)} ${unit}`;
}
