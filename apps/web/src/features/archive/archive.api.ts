import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentStatus } from '@dm/shared';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

export interface ArchiveInboxRow {
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

export interface ArchiveDetail {
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
}

export interface ArchiveInboxFilters {
  readonly page: number;
  readonly search: string;
  readonly status: 'PENDING_ARCHIVE' | 'ARCHIVED' | 'NEEDS_REVISION' | '';
  readonly fiscalYear: string;
  readonly hasOpenFeedback: '' | 'true' | 'false';
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
