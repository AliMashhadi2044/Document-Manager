import type { ReactNode } from 'react';

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
    <div role="status" aria-live="polite" className="flex items-center gap-3 p-6 text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
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
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
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
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-muted', className)} />;
}
