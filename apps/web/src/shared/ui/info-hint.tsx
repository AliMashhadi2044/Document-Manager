import { useId, useState, type ReactNode } from 'react';

import { cn } from './cn';

/**
 * علامت «؟» کنار یک عدد یا نمودار، با توضیح اینکه **این عدد دقیقاً چیست**.
 *
 * انگیزه‌اش یک سوءتفاهم واقعی است: دو کاشی در داشبورد هر دو «جمع کل» می‌گویند، ولی
 * یکی مبلغ همهٔ اسناد سال است و دیگری فقط اسناد فیلترشده. تا وقتی دامنه و مبنای هر
 * عدد نوشته نشود، کاربر ناچار است حدس بزند — و در یک سامانهٔ مالی، حدس یعنی تصمیم
 * اشتباه.
 *
 * سه تصمیم در پیاده‌سازی:
 *
 *  ۱. **دکمه است، نه `title`.** `title` مرورگر روی لمس باز نمی‌شود، با تأخیر
 *     می‌آید و صفحه‌خوان‌ها یکدست نمی‌خوانندش. اینجا با hover، با فوکوس صفحه‌کلید و
 *     با کلیک (لمس) باز می‌شود.
 *  ۲. **متن در DOM است**، نه در یک attribute: `aria-describedby` به آن اشاره
 *     می‌کند، پس صفحه‌خوان همان توضیحی را می‌خواند که دیده می‌شود.
 *  ۳. از جریان چیدمان بیرون می‌آید (`absolute`) تا باز شدنش ارتفاع کارت را تکان
 *     ندهد.
 */
export function InfoHint({
  label,
  children,
  align = 'end',
  className,
}: {
  /** نام همان چیزی که توضیح می‌دهد — برای صفحه‌خوان: «راهنمای …». */
  label: string;
  children: ReactNode;
  /** سمتی که حباب به آن می‌چسبد؛ در کارت‌های لبهٔ راست، `start` بهتر می‌نشیند. */
  align?: 'start' | 'end';
  className?: string;
}): JSX.Element {
  const id = useId();

  /*
    دو حالت، نه یکی.

    با یک حالتِ مشترک، کلیک روی چیزی که همین حالا زیر نشانگر است آن را **می‌بست**:
    hover بازش کرده بود و کلیک، toggle می‌کرد. حالا کلیک آن را سنجاق می‌کند و
    بیرون رفتن نشانگر، سنجاق‌شده را نمی‌بندد.
  */
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={`راهنمای ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((current) => !current)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false);
          setPinned(false);
        }}
        className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-bold leading-none text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        ؟
      </button>

      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute top-[26px] z-30 w-64 rounded-lg border border-border bg-popover p-3 text-start text-[11px] leading-5 font-normal text-foreground shadow-[var(--shadow-lift)]',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
