import { useState } from 'react';
import { JalaliError, formatJalali, isoDateToJalali, jalaliToIsoDate, parseJalali } from '@dm/shared';

import { Input } from './input';

/**
 * ورود تاریخ کامل شمسی به‌صورت متنی (`۱۴۰۵/۰۷/۲۴`).
 *
 * چرا متنی و نه سه انتخابگر: بایگان شماره و تاریخ سند را از روی برگه کاغذی وارد
 * می‌کند و تایپ پیوسته سریع‌تر از سه بار باز کردن فهرست است. ارقام فارسی هم پذیرفته
 * می‌شوند، چون صفحه‌کلید فارسی همان‌ها را می‌فرستد.
 *
 * اعتبارسنجی با `parseJalali` از `@dm/shared` انجام می‌شود — همان تابعی که سرور
 * استفاده می‌کند. پس «۳۱ مهر» هر دو طرف یک‌جور رد می‌شود و تقویم دوم و متفاوتی در
 * کلاینت ساخته نمی‌شود (ریسک R12).
 *
 * مقدار بیرونی **همیشه میلادی `YYYY-MM-DD`** است، چون قرارداد API همین است و سرور
 * هرگز به تبدیل کلاینت اعتماد نمی‌کند.
 */
export function JalaliDateInput({
  label,
  isoValue,
  onChange,
  required = false,
  disabled = false,
}: {
  label: string;
  isoValue: string | null;
  onChange: (isoDate: string | null) => void;
  required?: boolean;
  disabled?: boolean;
}): JSX.Element {
  const [text, setText] = useState(() =>
    isoValue ? formatJalali(isoDateToJalali(isoValue)) : '',
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <Input
      label={label}
      required={required}
      disabled={disabled}
      inputMode="numeric"
      placeholder="۱۴۰۵/۰۷/۲۴"
      value={text}
      error={error ?? undefined}
      hint={error === null && text.trim() !== '' ? describe(text) : 'قالب: سال/ماه/روز'}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);

        if (next.trim() === '') {
          setError(null);
          onChange(null);
          return;
        }

        try {
          const parsed = parseJalali(next);
          setError(null);
          onChange(jalaliToIsoDate(parsed));
        } catch (caught) {
          // پیام خطای تقویم خودش فارسی و دقیق است («۳۱ مهر» وجود ندارد)؛ بازنویسی‌اش
          // فقط دقت را کم می‌کند.
          setError(caught instanceof JalaliError ? caught.message : 'تاریخ نامعتبر است');
          onChange(null);
        }
      }}
    />
  );
}

/** تاریخ معتبر را به شکل یکدست نشان می‌دهد تا کاربر مطمئن شود درست خوانده شده. */
function describe(text: string): string {
  try {
    return `تاریخ خوانده‌شده: ${formatJalali(parseJalali(text))}`;
  } catch {
    return 'قالب: سال/ماه/روز';
  }
}
