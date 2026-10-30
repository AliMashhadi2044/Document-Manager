import { useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  PAGE_SIZES,
  PASSWORD_POLICY_HINT,
  PRIMARY_COLORS,
  ROLE_LABELS,
  TABLE_DENSITIES,
  TABLE_DENSITY_LABELS,
  THEME_MODES,
  type RoleKey,
} from '@dm/shared';

import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Card, CardBody, CardHeader } from '../../shared/ui/card';
import { Input } from '../../shared/ui/input';
import { Segmented } from '../../shared/ui/segmented';
import { Badge } from '../../shared/ui/badge';
import { formatServerMessage } from '../../shared/format/money';
import { usePreferences } from '../../shared/preferences/preferences';
import {
  PRIMARY_COLOR_LABELS,
  PRIMARY_COLOR_SWATCHES,
  THEME_MODE_LABELS,
  useTheme,
} from '../../shared/theme/theme';
import { useChangePassword, useLogoutEverywhere } from './account.api';
import type { CurrentUser } from '../auth/auth.api';

/**
 * حساب من.
 *
 * سه کاری که تا پیش از این هیچ‌کدام از خودِ سامانه ممکن نبود: عوض کردن رمز،
 * بستن نشست‌های باز روی دستگاه‌های دیگر، و برگرداندن شخصی‌سازی به حالت اول.
 *
 * رمز، مهم‌ترینشان است: تا دیروز تنها راهش مدیر سامانه بود، یعنی رمز هر کاربر را
 * همیشه یک نفر دیگر هم می‌دانست.
 */
export function AccountPage({ user }: { user: CurrentUser }): JSX.Element {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={user.fullName}
          description={user.username}
          icon="users"
          action={
            <div className="flex flex-wrap gap-1.5">
              {user.roles.map((role) => (
                <Badge key={role} tone="neutral">
                  {ROLE_LABELS[role as RoleKey] ?? role}
                </Badge>
              ))}
            </div>
          }
        />
      </Card>

      <PasswordCard />
      <AppearanceCard />
      <SessionsCard />
    </div>
  );
}

function PasswordCard(): JSX.Element {
  const change = useChangePassword();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (next !== repeat) {
      setError('رمز تازه و تکرارش یکی نیستند.');
      return;
    }

    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setDone(true);
          setCurrent('');
          setNext('');
          setRepeat('');
        },
        onError: (caught) =>
          setError(
            caught instanceof ApiError
              ? formatServerMessage(caught.message)
              : 'تغییر رمز ناموفق بود',
          ),
      },
    );
  }

  return (
    <Card>
      <CardHeader
        title="تغییر رمز عبور"
        description="پس از تغییر، نشست‌های باز روی دستگاه‌های دیگر بسته می‌شوند."
        icon="settings"
      />
      <CardBody>
        <form className="max-w-sm space-y-4" onSubmit={submit}>
          <Input
            label="رمز عبور فعلی"
            required
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
          <Input
            label="رمز عبور تازه"
            required
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            hint={PASSWORD_POLICY_HINT}
          />
          <Input
            label="تکرار رمز تازه"
            required
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />

          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {done ? (
            <p role="status" className="text-xs text-success">
              رمز عبور عوض شد. روی این دستگاه وارد می‌مانید.
            </p>
          ) : null}

          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? 'در حال ذخیره…' : 'تغییر رمز'}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

/**
 * ظاهر، و بازنشانی شخصی‌سازی.
 *
 * همان تنظیماتِ منوی سربرگ است، ولی اینجا کنار چیزی می‌نشیند که فقط همین‌جا
 * هست: بازنشانی — که پین‌ها و ترتیب‌های جمع‌شده در فهرست‌ها را هم پاک می‌کند و
 * راهِ بیرون آمدن از چیدمانی است که کاربر دیگر نمی‌خواهد.
 */
function AppearanceCard(): JSX.Element {
  const { mode, primary, setMode, setPrimary } = useTheme();
  const { prefs, update } = usePreferences();
  const [reset, setReset] = useState(false);

  const pinnedCount = Object.values(prefs.select).reduce(
    (total, item) => total + item.pinned.length,
    0,
  );
  const hiddenCount = Object.values(prefs.hiddenColumns).reduce(
    (total, item) => total + item.length,
    0,
  );

  return (
    <Card>
      <CardHeader
        title="ظاهر و شخصی‌سازی"
        description="روی هر دستگاهی که وارد شوید، همین تنظیمات را می‌بینید."
        icon="palette"
      />
      <CardBody className="space-y-5">
        <Segmented
          label="تم"
          name="account-theme"
          value={mode}
          onChange={(value) => setMode(value as typeof mode)}
          options={THEME_MODES.map((item) => ({ value: item, label: THEME_MODE_LABELS[item] }))}
        />

        <fieldset>
          <legend className="mb-2 text-xs font-medium">رنگ اصلی</legend>
          <div className="flex flex-wrap gap-2">
            {PRIMARY_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPrimary(item)}
                aria-label={PRIMARY_COLOR_LABELS[item]}
                aria-pressed={primary === item}
                title={PRIMARY_COLOR_LABELS[item]}
                className={`size-7 rounded-full ring-offset-2 ring-offset-card transition ${
                  primary === item ? 'ring-2 ring-foreground' : 'ring-1 ring-border'
                }`}
                style={{ background: PRIMARY_COLOR_SWATCHES[item] }}
              />
            ))}
          </div>
        </fieldset>

        <Segmented
          label="فشردگی جدول‌ها"
          name="account-density"
          value={prefs.density}
          onChange={(value) =>
            update((previous) => ({
              ...previous,
              density: value as (typeof TABLE_DENSITIES)[number],
            }))
          }
          options={TABLE_DENSITIES.map((item) => ({
            value: item,
            label: TABLE_DENSITY_LABELS[item],
          }))}
        />

        <Segmented
          label="تعداد ردیف در هر صفحه"
          name="account-page-size"
          value={String(prefs.pageSize)}
          onChange={(value) => update((previous) => ({ ...previous, pageSize: Number(value) }))}
          options={PAGE_SIZES.map((item) => ({
            value: String(item),
            label: item.toLocaleString('fa-IR'),
          }))}
        />

        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {hiddenCount > 0
              ? `${hiddenCount.toLocaleString('fa-IR')} ستون در جدول‌ها پنهان شده است.`
              : 'هیچ ستونی در جدول‌ها پنهان نشده است.'}
          </p>
          <p className="text-xs text-muted-foreground">
            {pinnedCount > 0
              ? `${pinnedCount} گزینه در فهرست‌های انتخاب پین شده است.`
              : 'هیچ گزینه‌ای در فهرست‌های انتخاب پین نشده است.'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              update(() => DEFAULT_PREFERENCES);
              setReset(true);
            }}
          >
            بازنشانی همهٔ شخصی‌سازی‌ها
          </Button>
          {reset ? (
            <p role="status" className="mt-2 text-xs text-success">
              همه چیز به حالت اول برگشت.
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function SessionsCard(): JSX.Element {
  const logoutAll = useLogoutEverywhere();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <CardHeader
        title="دستگاه‌های دیگر"
        description="اگر روی رایانه‌ای وارد مانده‌اید و دسترسی ندارید، از اینجا همه را ببندید."
        icon="logout"
      />
      <CardBody>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">
              همهٔ نشست‌ها بسته می‌شوند و از همین دستگاه هم بیرون می‌آیید. ادامه؟
            </p>
            <Button
              variant="destructive"
              size="sm"
              disabled={logoutAll.isPending}
              onClick={() =>
                logoutAll.mutate(undefined, {
                  // سرور کوکی را هم پاک کرده است؛ بارگذاری دوباره، حافظهٔ برنامه را
                  // هم خالی می‌کند تا چیزی از کاربر قبلی نماند.
                  onSuccess: () => window.location.assign('/'),
                })
              }
            >
              خروج از همهٔ دستگاه‌ها
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              انصراف
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
            خروج از همهٔ دستگاه‌ها
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
