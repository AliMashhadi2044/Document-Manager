import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Permission } from '@dm/shared';

import { apiFetch, ApiError, onUnauthorized } from '../../shared/api/client';
import { clearPreferencesCache } from '../../shared/preferences/preferences';

export interface CurrentUser {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly roles: readonly string[];
  readonly permissions: readonly Permission[];
  /** مهلت بی‌تحرکی نشست (دقیقه) — برای هشدار پیش از پایان نشست. */
  readonly sessionIdleMinutes: number;
}

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/**
 * کاربر جاری.
 * پاسخ ۴۰۱ یعنی «وارد نشده»، که یک حالت عادی است نه خطا — پس retry نمی‌شود.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<CurrentUser | null> => {
      try {
        return await apiFetch<CurrentUser>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.isUnauthorized) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * پایان نشست را همان لحظه می‌بیند.
 *
 * `useCurrentUser` تا ۶۰ ثانیه کهنه نمی‌شود و با فوکوس پنجره هم بازخوانی نمی‌شود؛
 * پس بدون این، کاربری که نشستش منقضی شده در برنامه می‌ماند و هر کارش خطا می‌دهد.
 * خروجی `true` یعنی «نشست تمام شد»، تا صفحهٔ ورود بتواند دلیلش را بگوید — وگرنه
 * کاربر فکر می‌کند سامانه او را بی‌دلیل بیرون انداخته.
 */
export function useSessionExpiry(): boolean {
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);

  useEffect(
    () =>
      onUnauthorized(() => {
        // کش کامل پاک می‌شود: دادهٔ کاربرِ قبلی نباید پشت صفحهٔ ورود بماند.
        setExpired(true);
        queryClient.setQueryData(authKeys.me, null);
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      }),
    [queryClient],
  );

  return expired;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      apiFetch<{ ok: true }>('/auth/login', { method: 'POST', json: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      // پاک کردن کامل کش و سپس بارگذاری دوباره صفحه.
      //
      // چرا بارگذاری دوباره و نه فقط پاک کردن کش: `clear()` کوئری‌ها را حذف می‌کند
      // ولی ناظرهای فعال همان لحظه را خبر نمی‌کند؛ آن‌ها به کوئری حذف‌شده چسبیده
      // می‌مانند و آخرین مقدارشان را نگه می‌دارند. نتیجه در عمل این بود که پس از
      // خروج، پوسته برنامه با نام کاربر قبلی روی صفحه می‌ماند و فقط درخواست‌هایش
      // ۴۰۱ می‌گرفتند — ظاهری که کاربر آن را «هنوز واردم» می‌خواند. نوشتن مقدار
      // null هم همین مشکل را داشت.
      //
      // بارگذاری دوباره تضمین می‌کند هیچ داده‌ای از کاربر قبلی — نه در کش، نه در
      // state کامپوننت‌ها و نه در blob فایل‌های باز شده — در حافظه نمی‌ماند.
      queryClient.clear();
      // و نسخهٔ موقت ترجیح‌ها: روی دستگاه مشترک، تم و رنگ نفر قبل نباید به کاربر
      // بعدی برسد.
      clearPreferencesCache();
      window.location.assign('/');
    },
  });
}

export function hasPermission(
  user: CurrentUser | null | undefined,
  permission: Permission,
): boolean {
  return user?.permissions.includes(permission) ?? false;
}
