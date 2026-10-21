/**
 * کلید دوحالته — چک‌باکس بومی با ظاهر سوئیچ.
 *
 * پایه عمداً `<input type="checkbox">` است و نه یک `div` با `role="switch"`:
 * فوکوس، کلید فاصله، حالت `:disabled` و اعلام وضعیت به صفحه‌خوان همه مجانی
 * به‌دست می‌آیند؛ پیاده‌سازی دستی، همان‌جایی است که دسترس‌پذیری قربانی می‌شود.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <label
      className={`flex items-center gap-2.5 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {/*
        دستگیره با ترازبندی flex جابه‌جا می‌شود، نه با جابه‌جایی دستی.
        هم در چیدمان راست‌چین درست کار می‌کند و هم به یک عنصرِ خواهرِ ورودی نیاز دارد
        (واریانت peer فقط روی خواهرها کار می‌کند، نه فرزندانِ آن‌ها).
      */}
      <span
        aria-hidden="true"
        className="flex h-5 w-9 shrink-0 items-center rounded-full bg-muted p-0.5 transition-colors peer-checked:justify-end peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40"
      >
        <span className="size-4 rounded-full bg-card shadow transition-all" />
      </span>
      {label}
    </label>
  );
}
