import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';

export interface OrphanObject {
  readonly key: string;
  readonly sizeBytes: string;
  readonly lastModified: string;
}

export interface StaleRecord {
  readonly id: string;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly sizeBytes: string;
  readonly createdAt: string;
}

export interface OrphanScan {
  readonly objects: readonly OrphanObject[];
  readonly staleRecords: readonly StaleRecord[];
  /** چند شیء در این دور پیمایش شد — نه چند یتیم پیدا شد. */
  readonly scanned: number;
  readonly truncated: boolean;
  readonly graceHours: number;
}

export interface PurgeResult {
  readonly removedObjects: number;
  readonly removedRecords: number;
  readonly skipped: readonly string[];
}

const scanKey = ['storage', 'orphans'] as const;

/**
 * پیمایش ذخیره‌سازی، **فقط به درخواست کاربر**.
 *
 * `staleTime: Infinity` و بدون refetch خودکار: هر بار این کوئری اجرا شود، سرور کل
 * bucket را فهرست می‌کند. چنین کاری نباید با عوض شدن تب مرورگر یا برگشتن فوکوس
 * دوباره راه بیفتد.
 */
export function useOrphanScan(enabled: boolean) {
  return useQuery({
    queryKey: scanKey,
    queryFn: () => apiFetch<OrphanScan>('/files/storage/orphans'),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function usePurgeOrphans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { keys: readonly string[]; recordIds: readonly string[] }) =>
      apiFetch<PurgeResult>('/files/storage/orphans/purge', {
        method: 'POST',
        json: { keys: input.keys, recordIds: input.recordIds },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scanKey });
    },
  });
}
