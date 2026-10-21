import { useId } from 'react';
import { bankByCode, bankCodeFromDigits, validateIban } from '@dm/shared';

import { cn } from './cn';
import { toPersianDigits } from '../format/money';

/** ۲۴ رقم پس از `IR`. */
const IBAN_DIGITS = 24;

/**
 * ورودی شبا با پیشوند ثابت `IR`، تشخیص بانک حین تایپ و نشان بانک.
 *
 * سه تصمیم:
 *
 *  - **`IR` بیرون از کادر ویرایش است.** همهٔ شباهای ایران با `IR` شروع می‌شوند؛
 *    وقتی کاربر خودش تایپش می‌کند، هم جای خطاست و هم شمارش رقم‌ها را به هم می‌ریزد.
 *    اینجا یک برچسب ثابت است و ورودی فقط رقم می‌گیرد — ولی اگر کاربر شبای کامل را
 *    **جای‌گذاری** کند، `IR` ابتدای آن بی‌صدا کنار گذاشته می‌شود.
 *  - **بانک بدون رفت‌وبرگشت به سرور پیدا می‌شود.** کد بانک رقم‌های ۳ تا ۵ است، پس
 *    از همان پنجمین رقم می‌شود نشان و نام را نشان داد. فهرست بانک‌ها و الگوریتم
 *    MOD-97-10 در بستهٔ مشترک‌اند و همان چیزی‌اند که سرور با آن می‌سنجد؛ این نمایش
 *    جای اعتبارسنجی سرور را نمی‌گیرد، فقط زودتر خبر می‌دهد.
 *  - **نشان با `<img>` می‌آید، نه SVG درون‌خطی.** فایل‌ها دادهٔ بیرونی‌اند و SVG در
 *    `<img>` غیرتعاملی است؛ مرورگر اسکریپت درونش را اجرا نمی‌کند.
 *
 * تشخیص بانک، تأیید مالکیت یا فعال بودن حساب نیست.
 */
export function IbanInput({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  hint,
}: {
  label: string;
  /** فقط رقم‌ها، بدون `IR`. */
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
}): JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;

  const bank = bankByCode(bankCodeFromDigits(value));
  const complete = value.length === IBAN_DIGITS;
  const check = complete ? validateIban(`IR${value}`) : null;
  const checksumError = check && !check.valid ? (check.errorMessage ?? 'شبا معتبر نیست') : null;
  const shownError = error ?? checksumError ?? undefined;


  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-destructive ms-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <div
        dir="ltr"
        className={cn(
          'flex items-stretch overflow-hidden rounded-lg border bg-card transition-colors',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
          shownError ? 'border-destructive' : 'border-input',
          disabled && 'opacity-60',
        )}
      >
        {/*
          پیشوند ثابت. `aria-hidden` است چون در متن راهنما هم گفته می‌شود و
          خواندنش پیش از هر رقم، فقط حرف اضافه است.
        */}
        <span
          aria-hidden="true"
          className="flex items-center border-e border-input bg-muted px-3 font-mono text-sm text-muted-foreground"
        >
          IR
        </span>

        <input
          id={id}
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          disabled={disabled}
          value={groupDigits(value)}
          aria-describedby={hintId}
          aria-invalid={shownError ? true : undefined}
          onChange={(event) => onChange(onlyIbanDigits(event.target.value))}
          placeholder="0000 0000 0000 0000 0000 0000"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm tracking-wide outline-none placeholder:text-muted-foreground/60"
        />

        {bank ? (
          <span className="flex max-w-[42%] items-center gap-2 border-s border-input bg-muted/40 px-2">
            <img
              src={`/bank-logos/${bank.code}.svg`}
              alt=""
              width={20}
              height={20}
              loading="lazy"
              className="size-5 shrink-0 object-contain"
              // بانکی که نشانش را نداریم نباید کادر شکسته نشان دهد؛ نام کافی است.
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
            <span dir="rtl" className="truncate text-xs text-foreground">
              {bank.titleFa}
            </span>
          </span>
        ) : null}
      </div>

      <p
        id={hintId}
        className={cn('text-xs', shownError ? 'text-destructive' : 'text-muted-foreground')}
      >
        {shownError ??
          (bank
            ? `${bank.titleFa} — ${
                complete ? 'رقم کنترلی درست است' : `${toPersianDigits(String(IBAN_DIGITS - value.length))} رقم مانده`
              }. تشخیص بانک، تأیید مالکیت حساب نیست.`
            : (hint ?? 'شماره با IR شروع می‌شود و ۲۴ رقم دارد؛ IR را لازم نیست بنویسید.'))}
      </p>
    </div>
  );
}

/** ارقام فارسی و عربی به ASCII، حذف هر چیز دیگر، و کنار گذاشتن `IR`ِ جای‌گذاری‌شده. */
export function onlyIbanDigits(input: string): string {
  const ascii = input
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .trim();

  const withoutPrefix = ascii.replace(/^IR/iu, '');
  return withoutPrefix.replace(/\D/gu, '').slice(0, IBAN_DIGITS);
}

/** گروه‌های چهارتایی — همان قالبی که روی فیش بانکی نوشته می‌شود. */
function groupDigits(digits: string): string {
  return (digits.match(/.{1,4}/gu) ?? []).join(' ');
}
