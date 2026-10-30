import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission, RoleKey } from '@dm/shared';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

/**
 * مدیریت کاربران.
 *
 * رمز عبور **فقط به بالا** می‌رود: هیچ‌کدام از این نوع‌ها فیلد رمز ندارند، چون هیچ
 * مسیری رمز را برنمی‌گرداند. فهرست کاربران هم کش می‌شود ولی هر تغییر، کاربر جاری
 * را هم بی‌اعتبار می‌کند — عوض شدن نقش‌ها می‌تواند دسترسی خودِ بیننده را عوض کند.
 */

export interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly fullName: string;
  readonly isActive: boolean;
  readonly lastLoginAt: string | null;
  readonly lockedUntil: string | null;
  readonly isLocked: boolean;
  readonly failedLoginCount: number;
  readonly createdAt: string;
  readonly roles: readonly RoleKey[];
}

export interface RoleRow {
  readonly key: RoleKey;
  readonly titleFa: string;
  readonly isSystem: boolean;
  readonly userCount: number;
  readonly permissions: readonly Permission[];
}

export interface CreateUserInput {
  readonly username: string;
  readonly fullName: string;
  readonly password: string;
  readonly roles: readonly RoleKey[];
  readonly isActive: boolean;
}

export interface UpdateUserInput {
  readonly fullName?: string;
  readonly isActive?: boolean;
  readonly roles?: readonly RoleKey[];
}

const keys = {
  all: ['users'] as const,
  roles: ['users', 'roles'] as const,
};

function useInvalidate(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.all });
    // دسترسی خودِ بیننده می‌تواند عوض شده باشد؛ منو و دکمه‌ها باید تازه شوند.
    void client.invalidateQueries({ queryKey: ['auth', 'me'] });
  };
}

export function useUsersList(page: number, search: string, isActive: string) {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('search', search);
  if (isActive) query.set('isActive', isActive);

  return useQuery({
    queryKey: [...keys.all, 'list', page, search, isActive],
    queryFn: () => apiFetch<PageResult<UserRow>>(`/users?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: keys.roles,
    queryFn: () => apiFetch<readonly RoleRow[]>('/users/roles'),
  });
}

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch<UserRow>('/users', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: string }) =>
      apiFetch<UserRow>(`/users/${id}`, { method: 'PATCH', json: input }),
    onSuccess: invalidate,
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiFetch<{ revoked: number }>(`/users/${id}/password`, {
        method: 'POST',
        json: { password },
      }),
  });
}

export function useUnlockUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiFetch<UserRow>(`/users/${id}/unlock`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useRevokeSessions() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ revoked: number }>(`/users/${id}/revoke-sessions`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useSetRolePermissions() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ key, permissions }: { key: RoleKey; permissions: readonly Permission[] }) =>
      apiFetch<RoleRow>(`/users/roles/${key}/permissions`, {
        method: 'PUT',
        json: { permissions },
      }),
    onSuccess: invalidate,
  });
}
