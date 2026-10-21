import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from './cn';

/**
 * عددی که با عوض شدن، جهش کوتاهی می‌کند.
 *
 * چرا لازم شد: وقتی فیلتر سال عوض می‌شود، همه اعداد صفحه هم‌زمان جای خود را به
 * اعداد تازه می‌دهند. بدون هیچ نشانه‌ای، کاربر نمی‌داند عددی که می‌بیند تازه است یا
 * همان قبلی — به‌خصوص وقتی مقدار تازه اتفاقاً نزدیک قبلی باشد.
 *
 * جهش روی **خود متن** است، نه کارت: کارتی که می‌پرد، کل چیدمان را می‌لرزاند.
 *
 * `key` عمداً از روی مقدار ساخته می‌شود؛ همین باعث می‌شود React گره را عوض کند و
 * انیمیشن از نو اجرا شود. بدون آن، کلاس انیمیشن روی گره قبلی می‌ماند و دیگر هرگز
 * دوباره پخش نمی‌شود.
 */
export function AnimatedValue({
  value,
  className,
  title,
}: {
  value: string;
  className?: string;
  title?: string;
}): JSX.Element {
  const first = useRef(true);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // بار اول انیمیشن ندارد: ورود صفحه خودش انیمیشن دارد و دو حرکت هم‌زمان، شلوغ است.
    if (first.current) {
      first.current = false;
      return;
    }
    setAnimate(true);
  }, [value]);

  return (
    <span
      key={value}
      title={title}
      className={cn('inline-block', animate && 'animate-[var(--animate-bounce-in)]', className)}
    >
      {value}
    </span>
  );
}

/**
 * نوار باریک «در حال به‌روزرسانی» روی لبه بالای کارت.
 *
 * جایگزین shimmer است: shimmer یعنی «اینجا هنوز چیزی نیست»، در حالی که اینجا عدد
 * قبلی هست و فقط دارد تازه می‌شود. پوشاندن عدد موجود با اسکلت، اطلاعاتِ در دسترس را
 * از کاربر می‌گیرد.
 */
export function UpdatingBar({ active }: { active: boolean }): JSX.Element | null {
  if (!active) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-xl"
    >
      <span className="block h-full w-full bg-primary/70 animate-[var(--animate-progress)]" />
    </span>
  );
}

/**
 * پوششی که محتوای کهنه را کم‌رنگ می‌کند و وضعیت را به صفحه‌خوان هم می‌گوید.
 *
 * `aria-busy` چیزی است که بدون آن، کاربر صفحه‌خوان عدد قدیمی را به‌عنوان نتیجه
 * می‌خواند و نمی‌فهمد هنوز در راه است.
 */
export function Updating({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      aria-busy={active || undefined}
      className={cn(
        'transition-opacity duration-200',
        active ? 'opacity-55' : 'opacity-100',
        className,
      )}
    >
      {children}
    </div>
  );
}
