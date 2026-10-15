import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';

export interface LookupItem {
  readonly id: string;
  readonly title: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly usageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export interface LookupResourceInfo {
  readonly key: string;
  readonly titleFa: string;
}

export interface LookupListParams {
  readonly resource: string;
  readonly page: number;
  readonly search: string;
  readonly isActive?: 'true' | 'false' | undefined;
  readonly sortBy?: string | undefined;
  readonly sortDir: 'asc' | 'desc';
}

export const baseDataKeys = {
  resources: ['base-data', 'resources'] as const,
  lookups: (params: LookupListParams) => ['base-data', 'lookups', params] as const,
  bootstrap: ['base-data', 'bootstrap'] as const,
  categories: ['base-data', 'categories'] as const,
};

export function useLookupResources() {
  return useQuery({
    queryKey: baseDataKeys.resources,
    queryFn: () => apiFetch<LookupResourceInfo[]>('/base-data/lookups/resources'),
    // فهرست منابع ثابت است و نیازی به بازخوانی مکرر ندارد.
    staleTime: 10 * 60_000,
  });
}

export function useLookupList(params: LookupListParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    sortDir: params.sortDir,
  });
  if (params.search) query.set('search', params.search);
  if (params.isActive) query.set('isActive', params.isActive);
  if (params.sortBy) query.set('sortBy', params.sortBy);

  return useQuery({
    queryKey: baseDataKeys.lookups(params),
    queryFn: () =>
      apiFetch<PageResult<LookupItem>>(`/base-data/lookups/${params.resource}?${query.toString()}`),
    enabled: params.resource !== '',
    // داده صفحه قبلی تا رسیدن صفحه جدید نمایش داده می‌شود تا جدول نپرد.
    placeholderData: (previous) => previous,
  });
}

function useInvalidateLookups() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['base-data', 'lookups'] });
}

export function useCreateLookup(resource: string) {
  const invalidate = useInvalidateLookups();
  return useMutation({
    mutationFn: (input: { title: string; sortOrder?: number }) =>
      apiFetch<LookupItem>(`/base-data/lookups/${resource}`, { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateLookup(resource: string) {
  const invalidate = useInvalidateLookups();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; title?: string; isActive?: boolean }) =>
      apiFetch<LookupItem>(`/base-data/lookups/${resource}/${id}`, {
        method: 'PATCH',
        json: input,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteLookup(resource: string) {
  const invalidate = useInvalidateLookups();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/base-data/lookups/${resource}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ─────────────── فصل‌ها و اتصال به انواع فاکتور ───────────────

export interface InvoiceTypeRef {
  readonly id: string;
  readonly key: string;
  readonly kind: 'NORMAL' | 'STAD' | 'UTILITY' | 'FUEL';
  readonly titleFa: string;
}

export interface ChapterRow {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly isActive: boolean;
  readonly invoiceTypes: ReadonlyArray<{ isDefault: boolean; invoiceType: InvoiceTypeRef }>;
}

export interface CategoryRow {
  readonly id: string;
  readonly key: 'CURRENT' | 'CAPITAL';
  readonly titleFa: string;
  readonly chapters: readonly ChapterRow[];
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: baseDataKeys.categories,
    queryFn: () => apiFetch<CategoryRow[]>('/base-data/chapters/categories'),
  });
}
