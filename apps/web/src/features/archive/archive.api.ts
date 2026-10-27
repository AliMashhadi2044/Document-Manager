import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentStatus, PaymentSettlementStatus } from '@dm/shared';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

/** وضعیت پرداخت همان‌طور که سرور برمی‌گرداند؛ `null` یعنی هنوز تعیین نشده. */
export interface SettlementFields {
  readonly paymentStatus: PaymentSettlementStatus | null;
  readonly paidAmount: string | null;
  readonly outstandingAmount: string | null;
  /** لحظهٔ ثبت وضعیت فعلی — مبنای مهلت ده‌روزهٔ شناسایی. */
  readonly paymentStatusAt: string | null;
  readonly paymentDate: string | null;
}

export interface ArchiveInboxRow extends SettlementFields {
  readonly id: string;
  readonly title: string;
  readonly status: DocumentStatus;
  readonly fiscalYear: number;
  readonly documentNumber: string | null;
  readonly documentDate: string | null;
  readonly totalAmount: string;
  readonly openFeedbackCount: number;
  readonly createdAt: string;
  readonly buyerSnapshot: { readonly name: string } | null;
  readonly archiveMetadata: {
    readonly status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED';
    readonly notes: string | null;
  } | null;
  readonly _count: { readonly invoices: number; readonly attachments: number };
}

export interface ArchiveDetail extends SettlementFields {
  readonly id: string;
  readonly title: string;
  readonly status: DocumentStatus;
  readonly fiscalYear: number;
  readonly documentNumber: string | null;
  readonly documentDate: string | null;
  readonly openFeedbackCount: number;
  readonly totalAmount: string;
  readonly archiveMetadata: {
    readonly status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED';
    readonly notes: string | null;
    readonly archivedAt: string | null;
    readonly archivedBy: { readonly id: string; readonly fullName: string } | null;
  } | null;
  readonly paymentStatusBy: { readonly id: string; readonly fullName: string } | null;
}

export interface ArchiveInboxFilters {
  readonly page: number;
  readonly search: string;
  readonly status: 'PENDING_ARCHIVE' | 'ARCHIVED' | 'NEEDS_REVISION' | '';
  readonly fiscalYear: string;
  readonly hasOpenFeedback: '' | 'true' | 'false';
  /** `UNSET` یعنی تعیین‌نشده — که با «پرداخت کامل» یکی نیست. */
  readonly paymentStatus: '' | PaymentSettlementStatus | 'UNSET';
}

export const archiveKeys = {
  inbox: (filters: ArchiveInboxFilters) => ['archive', 'inbox', filters] as const,
  detail: (id: string) => ['archive', 'detail', id] as const,
};

export function useArchiveInbox(filters: ArchiveInboxFilters) {
  const query = new URLSearchParams({ page: String(filters.page) });
  if (filters.search) query.set('search', filters.search);
  if (filters.status) query.set('status', filters.status);
  if (filters.fiscalYear) query.set('fiscalYear', filters.fiscalYear);
  if (filters.hasOpenFeedback) query.set('hasOpenFeedback', filters.hasOpenFeedback);
  if (filters.paymentStatus) query.set('paymentStatus', filters.paymentStatus);

  return useQuery({
    queryKey: archiveKeys.inbox(filters),
    queryFn: () => apiFetch<PageResult<ArchiveInboxRow>>(`/archive/inbox?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useArchiveDetail(documentId: string | null) {
  return useQuery({
    queryKey: archiveKeys.detail(documentId ?? ''),
    queryFn: () => apiFetch<ArchiveDetail>(`/archive/documents/${documentId as string}`),
    enabled: documentId !== null,
  });
}

export function useSaveArchiveInfo(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { documentNumber: string; documentDate: string; notes: string | null }) =>
      apiFetch<ArchiveDetail>(`/archive/documents/${documentId}/info`, {
        method: 'PUT',
        json: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

/**
 * ثبت وضعیت پرداخت.
 *
 * مبالغ فقط در «شناسایی» فرستاده می‌شوند؛ در «پرداخت کامل» سرور از مبلغ خود سند
 * مشتقشان می‌کند و فرستادنشان از اینجا فقط راهی می‌شد برای ثبت تناقض.
 *
 * داشبورد و فهرست اسناد هم بی‌اعتبار می‌شوند: وضعیت پرداخت در هر دو دیده می‌شود.
 */
export function useSavePaymentStatus(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      status: PaymentSettlementStatus;
      paidAmount: string | null;
      outstandingAmount: string | null;
    }) =>
      apiFetch<ArchiveDetail>(`/archive/documents/${documentId}/payment`, {
        method: 'PUT',
        json: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** نهایی کردن بایگانی؛ مثل ثبت نهایی سند، کلید idempotency لازم دارد. */
export function useCompleteArchive(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ status: DocumentStatus }>(`/archive/documents/${documentId}/complete`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
