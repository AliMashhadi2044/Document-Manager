import {
  JALALI_MONTH_NAMES,
  MAX_JALALI_YEAR,
  MIN_JALALI_YEAR,
  daysInJalaliMonth,
} from '@dm/shared';

import { Select } from './select';
import { toPersianDigits } from '../format/money';

/**
 * انتخاب ماه شمسی (سال + ماه).
 *
 * طول ماه از `@dm/shared` خوانده می‌شود، نه از جدولی که اینجا نوشته شود؛ همان تابعی
 * که سرور برای رد کردن «۳۱ مهر» استفاده می‌کند. دو پیاده‌سازی تقویم یعنی یک روز
 * اختلاف در جایی که هیچ‌کس انتظارش را ندارد (ریسک R12).
 */
export function JalaliMonthPicker({
  year,
  month,
  onChange,
  disabled = false,
  /** بازه سال‌های پیشنهادی؛ خارج از بازه مجاز سامانه ساخته نمی‌شود. */
  yearRange = 3,
}: {
  year: number;
  month: number;
  onChange: (next: { year: number; month: number }) => void;
  disabled?: boolean;
  yearRange?: number;
}): JSX.Element {
  const years: number[] = [];
  for (let candidate = year - yearRange; candidate <= year + yearRange; candidate += 1) {
    if (candidate >= MIN_JALALI_YEAR && candidate <= MAX_JALALI_YEAR) years.push(candidate);
  }

  const monthLength = safeMonthLength(year, month);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select
        label="سال شمسی"
        required
        disabled={disabled}
        placeholder={null}
        value={String(year)}
        onChange={(event) => onChange({ year: Number(event.target.value), month })}
        options={years.map((item) => ({
          value: String(item),
          label: toPersianDigits(String(item)),
        }))}
      />

      <Select
        label="ماه"
        required
        disabled={disabled}
        placeholder={null}
        value={String(month)}
        onChange={(event) => onChange({ year, month: Number(event.target.value) })}
        options={JALALI_MONTH_NAMES.map((name, index) => ({
          value: String(index + 1),
          label: name,
        }))}
        hint={
          monthLength === null
            ? undefined
            : `این ماه ${toPersianDigits(String(monthLength))} روز دارد.`
        }
      />
    </div>
  );
}

function safeMonthLength(year: number, month: number): number | null {
  try {
    return daysInJalaliMonth(year, month);
  } catch {
    return null;
  }
}
