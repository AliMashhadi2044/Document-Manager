import {
  PRIMARY_COLORS,
  PRIMARY_COLOR_LABELS,
  THEME_MODES,
  THEME_MODE_LABELS,
  useTheme,
} from '../shared/theme/theme';
import { Button } from '../shared/ui/button';
import { useLogout, type CurrentUser } from '../features/auth/auth.api';
import { ROLE_LABELS, type RoleKey } from '@dm/shared';

/**
 * صفحه موقت پس از ورود — فاز ۱.
 *
 * عمداً به‌صورت «زیرساخت تأییدشده» برچسب خورده و وانمود نمی‌کند داشبورد واقعی است.
 * داشبورد و ماژول‌های دامنه در فازهای بعدی ساخته می‌شوند (الزام §۳۶: هیچ صفحه‌ای با
 * داده ساختگی به‌عنوان قابلیت تکمیل‌شده معرفی نشود).
 */
export function DashboardPlaceholder({ user }: { user: CurrentUser }): JSX.Element {
  const { mode, setMode, primary, setPrimary, resolved } = useTheme();
  const logout = useLogout();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-base font-bold">سامانه مدیریت اسناد کارپردازی</h1>
            <p className="text-xs text-muted-foreground">
              {user.fullName} ·{' '}
              {user.roles.map((role) => ROLE_LABELS[role as RoleKey] ?? role).join('، ')}
            </p>
          </div>
          <Button variant="secondary" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>
            خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">وضعیت پروژه</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            فاز ۱ (زیرساخت و سیستم طراحی) تکمیل شده است. ماژول‌های اطلاعات پایه، اسناد و
            فاکتورها در فازهای بعدی اضافه می‌شوند. این صفحه موقت است و داده واقعی نمایش نمی‌دهد.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">تنظیمات ظاهر</h2>

          <div className="mt-4 space-y-4">
            <Field label="تم">
              {THEME_MODES.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={mode === item ? 'primary' : 'secondary'}
                  onClick={() => setMode(item)}
                  aria-pressed={mode === item}
                >
                  {THEME_MODE_LABELS[item]}
                </Button>
              ))}
              <span className="text-xs text-muted-foreground">
                (تم مؤثر: {resolved === 'dark' ? 'تاریک' : 'روشن'})
              </span>
            </Field>

            <Field label="رنگ اصلی">
              {PRIMARY_COLORS.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={primary === item ? 'primary' : 'secondary'}
                  onClick={() => setPrimary(item)}
                  aria-pressed={primary === item}
                >
                  {PRIMARY_COLOR_LABELS[item]}
                </Button>
              ))}
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">مجوزهای شما ({user.permissions.length})</h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {user.permissions.map((permission) => (
              <li
                key={permission}
                className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                dir="ltr"
              >
                {permission}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
