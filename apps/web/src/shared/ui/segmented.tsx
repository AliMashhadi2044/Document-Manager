import { useId } from 'react';

import { cn } from './cn';
import { Icon, type IconName } from './icon';

export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
  readonly icon?: IconName;
  /** عددی که کنار برچسب می‌نشیند — مثلاً تعداد آیتم‌های همین گروه. */
  readonly badge?: string;
}

/**
 * کلید چندحالته (segmented control) — برای انتخاب‌های کم‌شمار و **هم‌وزن**.
 *
 * کجا به‌جای `Select`: وقتی گزینه‌ها دو یا سه تا باشند و خودِ انتخاب، شکل بقیهٔ فرم
 * را عوض کند. فهرست بازشو این را پنهان می‌کند؛ اینجا هر دو گزینه همیشه دیده می‌شوند
 * و یک کلیک فاصله دارند.
 *
 * پایه، رادیوی بومی است و نه `div` با `role="radio"`: پیمایش با کلیدهای جهت، تلهٔ
 * فوکوس گروه و اعلام «۱ از ۲» به صفحه‌خوان، همه مجانی به‌دست می‌آیند.
 */
export function Segmented({
  label,
  options,
  value,
  onChange,
  name,
  size = 'md',
}: {
  label: string;
  options: readonly SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  /** نام گروه رادیو؛ اگر چند کلید در یک صفحه باشند باید فرق کند. */
  name?: string;
  size?: 'md' | 'lg';
}): JSX.Element {
  const generated = useId();
  const groupName = name ?? generated;

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>

      <div
        className={cn(
          'inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/50 p-1',
          size === 'lg' ? 'text-sm' : 'text-xs',
        )}
      >
        {options.map((option) => {
          const active = option.value === value;

          return (
            <label
              key={option.value}
              className={cn(
                'group relative flex cursor-pointer items-center gap-2 rounded-lg transition-all duration-200',
                size === 'lg' ? 'h-11 px-4' : 'h-9 px-3',
                active
                  ? 'bg-card text-foreground shadow-[var(--shadow-soft)]'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40',
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={groupName}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
              />

              {option.icon ? (
                <Icon
                  name={option.icon}
                  size={size === 'lg' ? 18 : 15}
                  className={active ? 'text-primary' : ''}
                />
              ) : null}

              <span className="flex min-w-0 flex-col items-start">
                <span className={cn('truncate', active ? 'font-semibold' : 'font-medium')}>
                  {option.label}
                </span>
                {option.hint && size === 'lg' ? (
                  <span className="truncate text-[11px] font-normal text-muted-foreground">
                    {option.hint}
                  </span>
                ) : null}
              </span>

              {option.badge ? (
                <span
                  className={cn(
                    'money shrink-0 rounded-md px-1.5 py-0.5 text-[11px]',
                    active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {option.badge}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
