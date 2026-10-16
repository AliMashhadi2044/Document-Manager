/**
 * قواعد فاکتور سوخت.
 *
 * فاکتور سوخت یک **ماه شمسی** دارد و چند ردیف «روز / مبلغ». تاریخ کامل هر ردیف از
 * سال و ماه فاکتور به‌علاوه روز ردیف ساخته می‌شود — و همین ساختن، اعتبارسنجی را هم
 * انجام می‌دهد: روز ۳۱ در ماه ۳۰ روزه و روز ۳۰ در اسفند سال غیرکبیسه وجود ندارند و
 * رد می‌شوند (معیار پذیرش ۴ فاز ۴).
 *
 * سرور **هرگز** تاریخ تبدیل‌شده کلاینت را قبول نمی‌کند؛ از اجزای شمسی بازسازی می‌کند.
 */

import { FinancialError } from '../financial/calculate.js';
import { JalaliError, daysInJalaliMonth, jalaliToIsoDate } from '../jalali/jalali.js';
import type { Money } from '../money/money.js';

/** سقف ردیف — یک ماه حداکثر ۳۱ روز دارد و برای هر روز چند بار سوخت‌گیری ممکن است. */
export const MAX_FUEL_ENTRIES = 62;

export interface FuelEntryInput {
  /** روز ماه شمسی، ۱ تا ۳۱. */
  readonly day: number;
  readonly amount: Money;
}

export interface ResolvedFuelEntry {
  readonly day: number;
  /** تاریخ میلادی `YYYY-MM-DD` که سرور خودش ساخته است. */
  readonly entryDate: string;
  readonly amount: Money;
}

/**
 * اعتبارسنجی و مرتب‌سازی ردیف‌های سوخت‌گیری.
 *
 * ترتیب خروجی: روز صعودی، و برای روزهای تکراری ترتیب ورودی حفظ می‌شود (مرتب‌سازی
 * پایدار) تا شماره ردیف‌ها بین دو بار محاسبه جابه‌جا نشوند.
 *
 * چند ردیف در یک روز **مجاز** است؛ در یک روز ممکن است بیش از یک بار سوخت‌گیری شود.
 */
export function resolveFuelEntries(
  jalaliYear: number,
  jalaliMonth: number,
  entries: readonly FuelEntryInput[],
): ResolvedFuelEntry[] {
  if (entries.length === 0) {
    throw new FinancialError(
      'فاکتور سوخت باید حداقل یک ردیف سوخت‌گیری داشته باشد',
      'FUEL_ENTRIES_EMPTY',
      'entries',
    );
  }
  if (entries.length > MAX_FUEL_ENTRIES) {
    throw new FinancialError(
      `تعداد ردیف‌های سوخت‌گیری نمی‌تواند از ${MAX_FUEL_ENTRIES} بیشتر باشد`,
      'FUEL_ENTRIES_TOO_MANY',
      'entries',
    );
  }

  // طول ماه را یک‌بار می‌گیریم تا خطای «سال/ماه نامعتبر» پیش از خطای روز دیده شود.
  const monthLength = translateJalali(
    () => daysInJalaliMonth(jalaliYear, jalaliMonth),
    'jalaliMonth',
  );

  const indexed = entries.map((entry, index) => ({ entry, index }));
  indexed.sort((a, b) => a.entry.day - b.entry.day || a.index - b.index);

  return indexed.map(({ entry, index }) => {
    if (!Number.isInteger(entry.day) || entry.day < 1) {
      throw new FinancialError('روز سوخت‌گیری نامعتبر است', 'FUEL_DAY_INVALID', `entries.${index}.day`);
    }
    if (entry.day > monthLength) {
      throw new FinancialError(
        `این ماه ${monthLength} روز دارد و روز ${entry.day} در آن وجود ندارد`,
        'FUEL_DAY_OUT_OF_MONTH',
        `entries.${index}.day`,
      );
    }
    if (entry.amount < 0n) {
      throw new FinancialError(
        'مبلغ سوخت‌گیری نمی‌تواند منفی باشد',
        'FUEL_AMOUNT_NEGATIVE',
        `entries.${index}.amount`,
      );
    }

    return {
      day: entry.day,
      entryDate: translateJalali(
        () => jalaliToIsoDate({ year: jalaliYear, month: jalaliMonth, day: entry.day }),
        `entries.${index}.day`,
      ),
      amount: entry.amount,
    };
  });
}

/**
 * خطای تاریخ شمسی به خطای مالی با `path` ترجمه می‌شود تا مرز API فقط **یک** نوع
 * خطای دامنه ببیند و پیام همیشه به فیلد درست بچسبد.
 */
function translateJalali<T>(action: () => T, path: string): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof JalaliError) {
      throw new FinancialError(error.message, error.code, path);
    }
    throw error;
  }
}
