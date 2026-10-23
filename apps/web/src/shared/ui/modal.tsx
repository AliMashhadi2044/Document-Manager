import { useEffect, useId, useRef, type ReactNode } from 'react';

import { cn } from './cn';

/**
 * گفت‌وگوی پوشا (modal) روی پایه `<dialog>`.
 *
 * چرا `<dialog>` و نه یک `div` با z-index: مرورگر خودش تله فوکوس، لایه بالاتر از همه
 * عناصر و بستن با Esc را می‌دهد. پیاده‌سازی دستی همین سه چیز، جایی است که دسترس‌پذیری
 * معمولاً قربانی می‌شود.
 *
 * جهت متن از `document.documentElement` می‌آید (سامانه راست‌به‌چپ است) و اینجا چیزی
 * بازنویسی نمی‌شود.
 */
export function Modal({
  title,
  onClose,
  children,
  size = 'default',
  toolbar,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * `full` تمام صفحه است — برای نمایشگر فایل.
   *
   * یک اسکن A4 در یک کادر ۵۶rem خوانا نیست؛ کاربر یا باید زوم کند و دنبال متن
   * بگردد، یا فایل را دانلود کند. نمایشگر تمام‌صفحه همان کاری را می‌کند که
   * نمایشگر سیستم می‌کرد، بی آنکه کاربر از سامانه بیرون برود.
   */
  size?: 'default' | 'full';
  /** کنترل‌های کنار عنوان (زوم، صفحه، دانلود) — فقط در حالت تمام‌صفحه. */
  toolbar?: ReactNode;
}): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      // نام دسترس‌پذیر گفت‌وگو از عنوانش می‌آید؛ بدون این، صفحه‌خوان فقط «گفت‌وگو»
      // می‌گوید و کاربر نمی‌داند کدام گفت‌وگو باز شده است.
      aria-labelledby={titleId}
      // کلیک روی پس‌زمینه و کلید Esc هر دو به یک مسیر بستن می‌رسند.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className={cn(
        'border border-border bg-card text-foreground',
        'shadow-[var(--shadow-lift)] animate-[var(--animate-dialog)]',
        'backdrop:bg-foreground/40 backdrop:backdrop-blur-sm backdrop:animate-[backdrop-in_0.24s_ease-out_both]',
        size === 'full'
          ? /*
               `inset-0` و نه `100vw/100vh`.

               `<dialog>` خودش `position: fixed` است، پس چسباندنش به چهار طرف،
               دقیقاً اندازهٔ ناحیهٔ دید را می‌دهد. واحد `vw` پهنای نوار اسکرول را
               هم می‌شمارد و کادر چند ده پیکسل از صفحه بیرون می‌زند. `max-w/max-h`
               بومی `<dialog>` هم ۹۰٪ است و باید باز شود.
            */
            'inset-0 m-0 h-auto max-h-none w-auto max-w-none rounded-none'
          : 'm-auto w-[min(56rem,92vw)] rounded-2xl p-6',
      )}
    >
      {size === 'full' ? (
        <div className="flex h-full flex-col">
          <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
            <h3 id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold">
              {title}
            </h3>
            {toolbar}
          </header>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/40">{children}</div>
        </div>
      ) : (
        <>
          <h3 id={titleId} className="mb-4 truncate text-base font-semibold">
            {title}
          </h3>
          {children}
        </>
      )}
    </dialog>
  );
}
