import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn';
import { CONTROL_CLASS, HELP_CLASS, LABEL_CLASS, borderClass } from './field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  /** پیام خطای اعتبارسنجی، فارسی و دقیق. */
  error?: string | undefined;
  hint?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, id, required, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

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
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        // پیام خطا به‌صورت برنامه‌ای به ورودی گره می‌خورد تا صفحه‌خوان آن را بخواند.
        aria-describedby={cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined}
        className={cn(CONTROL_CLASS, borderClass(Boolean(error)), className)}
        {...props}
      />

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
});
