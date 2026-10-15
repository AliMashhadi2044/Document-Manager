import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { ThemeProvider } from '../shared/theme/theme';
import { LoadingState, ErrorState } from '../shared/ui/states';
import { useCurrentUser } from '../features/auth/auth.api';
import { LoginPage } from '../features/auth/login-page';
import { DashboardPlaceholder } from './dashboard-placeholder';

function Shell(): JSX.Element {
  const { data: user, isPending, isError, refetch } = useCurrentUser();

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingState label="در حال بررسی نشست…" />
      </div>
    );
  }

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

  return user ? <DashboardPlaceholder user={user} /> : <LoginPage />;
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
