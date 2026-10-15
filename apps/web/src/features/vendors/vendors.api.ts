import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

export interface VendorRow {
  readonly id: string;
  readonly personType: 'NATURAL' | 'LEGAL';
  readonly name: string;
  readonly representativeName: string | null;
  readonly economicCode: string | null;
  readonly nationalId: string | null;
  readonly addressLine: string | null;
  readonly phone: string | null;
  readonly isActive: boolean;
  readonly bankAccountCount: number;
}

export interface IbanCheckResult {
  readonly valid: boolean;
  readonly normalized?: string;
  readonly formatted?: string;
  readonly bankTitle?: string | null;
  readonly message?: string | null;
  readonly notice?: string;
}

export const vendorKeys = {
  list: (page: number, search: string) => ['vendors', 'list', page, search] as const,
};

export function useVendors(page: number, search: string) {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('search', search);

  return useQuery({
    queryKey: vendorKeys.list(page, search),
    queryFn: () => apiFetch<PageResult<VendorRow>>(`/vendors?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      personType: 'NATURAL' | 'LEGAL';
      name: string;
      representativeName?: string;
      economicCode?: string;
      nationalId?: string;
      addressLine?: string;
      phone?: string;
    }) => apiFetch<VendorRow>('/vendors', { method: 'POST', json: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

/** بررسی شبا بدون ذخیره — برای بازخورد لحظه‌ای در فرم. */
export function useValidateIban() {
  return useMutation({
    mutationFn: (iban: string) =>
      apiFetch<IbanCheckResult>('/vendors/validate-iban', { method: 'POST', json: { iban } }),
  });
}
