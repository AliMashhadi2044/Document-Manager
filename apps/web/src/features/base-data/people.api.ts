import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SignatoryRoleKey } from '@dm/shared';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from './base-data.api';
import { usePageSize } from '../../shared/preferences/preferences';

/**
 * اشخاص سازمان: امضاکنندگان و تنخواه‌داران.
 *
 * یک فایل برای هر دو، چون هر دو یک چیزند — فهرستی از افراد با نقش — و هر دو تا
 * پیش از این فقط از راه seed وارد می‌شدند: نام پای گزارش‌ها قابل تغییر نبود و
 * تنخواه‌دار اصلاً انتخاب‌شدنی نبود.
 */

export interface SignatoryRow {
  readonly id: string;
  readonly fullName: string;
  readonly positionTitle: string;
  readonly roleKey: SignatoryRoleKey;
  readonly isActive: boolean;
  readonly sortOrder: number;
}

export interface SignatoryInput {
  readonly fullName: string;
  readonly positionTitle: string;
  readonly roleKey: SignatoryRoleKey;
  readonly isActive?: boolean;
  readonly sortOrder?: number;
  readonly isDefault?: boolean;
}

export interface PettyCashHolderRow {
  readonly id: string;
  readonly fullName: string;
  readonly positionTitle: string | null;
  readonly nationalId: string | null;
  readonly phone: string | null;
  readonly accountHolderName: string | null;
  readonly iban: string | null;
  readonly ibanNormalized: string | null;
  readonly accountNumber: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  /** تنخواه‌دار پیش‌فرض — در فرم فاکتور از پیش انتخاب می‌شود. */
  readonly isDefault: boolean;
  readonly bank: { readonly code: string; readonly titleFa: string } | null;
}

export interface PettyCashHolderInput {
  readonly fullName: string;
  readonly positionTitle?: string;
  readonly nationalId?: string;
  readonly phone?: string;
  readonly accountHolderName?: string;
  readonly iban?: string;
  readonly accountNumber?: string;
  readonly notes?: string;
  readonly isActive?: boolean;
  readonly sortOrder?: number;
}

const signatoryKeys = { all: ['base-data', 'signatories'] as const };
const holderKeys = { all: ['base-data', 'petty-cash-holders'] as const };

function listQuery(page: number, search: string, isActive: string, pageSize: number): string {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) query.set('search', search);
  if (isActive) query.set('isActive', isActive);
  return query.toString();
}

// ───────────────────────── امضاکنندگان ─────────────────────────

export function useSignatoriesList(page: number, search: string, isActive = '') {
  const pageSize = usePageSize();

  return useQuery({
    queryKey: [...signatoryKeys.all, 'list', page, search, isActive, pageSize],
    queryFn: () =>
      apiFetch<PageResult<SignatoryRow>>(`/base-data/signatories?${listQuery(page, search, isActive, pageSize)}`),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateSignatories(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: signatoryKeys.all });
    // طراح گزارش فهرست نقش‌ها را جدا می‌گیرد؛ نام تازه باید آنجا هم دیده شود.
    void queryClient.invalidateQueries({ queryKey: ['reports', 'signatories'] });
  };
}

export function useCreateSignatory() {
  const invalidate = useInvalidateSignatories();
  return useMutation({
    mutationFn: (input: SignatoryInput) =>
      apiFetch<SignatoryRow>('/base-data/signatories', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateSignatory() {
  const invalidate = useInvalidateSignatories();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<SignatoryInput> & { id: string }) =>
      apiFetch<SignatoryRow>(`/base-data/signatories/${id}`, { method: 'PATCH', json: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteSignatory() {
  const invalidate = useInvalidateSignatories();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/base-data/signatories/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ───────────────────────── تنخواه‌داران ─────────────────────────

export function usePettyCashHolders(page: number, search: string, isActive = '') {
  const pageSize = usePageSize();

  return useQuery({
    queryKey: [...holderKeys.all, 'list', page, search, isActive, pageSize],
    queryFn: () =>
      apiFetch<PageResult<PettyCashHolderRow>>(
        `/base-data/petty-cash-holders?${listQuery(page, search, isActive, pageSize)}`,
      ),
    placeholderData: (previous) => previous,
  });
}

/** فهرست کوتاهِ تنخواه‌داران فعال — برای انتخاب در فرم پرداخت. */
export function useActivePettyCashHolders() {
  return useQuery({
    queryKey: [...holderKeys.all, 'active'],
    queryFn: () =>
      apiFetch<PageResult<PettyCashHolderRow>>(
        '/base-data/petty-cash-holders?isActive=true&pageSize=200',
      ),
    staleTime: 5 * 60_000,
  });
}

function useInvalidateHolders(): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: holderKeys.all });
}

export function useCreatePettyCashHolder() {
  const invalidate = useInvalidateHolders();
  return useMutation({
    mutationFn: (input: PettyCashHolderInput) =>
      apiFetch<PettyCashHolderRow>('/base-data/petty-cash-holders', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdatePettyCashHolder() {
  const invalidate = useInvalidateHolders();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<PettyCashHolderInput> & { id: string }) =>
      apiFetch<PettyCashHolderRow>(`/base-data/petty-cash-holders/${id}`, {
        method: 'PATCH',
        json: input,
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePettyCashHolder() {
  const invalidate = useInvalidateHolders();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/base-data/petty-cash-holders/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
