import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';

/**
 * کارهای حسابِ خودِ کاربر.
 *
 * هیچ‌کدام شناسه نمی‌گیرند: دامنه‌شان همان نشست است و سرور هم از نشست می‌خواند.
 */

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ ok: true }>('/auth/password', { method: 'POST', json: input }),
  });
}

/** خروج از همهٔ دستگاه‌ها — نشستِ همین دستگاه را هم می‌بندد. */
export function useLogoutEverywhere() {
  return useMutation({
    mutationFn: () => apiFetch<{ revoked: number }>('/auth/logout-all', { method: 'POST' }),
  });
}
