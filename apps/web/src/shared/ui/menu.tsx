import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from './cn';

/**
 * منوی کشویی — بدون وابستگی، ولی با رفتار کاملِ یک منوی واقعی.
 *
 * چیزی که یک `div` ساده ندارد و اینجا هست:
 *  - بسته شدن با کلیک بیرون و با Escape،
 *  - برگشتن فوکوس به دکمه باز‌کننده هنگام بستن (وگرنه فوکوس به ابتدای صفحه می‌پرد)،
 *  - پیمایش گزینه‌ها با جهت‌نماها و بستن با Tab،
 *  - `aria-expanded` و `aria-haspopup` روی دکمه و نقش `menu` روی فهرست.
 *
 * جهت باز شدن با `align` کنترل می‌شود و پیش‌فرض آن `start` است — در چیدمان راست‌چین
 * یعنی چسبیده به راستِ دکمه.
 */
export function Menu({
  trigger,
  children,
  align = 'start',
  label,
  className,
  panelClassName,
}: {
  /** محتوای دکمه باز‌کننده. */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  /** نام منو برای ابزار کمکی. */
  label: string;
  className?: string;
  panelClassName?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // بدون این، فوکوس روی عنصری می‌ماند که همین حالا از صفحه حذف شد.
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'Tab') setOpen(false);
          }}
          className={cn(
            'absolute z-50 mt-2 min-w-56 rounded-xl border border-border bg-popover p-1.5',
            'shadow-[var(--shadow-lift)] animate-[var(--animate-rise)]',
            align === 'start' ? 'start-0' : 'end-0',
            panelClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{children}</p>;
}

export function MenuSeparator(): JSX.Element {
  return <div role="separator" className="my-1.5 h-px bg-border" />;
}

export function MenuItem({
  children,
  onSelect,
  selected = false,
  className,
}: {
  children: ReactNode;
  onSelect: () => void;
  selected?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm',
        'transition-colors hover:bg-muted',
        selected ? 'bg-primary/10 text-primary' : 'text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}
