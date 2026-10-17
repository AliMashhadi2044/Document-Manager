import { useEffect, useId, useRef, type ReactNode } from 'react';

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
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      className="m-auto w-[min(56rem,92vw)] rounded-2xl border border-border bg-card p-6 text-foreground shadow-[var(--shadow-lift)] backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <h3 id={titleId} className="mb-4 truncate text-base font-semibold">
        {title}
      </h3>
      {children}
    </dialog>
  );
}
