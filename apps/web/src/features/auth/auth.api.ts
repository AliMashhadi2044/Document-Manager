import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@dm/shared';

import { apiFetch, ApiError } from '../../shared/api/client';

export interface CurrentUser {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly roles: readonly string[];
  readonly permissions: readonly Permission[];
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
      // پاک کردن کامل کش: هیچ داده‌ای از کاربر قبلی نباید باقی بماند.
      queryClient.clear();
    },
  });
}

export function hasPermission(
  user: CurrentUser | null | undefined,
  permission: Permission,
): boolean {
  return user?.permissions.includes(permission) ?? false;
}
