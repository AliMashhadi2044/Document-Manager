import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '../../shared/ui/button';
import { lastServerContactAt } from '../../shared/api/client';
import { authKeys } from '../auth/auth.api';

/**
 * هشدار پیش از پایان نشست.
 *
 * نشست با **بی‌تحرکی** تمام می‌شود؛ تا پیش از این کسی که وسط فرم فاکتور بود، بی‌هیچ
 * نشانه‌ای بیرون می‌افتاد و کارِ نیمه‌تمامش را از دست می‌داد.
 *
 * مبنای شمارش، آخرین پاسخِ گرفته‌شده از سرور است — نه حرکت ماوس. دلیلش این است که
 * سرور هم دقیقاً همین را «تحرک» می‌شمارد؛ شمردنِ حرکت ماوس، هشداری می‌داد که با
 * واقعیتِ سمت سرور نمی‌خواند.
 *
 * «ادامهٔ کار» یک درخواست واقعی می‌فرستد، چون تنها چیزی که نشست را زنده می‌کند
 * همان است.
 */

const WARN_BEFORE_MS = 3 * 60_000;
const TICK_MS = 15_000;

export function SessionWarning({ idleMinutes }: { idleMinutes: number }): JSX.Element | null {
  const queryClient = useQueryClient();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const idleMs = idleMinutes * 60_000;

    const tick = (): void => {
      const left = idleMs - (Date.now() - lastServerContactAt());
      setRemainingMs(left <= WARN_BEFORE_MS ? Math.max(left, 0) : null);
    };

    tick();
    const timer = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(timer);
  }, [idleMinutes]);

  if (remainingMs === null) return null;

  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return (
    <div
      role="alertdialog"
      aria-labelledby="session-warning-title"
      className="fixed bottom-4 start-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-warning/40 bg-card p-4 shadow-[var(--shadow-lift)]"
    >
      <p id="session-warning-title" className="text-sm font-semibold">
        نشست شما رو به پایان است
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {`تا حدود ${minutes} دقیقهٔ دیگر به‌خاطر بی‌تحرکی از سامانه خارج می‌شوید. کار نیمه‌تمام را ذخیره کنید یا نشست را ادامه دهید.`}
      </p>
      <Button
        size="sm"
        className="mt-3"
        onClick={() => {
          // بازخوانی `me` هم نشست را تمدید می‌کند و هم وضعیت واقعی را می‌آورد:
          // اگر نشست همین حالا تمام شده باشد، ۴۰۱ ما را به صفحهٔ ورود می‌برد.
          void queryClient.refetchQueries({ queryKey: authKeys.me });
          setRemainingMs(null);
        }}
      >
        ادامهٔ کار
      </Button>
    </div>
  );
}
