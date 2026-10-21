import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

/**
 * مجموعه‌های خریدار (§۸.۳).
 *
 * داده این رکوردها در لحظه ایجاد سند **snapshot** می‌شود، پس ویرایش اینجا فقط روی
 * اسناد تازه اثر دارد و اسناد گذشته دست‌نخورده می‌مانند.
 */

export interface BuyerRow {
  readonly id: string;
  readonly personType: 'NATURAL' | 'LEGAL';
  readonly name: string;
  readonly economicCode: string | null;
  readonly registrationNumber: string | null;
  readonly nationalId: string | null;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly phone: string | null;
  readonly fax: string | null;
  readonly isActive: boolean;
  readonly isDefault: boolean;
  readonly sortOrder: number;
  /** تعداد اسنادی که به این مجموعه وصل‌اند — مبنای اینکه حذف ممکن است یا نه. */
  readonly documentCount: number;
}

export interface BuyerInput {
  readonly personType: 'NATURAL' | 'LEGAL';
  readonly name: string;
  readonly economicCode?: string;
  readonly registrationNumber?: string;
  readonly nationalId?: string;
  readonly addressLine?: string;
  readonly postalCode?: string;
  readonly phone?: string;
  readonly fax?: string;
  readonly isActive?: boolean;
  readonly isDefault?: boolean;
  readonly sortOrder?: number;
}

export const buyerKeys = {
  all: ['buyers'] as const,
  list: (page: number, search: string, isActive: string) =>
    ['buyers', 'list', page, search, isActive] as const,
  options: ['buyers', 'options'] as const,
};

export function useBuyers(page: number, search: string, isActive: string) {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('search', search);
  if (isActive) query.set('isActive', isActive);

  return useQuery({
    queryKey: buyerKeys.list(page, search, isActive),
    queryFn: () => apiFetch<PageResult<BuyerRow>>(`/buyers?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateBuyers(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
  };
}

export function useCreateBuyer() {
  const invalidate = useInvalidateBuyers();
  return useMutation({
    mutationFn: (input: BuyerInput) =>
      apiFetch<BuyerRow>('/buyers', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateBuyer() {
  const invalidate = useInvalidateBuyers();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<BuyerInput> & { id: string }) =>
      apiFetch<BuyerRow>(`/buyers/${id}`, { method: 'PATCH', json: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteBuyer() {
  const invalidate = useInvalidateBuyers();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/buyers/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/**
 * گزینه‌های فرم ایجاد سند — فقط مجموعه‌های فعال.
 *
 * همان کلیدی که صفحه مدیریت باطل می‌کند، تا پس از ساختن یا پیش‌فرض کردن یک مجموعه،
 * فرم سند بدون بارگذاری دوباره صفحه به‌روز شود.
 */
export function useActiveBuyers() {
  return useQuery({
    queryKey: buyerKeys.options,
    queryFn: () => apiFetch<PageResult<BuyerRow>>('/buyers?isActive=true&pageSize=100'),
  });
}
