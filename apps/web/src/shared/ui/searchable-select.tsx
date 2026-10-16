import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from './cn';

export interface SearchableOption {
  readonly value: string;
  readonly label: string;
  /** خط دوم، مثل ناحیه مدرسه یا نوع خودرو. */
  readonly description?: string | undefined;
}

export interface SearchableSelectProps {
  label?: ReactNode;
  required?: boolean;
  error?: string | undefined;
  hint?: ReactNode;
  placeholder?: string;
  /** گزینه‌های صفحه جاری — جست‌وجو **سمت سرور** انجام شده است. */
  options: readonly SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  /** متن جست‌وجو را بالا می‌دهد تا کوئری سرور با آن ساخته شود. */
  search: string;
  onSearchChange: (search: string) => void;
  loading?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  /** تعداد کل نتایج سرور، برای پیام «نتایج بیشتری هست». */
  total?: number | undefined;
}

/**
 * انتخاب جست‌وجوپذیر برای فهرست‌های بلند.
 *
 * دو تصمیم مهم:
 *
 *  ۱. جست‌وجو **سمت سرور** است. این کامپوننت هرگز کل فهرست را نمی‌گیرد و فیلتر
 *     نمی‌کند؛ فقط متن را بالا می‌دهد و صفحه نتایج را نشان می‌دهد (الزام بهینگی Q12).
 *  ۲. دسترس‌پذیری با الگوی `combobox` واقعی: پیمایش با کلید، `aria-activedescendant`
 *     و بستن با Escape. فهرست بدون کیبورد، برای کاربر صفحه‌خوان بی‌استفاده است.
 */
export function SearchableSelect({
  label,
  required = false,
  error,
  hint,
  placeholder = 'برای جست‌وجو تایپ کنید…',
  options,
  value,
  onChange,
  search,
  onSearchChange,
  loading = false,
  disabled = false,
  emptyLabel = 'موردی یافت نشد',
  total,
}: SearchableSelectProps): JSX.Element {
  const inputId = useId();
  const listId = `${inputId}-list`;
  const errorId = `${inputId}-error`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);

  // بستن با کلیک بیرون — بدون این، فهرست باز روی بقیه فرم می‌ماند.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options]);

  const commit = (option: SearchableOption): void => {
    onChange(option.value);
    onSearchChange(option.label);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {label}
          {required ? (
            <span className="text-destructive ms-1" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
            setOpen(true);
            // تایپ دوباره یعنی انتخاب قبلی دیگر معتبر نیست؛ نگه داشتنش باعث می‌شود
            // کاربر فکر کند چیزی را انتخاب کرده که در کادر دیده نمی‌شود.
            if (value && event.target.value !== selected?.label) onChange('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open) {
              const option = options[activeIndex];
              if (option) {
                event.preventDefault();
                commit(option);
              }
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={cn(
            'block w-full rounded-md border bg-card px-3 py-2 text-sm',
            'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-destructive' : 'border-input',
          )}
        />

        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg"
          >
            {loading ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">در حال جست‌وجو…</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</li>
            ) : (
              options.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  // mousedown، نه click: تا blur ورودی فهرست را پیش از انتخاب نبندد.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(option);
                  }}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    index === activeIndex ? 'bg-muted' : '',
                    option.value === value ? 'font-medium text-primary' : '',
                  )}
                >
                  <span className="block">{option.label}</span>
                  {option.description ? (
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </li>
              ))
            )}

            {total !== undefined && total > options.length ? (
              <li className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                نتایج بیشتری وجود دارد؛ جست‌وجو را دقیق‌تر کنید.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
