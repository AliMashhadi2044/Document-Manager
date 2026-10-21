import { useId, type ReactNode } from 'react';

import { cn } from './cn';
import { Icon } from './icon';
import { CONTROL_CLASS, HELP_CLASS, LABEL_CLASS, NUMERIC_CLASS, borderClass } from './field';
import { toPersianDigits } from '../format/money';

/** دامنه سال شمسی — همان چیزی که سرور و CHECK پایگاه داده هم اجبار می‌کنند. */
export const MIN_YEAR = 1300;
export const MAX_YEAR = 1500;

/** ارقام فارسی و عربی به لاتین؛ هر چیز دیگری دور ریخته می‌شود. */
function toDigits(text: string): string {
  let result = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x06f0 && code <= 0x06f9) result += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) result += String(code - 0x0660);
    else if (character >= '0' && character <= '9') result += character;
  }
  return result.slice(0, 4);
}

export interface YearInputProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: ReactNode;
  error?: string | undefined;
  id?: string;
  /** پیشنهادهای فهرست کشویی مرورگر — مثل سال‌های مالی باز. */
  suggestions?: readonly number[];
}

/**
 * ورودی سال شمسی.
 *
 * سه کاری که یک `input` ساده نمی‌کرد و اینجا هست:
 *
 *  ۱. **فقط سال پذیرفته می‌شود.** هر چیزی جز رقم کنار گذاشته می‌شود و طول روی چهار
 *     رقم بسته است؛ ارقام فارسی و عربی هم به لاتین تبدیل می‌شوند. پیش از این
 *     می‌شد هر متنی تایپ کرد و خطا تازه هنگام ثبت از سرور می‌آمد.
 *  ۲. **کم و زیاد کردن با یک کلیک.** سالی که کاربر می‌خواهد تقریباً همیشه یکی
 *     کمتر یا بیشتر از مقدار فعلی است؛ تایپ دوباره چهار رقم برای آن، کار اضافه است.
 *     کلیدهای بالا و پایین هم همین کار را می‌کنند.
 *  ۳. **پیشنهاد سال‌های موجود** با `datalist`، بدون اینکه ورودی را به آن فهرست محدود کند.
 */
export function YearInput({
  label,
  value,
  onChange,
  required = false,
  hint,
  error,
  id,
  suggestions,
}: YearInputProps): JSX.Element {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-years`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const current = Number(value);
  const valid = value.length === 4 && Number.isInteger(current);

  const step = (delta: number): void => {
    // از یک مقدار ناقص یا خالی، قدم زدن باید از جایی معقول شروع شود.
    const base = valid ? current : MIN_YEAR + 100;
    const next = Math.min(MAX_YEAR, Math.max(MIN_YEAR, base + delta));
    onChange(String(next));
  };

  const outOfRange = valid && (current < MIN_YEAR || current > MAX_YEAR);
  const shownError = error ?? (outOfRange ? 'سال خارج از دامنه معتبر است' : undefined);

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className={LABEL_CLASS}>
        {label}
        {required ? (
          <span className="text-destructive ms-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div className="flex items-stretch gap-1.5">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          maxLength={4}
          required={required}
          list={suggestions && suggestions.length > 0 ? listId : undefined}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={
            cn(shownError ? errorId : undefined, hint ? hintId : undefined) || undefined
          }
          value={value}
          onChange={(event) => onChange(toDigits(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              step(1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              step(-1);
            }
          }}
          className={cn(CONTROL_CLASS, NUMERIC_CLASS, 'text-center', borderClass(Boolean(shownError)))}
        />

        {suggestions && suggestions.length > 0 ? (
          <datalist id={listId}>
            {suggestions.map((year) => (
              <option key={year} value={year} />
            ))}
          </datalist>
        ) : null}

        <StepButton
          label={`یک سال کمتر از ${label}`}
          icon="minus"
          disabled={valid && current <= MIN_YEAR}
          onClick={() => step(-1)}
        />
        <StepButton
          label={`یک سال بیشتر از ${label}`}
          icon="plus"
          disabled={valid && current >= MAX_YEAR}
          onClick={() => step(1)}
        />
      </div>

      {hint && !shownError ? (
        <p id={hintId} className={cn(HELP_CLASS, 'text-muted-foreground')}>
          {hint}
        </p>
      ) : null}

      {shownError ? (
        <p id={errorId} role="alert" className={cn(HELP_CLASS, 'text-destructive')}>
          {shownError}
        </p>
      ) : null}
    </div>
  );
}

function StepButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: ReactNode;
  icon: 'plus' | 'minus';
  onClick: () => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={typeof label === 'string' ? label : undefined}
      title={typeof label === 'string' ? label : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-input',
        'bg-card text-muted-foreground transition-all duration-150',
        'hover:border-muted-foreground/40 hover:text-foreground active:scale-90',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/** نمایش خواندنی یک سال، برای متن‌های کمکی. */
export const formatYear = (year: number | null | undefined): string =>
  year === null || year === undefined ? '—' : toPersianDigits(String(year));
