import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** حالت در حال انجام: دکمه غیرفعال می‌شود تا ثبت تکراری رخ ندهد. */
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-primary/90 hover:shadow-[var(--shadow-lift)]',
  secondary: 'border border-border bg-muted text-foreground hover:bg-muted/70',
  ghost: 'bg-transparent text-foreground hover:bg-muted',
  destructive:
    'bg-destructive text-destructive-foreground shadow-[var(--shadow-soft)] hover:bg-destructive/90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // دکمه در حال بارگذاری غیرفعال است — لایه آخر دفاع در برابر ثبت دوباره،
      // نه لایه اول (ریسک R8 با Idempotency-Key در سرور پوشش داده می‌شود).
      disabled={disabled === true || loading}
      aria-busy={loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        // بازخورد فشردن: دکمه زیر انگشت کمی جمع می‌شود. بدون آن، روی صفحه لمسی
        // معلوم نیست کلیک گرفته شده یا نه.
        'transition-[background-color,box-shadow,transform] duration-150',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

function Spinner(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
