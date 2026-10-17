import type { ReactNode } from 'react';

import { cn } from './cn';

/**
 * نشان وضعیت.
 *
 * رنگ‌ها روی زمینه ۱۲٪ همان رنگ می‌نشینند و روشنایی توکن‌ها طوری انتخاب شده که
 * نسبت کنتراست در هر دو تم بالای ۴٫۵:۱ بماند (`globals.css`). نشان **هرگز** تنها
 * حامل معنا نیست: متن فارسی همیشه کنارش هست، چون رنگ برای کاربر کوررنگ معنا ندارد.
 */
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/12 text-primary',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-destructive/12 text-destructive',
  info: 'bg-info/12 text-info',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  /** نقطه رنگی کوچک برای ردیف‌های فشرده جدول. */
  dot?: boolean;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5',
        'text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
