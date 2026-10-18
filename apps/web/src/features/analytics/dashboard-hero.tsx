import { formatJalali, isoDateToJalali, jalaliMonthName } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Icon } from '../../shared/ui/icon';
import { toPersianDigits } from '../../shared/format/money';
import type { CurrentUser } from '../auth/auth.api';

/**
 * نوار خوشامد داشبورد.
 *
 * سه چیز را با هم می‌دهد: کاربر می‌فهمد با چه حسابی وارد شده، تاریخ امروز را
 * می‌بیند (در سامانه‌ای که همه تاریخ‌هایش شمسی است، این بیش از یک تزئین است)، و
 * دو کار پرتکرارش یک کلیک دورترند.
 *
 * سلام بر اساس **ساعت محلی مرورگر** است، نه ساعت سرور: اینجا یک متن خوشامد است،
 * نه داده‌ای که تصمیمی بر پایه‌اش گرفته شود.
 */
export function DashboardHero({
  user,
  onCreateDocument,
  onOpenReports,
}: {
  user: CurrentUser;
  onCreateDocument?: (() => void) | undefined;
  onOpenReports?: (() => void) | undefined;
}): JSX.Element {
  const today = isoDateToJalali(new Date().toISOString().slice(0, 10));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صبح به خیر' : hour < 17 ? 'وقت به خیر' : 'عصر به خیر';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
      {/* لایه رنگی پس‌زمینه — با رنگ اصلی تم عوض می‌شود. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_88%_-20%,hsl(var(--primary)/0.22),transparent_45%),radial-gradient(circle_at_60%_120%,hsl(var(--accent)/0.16),transparent_40%)]"
      />
      <HeroPattern />

      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {greeting}، {user.fullName}
          </p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl">
            {toPersianDigits(String(today.day))} {jalaliMonthName(today.month)}{' '}
            {toPersianDigits(String(today.year))}
          </h2>
          <p className="mt-1.5 max-w-prose text-xs leading-6 text-muted-foreground">
            همه اعداد این صفحه در دامنه دسترسی شما و با کوئری تجمیعی سرور حساب شده‌اند —
            هیچ عددی در مرورگر ساخته نمی‌شود.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {onCreateDocument ? (
            <Button onClick={onCreateDocument}>
              <Icon name="plus" />
              سند تازه
            </Button>
          ) : null}
          {onOpenReports ? (
            <Button variant="secondary" onClick={onOpenReports}>
              <Icon name="chart" />
              گزارش‌گیری
            </Button>
          ) : null}
        </div>
      </div>

      <span className="sr-only">تاریخ امروز: {formatJalali(today)}</span>
    </section>
  );
}

/** نقش پس‌زمینه: خطوط نرم، کم‌رنگ و بدون معنا — فقط برای شکستن یکنواختی سطح. */
function HeroPattern(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 160"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-y-0 start-0 h-full w-1/2 text-primary/10"
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <path
          key={index}
          d={`M-20 ${30 + index * 26} C 80 ${10 + index * 26}, 160 ${70 + index * 20}, 420 ${20 + index * 24}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
