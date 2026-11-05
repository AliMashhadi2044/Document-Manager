import { useCallback, type FocusEvent } from 'react';

import { usePreferences } from '../preferences/preferences';

/**
 * آوردنِ فیلدِ فوکوس‌شده به ناحیهٔ امن صفحه.
 *
 * فرم فاکتور ردیف‌های بلند دارد و نوار جمعش **چسبان** است؛ کاربری که با Tab جلو
 * می‌رفت، مرتب به فیلدی می‌رسید که زیر همان نوار یا درست روی لبهٔ صفحه بود و
 * باید دستش را از صفحه‌کلید برمی‌داشت تا اسکرول کند.
 *
 * دو قاعده که این را از یک `scrollIntoView` ساده جدا می‌کند:
 *
 *  ۱. **فقط وقتی لازم است.** فیلدی که همین حالا جای خوبی دارد تکان نمی‌خورد؛
 *     پریدنِ صفحه در هر Tab، خودش آزاردهنده است.
 *  ۲. **فاصله از بالا، ترجیح کاربر است.** صفر یعنی خاموش، برای کسی که اصلاً
 *     نمی‌خواهد صفحه زیر دستش حرکت کند.
 *
 * فوکوسی که از **کلیک** آمده نادیده گرفته می‌شود: کاربر خودش جای فیلد را دیده و
 * انتخابش کرده؛ جابه‌جا کردنِ صفحه زیر مکان‌نمای او، همان چیزی است که کلیک بعدی
 * را به جای اشتباه می‌برد.
 */

/** فاصلهٔ امن از پایین صفحه — جایی که نوار جمعِ چسبان می‌نشیند. */
const BOTTOM_SAFE_PX = 160;

const FIELD_SELECTOR = 'input, textarea, select, [role="combobox"], [contenteditable="true"]';

export function useFocusScroll(): (event: FocusEvent<HTMLElement>) => void {
  const { prefs } = usePreferences();
  const offset = prefs.focusScrollOffset;

  return useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (offset === 0) return;

      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(FIELD_SELECTOR)) return;
      if (!target.matches(':focus-visible')) return;

      /*
        لایه‌های شناور کنار گذاشته می‌شوند.

        فهرست بازشدهٔ `Select` و پنجره‌ها در `portal` رندر می‌شوند: از نظر React
        فرزند همین فرم‌اند (پس رویدادشان به اینجا می‌رسد) ولی در DOM بیرونند و
        جایشان نسبت به دکمهٔ باز‌کننده حساب می‌شود. اسکرول کردن زیر آن‌ها یعنی
        پنل همان لحظه جابه‌جا می‌شود و کلیک بعدی به جای دیگری می‌خورد — همین در
        آزمون E2E به‌شکل «element is not stable» دیده شد.
      */
      if (!event.currentTarget.contains(target)) return;

      const rect = target.getBoundingClientRect();
      const tooHigh = rect.top < offset;
      const tooLow = rect.bottom > window.innerHeight - BOTTOM_SAFE_PX;
      if (!tooHigh && !tooLow) return;

      /*
        بدون انیمیشن.

        در پیمایش سریع با Tab، چند اسکرول نرمِ هم‌پوشان، صفحه را تا چند لحظه در
        حال حرکت نگه می‌دارد؛ کاربر روی هدفی کلیک می‌کند که دیگر آنجا نیست.
      */
      window.scrollBy({ top: rect.top - offset, behavior: 'auto' });
    },
    [offset],
  );
}
