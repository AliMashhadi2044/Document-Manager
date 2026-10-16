import type ExcelJS from 'exceljs';

/**
 * قواعد نوشتن سلول Excel — **یک‌جا**، برای هر دو خروجی‌گیر.
 *
 * فاز ۸ یک خروجی‌گیر دوم آورد (جدول‌های گزارش‌گیری عمومی) و این سه قاعده باید در هر
 * دو برقرار باشند. کپی کردنشان یعنی روزی یکی از دو نسخه اصلاح می‌شود و دیگری نه —
 * و این‌ها کنترل امنیتی و درستی مالی‌اند، نه جزئیات ظاهری:
 *
 *  ۱. **سلول مالی عدد واقعی است**، نه متنِ فارسی‌شده؛ وگرنه کاربر نمی‌تواند در Excel
 *     جمع بزند یا فیلتر کند.
 *  ۲. **مبلغ بزرگ‌تر از محدوده امن Excel متن می‌شود، با هشدار.** Excel اعداد را با
 *     دقت ۱۵ رقم نگه می‌دارد؛ مبلغ ریالی بزرگ‌تر از آن بی‌صدا گرد می‌شود و گرد شدن
 *     بی‌صدا در یک سامانه مالی بدترین حالت ممکن است.
 *  ۳. **ضد Formula Injection:** متنی که با `= + - @` یا tab/CR شروع شود با پیشوند
 *     `'` نوشته می‌شود تا Excel آن را فرمول نشمارد.
 */

/** سقف امنِ عدد در Excel (همان `Number.MAX_SAFE_INTEGER`). */
export const MAX_SAFE_EXCEL_INTEGER = 9_007_199_254_740_991n;

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/** آیا این متن در Excel فرمول می‌شد؟ */
export function wouldBeFormula(value: string): boolean {
  return FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger));
}

/** نوشتن متن با خنثی‌سازی Formula Injection. */
export function writeText(cell: ExcelJS.Cell, value: string): void {
  if (value === '') {
    cell.value = null;
    return;
  }
  cell.value = wouldBeFormula(value) ? `'${value}` : value;
}

/** نوشتن مبلغ؛ بالاتر از محدوده امن، متن می‌شود با یادداشت هشدار. */
export function writeMoney(cell: ExcelJS.Cell, value: bigint): void {
  if (value <= MAX_SAFE_EXCEL_INTEGER && value >= -MAX_SAFE_EXCEL_INTEGER) {
    cell.value = Number(value);
    cell.numFmt = '#,##0';
    cell.alignment = { horizontal: 'right' };
    return;
  }

  cell.value = value.toString();
  cell.alignment = { horizontal: 'right' };
  cell.note = 'این مبلغ از محدوده دقت عددی Excel بزرگ‌تر است و به‌صورت متن نوشته شده تا گرد نشود.';
}

export function thinBorder(): Partial<ExcelJS.Borders> {
  const style = { style: 'thin' as const, color: { argb: 'FF333333' } };
  return { top: style, bottom: style, left: style, right: style };
}

/** نام شیت: حداکثر ۳۱ نویسه، بدون نویسه‌های ممنوع Excel. */
export function safeSheetName(title: string): string {
  const cleaned = title.replace(/[:\\/?*[\]]/gu, ' ').trim();
  const limited = cleaned.slice(0, 31);
  return limited === '' ? 'گزارش' : limited;
}

export function columnLetter(index: number): string {
  let out = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

/**
 * نام فایل امن برای هدر `Content-Disposition`.
 *
 * نام از عنوان گزارش ساخته می‌شود و عنوان را کاربر تعیین می‌کند؛ پس نویسه‌های کنترلی،
 * نقل‌قول، اسلش و نقطه‌های پشت‌سرهم حذف می‌شوند. هدر با `filename*=UTF-8''…` و
 * encode کامل فرستاده می‌شود، ولی نام تمیز، لایه دوم است.
 */
export function safeFilename(title: string, extension: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex -- نویسه‌های کنترلی باید حذف شوند
    .replace(/[\u0000-\u001f\u007f"'\\/:*?<>|]/gu, ' ')
    .replace(/\.{2,}/gu, '.')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 80);

  return `${cleaned === '' ? 'گزارش' : cleaned}.${extension}`;
}
