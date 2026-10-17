import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { ThemeProvider } from '../shared/theme/theme';
import { ErrorState } from '../shared/ui/states';
import { DefaultMark } from '../features/organization/organization-mark';
import { useCurrentUser } from '../features/auth/auth.api';
import { LoginPage } from '../features/auth/login-page';
import { AppShell } from './app-shell';

function Shell(): JSX.Element {
  const { data: user, isPending, isError, refetch } = useCurrentUser();

  if (isPending) return <SplashScreen />;

  if (isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-md">
          <ErrorState
            title="ارتباط با سرور برقرار نشد"
            message="از اجرا بودن سرویس مطمئن شوید و دوباره تلاش کنید."
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    );
  }

  return user ? <AppShell user={user} /> : <LoginPage />;
}

/**
 * صفحه آغازین، تا وقتی وضعیت نشست معلوم شود.
 *
 * یک چرخنده خالی وسط صفحه، در لحظه‌ای که کاربر هنوز نمی‌داند وارد سامانه شده یا نه،
 * حس «چیزی خراب است» می‌دهد. نشان و نام سامانه با یک حلقه در حال پیشروی، همان
 * انتظار را به یک لحظه عادی تبدیل می‌کند.
 *
 * `role="status"` و متن پنهان، همین را برای صفحه‌خوان هم می‌گویند.
 */
function SplashScreen(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background"
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute -inset-3 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
          style={{ animationDuration: '1.1s' }}
        />
        <DefaultMark size={56} className="animate-[var(--animate-fade-in)]" />
      </div>

      <div className="text-center">
        <p className="text-sm font-bold">سامانه مدیریت اسناد کارپردازی</p>
        <p className="mt-1 text-xs text-muted-foreground">در حال بررسی نشست…</p>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // داده‌های سازمانی با نرخ پایین تغییر می‌کنند؛ بازخوانی بی‌مورد هزینه است.
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
