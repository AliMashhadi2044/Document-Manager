import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

export type NotificationKind =
  | 'DOCUMENT_SENT_TO_ARCHIVE'
  | 'DOCUMENT_ARCHIVED'
  | 'DOCUMENT_NEEDS_REVISION'
  | 'FEEDBACK_CREATED'
  | 'FEEDBACK_REPLIED'
  | 'FEEDBACK_RESOLVED';

export interface NotificationRow {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string | null;
  readonly documentId: string | null;
  readonly feedbackId: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
  readonly document: { readonly id: string; readonly title: string } | null;
}

export const notificationKeys = {
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: () =>
      apiFetch<PageResult<NotificationRow> & { unread: number }>('/notifications?pageSize=20'),
  });
}

/**
 * شمارنده خوانده‌نشده‌ها.
 *
 * بازخوانی دوره‌ای **یک دقیقه** است و نه چند ثانیه: اعلان اینجا هیچ‌وقت فوری نیست و
 * هر بازخوانی یک کوئری روی پایگاه داده است. برای هر کاربر فعال، پنج ثانیه یعنی
 * دوازده برابر همان بار، بی‌آنکه کسی زودتر کارش راه بیفتد.
 */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => apiFetch<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => invalidate(queryClient),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
