import { useId, type ReactNode } from 'react';

import { cn } from './cn';
import { CONTROL_CLASS, HELP_CLASS, LABEL_CLASS, NUMERIC_CLASS, borderClass } from './field';
import { groupDigits, toPersianDigits } from '../format/money';

/**
 * ورود مبلغ ریالی.
 *
 * قاعده سخت: مقدار نگه‌داشته‌شده یک **رشته رقمی** است و هیچ‌جا از `Number` عبور
 * نمی‌کند (ADR-0003). کاربر می‌تواند با ارقام فارسی، جداکننده یا فاصله تایپ کند؛
 * نرمال‌سازی همان‌جا انجام می‌شود و چیزی که به API می‌رود همیشه `^\d+$` است.
 *
 * نمایش گروه‌بندی‌شده زیر کادر می‌آید، نه داخلش: قالب‌بندی زنده داخل کادر، موقعیت
 * نشانگر تایپ را جابه‌جا می‌کند و ورود مبالغ بلند را آزاردهنده می‌کند.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  hint,
}: {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | undefined;
  hint?: ReactNode;
}): JSX.Element {
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className={LABEL_CLASS}>
          {label}
          {required ? (
            <span className="text-destructive ms-1" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <input
        id={inputId}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value}
        onChange={(event) => onChange(normalizeAmountInput(event.target.value))}
        className={cn(CONTROL_CLASS, NUMERIC_CLASS, borderClass(Boolean(error)))}
      />

      {error ? (
        <p id={errorId} role="alert" className={cn(HELP_CLASS, 'text-destructive')}>
          {error}
        </p>
      ) : value ? (
        <p className={cn(HELP_CLASS, 'money text-muted-foreground')}>
          {toPersianDigits(groupDigits(value))} ریال
        </p>
      ) : hint ? (
        <p className={cn(HELP_CLASS, 'text-muted-foreground')}>{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * نگه داشتن فقط ارقام، با تبدیل ارقام فارسی و عربی به لاتین.
 *
 * صفرهای ابتدایی حذف می‌شوند تا «۰۱۲۳» و «۱۲۳» یک مبلغ باشند، ولی رشته خالی خالی
 * می‌ماند (نه صفر) تا فیلد پرنشده از صفر عمدی قابل تشخیص باشد.
 */
export function normalizeAmountInput(raw: string): string {
  let digits = '';
  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) digits += char;
    else if (code >= 0x06f0 && code <= 0x06f9) digits += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) digits += String(code - 0x0660);
  }

  const trimmed = digits.replace(/^0+(?=\d)/, '');
  return trimmed;
}
