import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from './base-data.api';
import { usePageSize } from '../../shared/preferences/preferences';

/**
 * مدارس — اطلاعات پایهٔ فاکتور انشعابات.
 *
 * مدرسه برعکس فهرست‌های ساده یک **والد** دارد (ناحیه)، و همان ناحیه است که در فرم
 * انشعابات خودکار پر می‌شود؛ پس فهرست همیشه ناحیه را هم می‌آورد.
 */

export interface SchoolRow {
  readonly id: string;
  readonly districtId: string;
  readonly title: string;
  readonly code: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly district: { readonly id: string; readonly title: string; readonly isActive: boolean };
}

export interface SchoolInput {
  readonly districtId: string;
  readonly title: string;
  readonly code?: string;
  readonly isActive?: boolean;
  readonly sortOrder?: number;
}

export const schoolKeys = {
  all: ['base-data', 'schools'] as const,
  list: (page: number, search: string, districtId: string, isActive: string) =>
    ['base-data', 'schools', 'list', page, search, districtId, isActive] as const,
};

export function useSchools(page: number, search: string, districtId = '', isActive = '') {
  const pageSize = usePageSize();
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) query.set('search', search);
  if (districtId) query.set('districtId', districtId);
  if (isActive) query.set('isActive', isActive);

  return useQuery({
    queryKey: [...schoolKeys.list(page, search, districtId, isActive), pageSize],
    queryFn: () => apiFetch<PageResult<SchoolRow>>(`/base-data/schools?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateSchools(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: schoolKeys.all });
    // فرم انشعابات مدرسه‌ها را با جست‌وجوی سمت سرور می‌گیرد؛ همان کلید.
    void queryClient.invalidateQueries({ queryKey: ['schools'] });
  };
}

export function useCreateSchool() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (input: SchoolInput) =>
      apiFetch<SchoolRow>('/base-data/schools', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateSchool() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<SchoolInput> & { id: string }) =>
      apiFetch<SchoolRow>(`/base-data/schools/${id}`, { method: 'PATCH', json: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteSchool() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/base-data/schools/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
