import type { CSSProperties, ReactNode } from 'react';

import { cn } from './cn';
import { Button } from './button';

/**
 * حالت‌های مشترک همه صفحات.
 *
 * الزام §۳۶ پرامپت: هر قابلیت باید حالت loading، خطا، خالی و موفقیت داشته باشد.
 * این‌ها اینجا یک‌بار تعریف می‌شوند تا در هر صفحه از نو ساخته نشوند.
 */

export function LoadingState({ label = 'در حال بارگذاری…' }: { label?: string }): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 p-10 text-muted-foreground"
    >
      {/*
        دو حلقه با سرعت و جهت متفاوت.
        یک حلقه ساده در صفحه‌ای که چند ثانیه منتظر می‌ماند، ثابت به‌نظر می‌رسد؛ حرکت
        مرکب، «زنده بودن» را بدون شلوغی نشان می‌دهد.
      */}
      <span aria-hidden="true" className="relative flex size-9 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span
          className="absolute inset-2 animate-spin rounded-full border-2 border-accent/20 border-b-accent"
          style={{ animationDirection: 'reverse', animationDuration: '1.4s' }}
        />
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = 'خطا در دریافت اطلاعات',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
      <h3 className="text-sm font-semibold text-destructive">{title}</h3>
      {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      {/* تصویر کوچک «جعبه خالی» — صفحه خالی بدون هیچ نشانه بصری، حس خرابی می‌دهد. */}
      <svg
        viewBox="0 0 64 48"
        aria-hidden="true"
        className="mx-auto mb-3 h-12 w-16 text-muted-foreground/45"
      >
        <path
          d="M8 18h48v22a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z"
          fill="currentColor"
          fillOpacity="0.14"
        />
        <path
          d="M8 18h48v22a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4zM8 18l6-12h36l6 12M24 18v5a8 8 0 0 0 16 0v-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-muted', className)} />;
}

/**
 * جای‌گیر درخشان.
 *
 * تفاوتش با `Skeleton` فقط ظاهر نیست: موج درخشان حرکتی **جهت‌دار** دارد و حس
 * «در حال آمدن» می‌دهد، در حالی که ضربان ساده فقط می‌گوید «چیزی اینجا هست». برای
 * بارگذاری اولیه صفحه‌ها همین حس لازم است.
 */
export function Shimmer({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn(
        'rounded-lg bg-muted',
        'bg-[linear-gradient(90deg,hsl(var(--muted))_25%,hsl(var(--muted-foreground)/0.14)_50%,hsl(var(--muted))_75%)]',
        'bg-[length:200%_100%] animate-[var(--animate-shimmer)]',
        className,
      )}
    />
  );
}
