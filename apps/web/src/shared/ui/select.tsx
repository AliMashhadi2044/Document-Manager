import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { cn } from './cn';
import { CONTROL_CLASS, HELP_CLASS, LABEL_CLASS, borderClass } from './field';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
  options: readonly SelectOption[];
  /** متن گزینه خالی. اگر `null` باشد، گزینه خالی ساخته نمی‌شود. */
  placeholder?: string | null;
}

/**
 * انتخاب از فهرست کوتاه و ثابت.
 *
 * برای فهرست‌های بلند (مدرسه، پلاک، فروشنده) از `SearchableSelect` استفاده می‌شود که
 * جست‌وجو را به سرور می‌سپارد؛ آوردن کل جدول به مرورگر الزام بهینگی را نقض می‌کند.
 */
export function Select({
  className,
  label,
  error,
  hint,
  options,
  placeholder = 'انتخاب کنید…',
  id,
  required,
  ...props
}: SelectProps): JSX.Element {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;

  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={selectId} className={LABEL_CLASS}>
          {label}
          {required ? (
            <span className="text-destructive ms-1" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <select
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined}
        // فضای انتهای کنترل برای فلش بومی مرورگر باز می‌ماند تا متن گزینه زیرش نرود.
        className={cn(CONTROL_CLASS, 'pe-8', borderClass(Boolean(error)), className)}
        {...props}
      >
        {placeholder === null ? null : <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>

      {hint && !error ? (
        <p id={hintId} className={cn(HELP_CLASS, 'text-muted-foreground')}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className={cn(HELP_CLASS, 'text-destructive')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
