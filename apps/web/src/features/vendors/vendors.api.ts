import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

/**
 * فروشندگان و شباهای آن‌ها (§۱۱).
 *
 * داده فروشنده در لحظه ثبت فاکتور snapshot می‌شود، پس اصلاح اینجا فقط بر فاکتورهای
 * تازه اثر دارد. شبا هم جدا نگهداری می‌شود چون یک فروشنده می‌تواند چند حساب داشته
 * باشد و فاکتور باید بگوید پول به **کدام** حساب رفته است.
 */

export interface VendorRow {
  readonly id: string;
  readonly personType: 'NATURAL' | 'LEGAL';
  readonly name: string;
  readonly representativeName: string | null;
  readonly economicCode: string | null;
  readonly registrationNumber: string | null;
  readonly nationalId: string | null;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly phone: string | null;
  readonly fax: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly bankAccountCount: number;
}

export interface VendorInput {
  readonly personType: 'NATURAL' | 'LEGAL';
  readonly name: string;
  readonly representativeName?: string;
  readonly economicCode?: string;
  readonly registrationNumber?: string;
  readonly nationalId?: string;
  readonly addressLine?: string;
  readonly postalCode?: string;
  readonly phone?: string;
  readonly fax?: string;
  readonly notes?: string;
  readonly isActive?: boolean;
}

export interface VendorBankAccount {
  readonly id: string;
  readonly iban: string;
  readonly bankCode: string | null;
  /** عنوان بانک از جدول بانک‌ها، بر اساس پیشوند شبا — نه ورودی کاربر. */
  readonly bankTitle: string | null;
  readonly accountTitle: string | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly notes: string | null;
}

export interface VendorDetail extends Omit<VendorRow, 'bankAccountCount'> {
  readonly bankAccounts: readonly VendorBankAccount[];
}

export interface BankAccountInput {
  readonly iban: string;
  readonly accountTitle?: string;
  readonly isDefault?: boolean;
  readonly isActive?: boolean;
  readonly notes?: string;
}

export const vendorKeys = {
  all: ['vendors'] as const,
  list: (page: number, search: string, isActive: string) =>
    ['vendors', 'list', page, search, isActive] as const,
  /** همان کلیدی که فرم فاکتور برای شباهای فروشنده می‌خواند. */
  detail: (id: string) => ['vendors', 'detail', id] as const,
};

export function useVendors(page: number, search: string, isActive = '') {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('search', search);
  if (isActive) query.set('isActive', isActive);

  return useQuery({
    queryKey: vendorKeys.list(page, search, isActive),
    queryFn: () => apiFetch<PageResult<VendorRow>>(`/vendors?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useVendorDetail(id: string | null) {
  return useQuery({
    queryKey: vendorKeys.detail(id ?? ''),
    queryFn: () => apiFetch<VendorDetail>(`/vendors/${id as string}`),
    enabled: id !== null,
  });
}

function useInvalidateVendors(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: vendorKeys.all });
  };
}

export function useCreateVendor() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: (input: VendorInput) =>
      apiFetch<VendorRow>('/vendors', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateVendor() {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<VendorInput> & { id: string }) =>
      apiFetch<VendorRow>(`/vendors/${id}`, { method: 'PATCH', json: input }),
    onSuccess: invalidate,
  });
}

export function useAddBankAccount(vendorId: string) {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: (input: BankAccountInput) =>
      apiFetch<VendorBankAccount>(`/vendors/${vendorId}/bank-accounts`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: invalidate,
  });
}

/**
 * اصلاح شبا — بدون خود شبا.
 *
 * شماره شبا پس از ثبت تغییر نمی‌کند: فاکتورهای گذشته به همین ردیف ارجاع می‌دهند و
 * جابه‌جایی شماره، تاریخچه پرداخت را بی‌صدا عوض می‌کرد. حساب اشتباه را غیرفعال
 * می‌کنیم و شبای درست را به‌عنوان رکورد تازه می‌افزاییم.
 */
export function useUpdateBankAccount(vendorId: string) {
  const invalidate = useInvalidateVendors();
  return useMutation({
    mutationFn: ({ id, ...input }: Omit<BankAccountInput, 'iban'> & { id: string }) =>
      apiFetch<VendorBankAccount>(`/vendors/${vendorId}/bank-accounts/${id}`, {
        method: 'PATCH',
        json: input,
      }),
    onSuccess: invalidate,
  });
}
