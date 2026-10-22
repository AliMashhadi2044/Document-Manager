import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/**
 * جای‌دهی فهرست در پورتال.
 *
 * چرا پورتال و نه `absolute` ساده در جای خود: بعضی از این فهرست‌ها درون سلول
 * جدولی با `overflow-auto` هستند (ردیف‌های کالا) و آنجا **بریده** می‌شدند.
 *
 * نکته‌ای که یک‌بار هزینه داد: درون یک `dialog`، مختصات `fixed` دیگر نسبت به پنجره
 * نیستند. انیمیشن ورود گفت‌وگو یک `transform` باقی می‌گذارد (`fill-mode: both`) و هر عنصر
 * ترانسفورم‌شده، برای فرزندان `fixed` خود یک ظرف تازه می‌سازد — نتیجه‌اش این بود که
 * فهرست چند صد پیکسل آن‌طرف‌تر باز می‌شد. پس وقتی ظرف گفت‌وگوست، مختصات نسبت به
 * همان ظرف حساب می‌شوند.
 *
 * اگر پایین صفحه جا نباشد فهرست بالای دکمه باز می‌شود، و با اسکرول یا تغییر
 * اندازه دوباره محاسبه می‌گردد.
 */
function isContainingBlock(element: Element): boolean {
  const style = getComputedStyle(element);
  return (
    style.transform !== 'none' ||
    style.filter !== 'none' ||
    style.perspective !== 'none' ||
    style.contain.includes('paint') ||
    style.contain.includes('layout') ||
    style.willChange.includes('transform') ||
    style.willChange.includes('filter')
  );
}

export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement>,
  open: boolean,
  container: Element,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', opacity: 0 });

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const gap = 6;
    const edge = 8;
    const panelMax = 360;
    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const openUp = below < 220 && above > below;
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 2 * edge);
    const maxHeight = Math.min(panelMax, Math.max(openUp ? above : below, 160) - edge);
    const left = Math.min(
      Math.max(edge, rect.left),
      Math.max(edge, window.innerWidth - width - edge),
    );

    /*
      ترجیح همیشه `fixed` است: عنصرِ `fixed` در جریان چیدمانِ ظرف نمی‌نشیند، پس
      ارتفاع گفت‌وگو را بالا نمی‌برد و داخلش اسکرول نمی‌سازد — از کادر بیرون می‌زند،
      که همان رفتار درست است.

      فقط اگر ظرف خودش ظرفِ چینشِ عناصر `fixed` باشد (ترانسفورم، فیلتر، contain)
      ناچار به مختصات نسبی برمی‌گردیم، وگرنه فهرست چند صد پیکسل آن‌طرف‌تر باز می‌شود.
    */
    if (container === document.body || !isContainingBlock(container)) {
      setStyle({
        position: 'fixed',
        left,
        width,
        maxHeight,
        ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      });
      return;
    }

    const host = container.getBoundingClientRect();
    setStyle({
      position: 'absolute',
      left: left - host.left + container.scrollLeft,
      width,
      maxHeight,
      ...(openUp
        ? { bottom: host.bottom - rect.top + gap - container.scrollTop }
        : { top: rect.bottom - host.top + gap + container.scrollTop }),
    });
  }, [anchorRef, container]);

  // layout، نه effect: فهرست نباید یک فریم در جای اشتباه دیده شود.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;

    // capture: اسکرولِ ظرف‌های درونی هم باید جای فهرست را اصلاح کند.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  return style;
}
