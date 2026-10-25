import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from './cn';
import { useAnchoredPosition } from './use-anchored-position';

/**
 * علامت «؟» کنار یک عدد یا نمودار، با توضیح اینکه **این عدد دقیقاً چیست**.
 *
 * انگیزه‌اش یک سوءتفاهم واقعی است: دو کاشی در داشبورد هر دو «جمع کل» می‌گویند، ولی
 * یکی مبلغ همهٔ اسناد سال است و دیگری فقط اسناد فیلترشده. تا وقتی دامنه و مبنای هر
 * عدد نوشته نشود، کاربر ناچار است حدس بزند — و در یک سامانهٔ مالی، حدس یعنی تصمیم
 * اشتباه.
 *
 * چهار تصمیم در پیاده‌سازی:
 *
 *  ۱. **دکمه است، نه `title`.** `title` مرورگر روی لمس باز نمی‌شود، با تأخیر
 *     می‌آید و صفحه‌خوان‌ها یکدست نمی‌خوانندش. اینجا با hover، با فوکوس صفحه‌کلید و
 *     با کلیک (لمس) باز می‌شود.
 *  ۲. **متن در DOM است**، نه در یک attribute: `aria-describedby` به آن اشاره
 *     می‌کند، پس صفحه‌خوان همان توضیحی را می‌خواند که دیده می‌شود.
 *  ۳. **پورتال، نه `absolute` در جای خود.** کاشی‌های داشبورد `overflow-hidden`
 *     دارند — لازمش دارند تا نمودار کوچک تا لبهٔ کارت برود — و حباب همان‌جا
 *     **بریده** می‌شد. حالا بیرون از کارت رندر می‌شود و هیچ ظرفی نمی‌تواند
 *     ببُردش؛ همان کاری که فهرست‌های بازشو از قبل می‌کردند، با همان ابزار.
 *  ۴. **دو حالت، نه یکی**: با یک حالتِ مشترک، کلیک روی چیزی که همین حالا زیر
 *     نشانگر است آن را می‌بست — hover بازش کرده بود و کلیک toggle می‌کرد. حالا
 *     کلیک آن را سنجاق می‌کند و بیرون رفتن نشانگر، سنجاق‌شده را نمی‌بندد.
 */
export function InfoHint({
  label,
  children,
  className,
}: {
  /** نام همان چیزی که توضیح می‌دهد — برای صفحه‌خوان: «راهنمای …». */
  label: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  /** ظرف پورتال: گفت‌وگوی پوشای دربرگیرنده، وگرنه بدنه سند. */
  const container =
    open && buttonRef.current
      ? (buttonRef.current.closest('dialog') ?? document.body)
      : document.body;

  // عرض حباب از دکمه نمی‌آید — دکمه ۱۸ پیکسل است؛ همین کمینه عرضش را تعیین می‌کند.
  const position = useAnchoredPosition(buttonRef, open, container, 280);

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        ref={buttonRef}
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

      {open
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={position}
              className="z-50 block overflow-auto rounded-lg border border-border bg-popover p-3 text-start text-[11px] font-normal leading-5 text-foreground shadow-[var(--shadow-lift)]"
            >
              {children}
            </span>,
            container,
          )
        : null}
    </span>
  );
}
