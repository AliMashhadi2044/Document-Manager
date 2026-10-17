import type { ReactNode } from 'react';

import { cn } from './cn';
import { Icon, type IconName } from './icon';

/**
 * کارت — واحد پایه چیدمان صفحه‌ها.
 *
 * پیش از این هر صفحه کلاس‌های `rounded-lg border border-border bg-card p-6` را از نو
 * می‌نوشت و به‌تدریج واگرا می‌شد (p-4 اینجا، p-6 آنجا). یک کامپوننت یعنی فاصله‌ها و
 * شعاع‌ها در کل برنامه یکی می‌مانند.
 *
 * عمق از **سایه** می‌آید نه از خط پررنگ؛ خط فقط یک مرز ملایم است.
 */
export function Card({
  className,
  children,
  interactive = false,
}: {
  className?: string;
  children: ReactNode;
  /** کارت‌های قابل کلیک با hover بازخورد می‌دهند. */
  interactive?: boolean;
}): JSX.Element {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]',
        interactive && 'transition-shadow hover:shadow-[var(--shadow-lift)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name={icon} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return <div className={cn('p-5', className)}>{children}</div>;
}
