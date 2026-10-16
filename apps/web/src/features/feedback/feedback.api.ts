import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

export type FeedbackStatus = 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'REJECTED';

export type FeedbackTargetKind =
  | 'DOCUMENT'
  | 'STAD_META'
  | 'VENDOR'
  | 'INVOICE'
  | 'INVOICE_ITEM'
  | 'PAYMENT'
  | 'ARCHIVE'
  | 'TAX_REPORT';

export interface FeedbackReply {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly createdBy: { readonly id: string; readonly fullName: string } | null;
}

export interface FeedbackStatusEvent {
  readonly id: string;
  readonly fromStatus: FeedbackStatus;
  readonly toStatus: FeedbackStatus;
  readonly note: string | null;
  readonly createdAt: string;
  readonly actor: { readonly id: string; readonly fullName: string } | null;
}

export interface FeedbackRow {
  readonly id: string;
  readonly documentId: string;
  readonly targetKind: FeedbackTargetKind;
  readonly invoiceId: string | null;
  readonly invoiceItemId: string | null;
  readonly sectionKey: string | null;
  readonly body: string;
  readonly status: FeedbackStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly createdBy: { readonly id: string; readonly fullName: string } | null;
  readonly replies: readonly FeedbackReply[];
  readonly statusHistory: readonly FeedbackStatusEvent[];
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: 'باز',
  ANSWERED: 'پاسخ داده شده',
  RESOLVED: 'رسیدگی شده',
  REJECTED: 'رد شده',
};

export const FEEDBACK_TARGET_LABELS: Record<FeedbackTargetKind, string> = {
  DOCUMENT: 'کل سند',
  STAD_META: 'اطلاعات ستاد',
  VENDOR: 'فروشنده',
  INVOICE: 'فاکتور',
  INVOICE_ITEM: 'ردیف فاکتور',
  PAYMENT: 'پرداخت',
  ARCHIVE: 'بایگانی',
  TAX_REPORT: 'خروجی مالیات',
};

export const feedbackKeys = {
  byDocument: (documentId: string) => ['feedback', 'document', documentId] as const,
};

export function useDocumentFeedback(documentId: string | null) {
  return useQuery({
    queryKey: feedbackKeys.byDocument(documentId ?? ''),
    queryFn: () =>
      apiFetch<PageResult<FeedbackRow>>(
        `/feedbacks?documentId=${documentId as string}&pageSize=100`,
      ),
    enabled: documentId !== null,
  });
}

export function useCreateFeedback(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      targetKind: FeedbackTargetKind;
      invoiceId: string | null;
      invoiceItemId: string | null;
      sectionKey: string | null;
      body: string;
    }) => apiFetch<FeedbackRow>(`/documents/${documentId}/feedbacks`, { method: 'POST', json: input }),
    onSuccess: () => invalidate(queryClient, documentId),
  });
}

export function useReplyToFeedback(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ feedbackId, body }: { feedbackId: string; body: string }) =>
      apiFetch<FeedbackReply>(`/feedbacks/${feedbackId}/replies`, {
        method: 'POST',
        json: { body },
      }),
    onSuccess: () => invalidate(queryClient, documentId),
  });
}

export function useChangeFeedbackStatus(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      feedbackId,
      status,
      note,
    }: {
      feedbackId: string;
      status: FeedbackStatus;
      note: string | null;
    }) =>
      apiFetch<FeedbackRow>(`/feedbacks/${feedbackId}/status`, {
        method: 'PATCH',
        json: { status, note },
      }),
    onSuccess: () => invalidate(queryClient, documentId),
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  documentId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: feedbackKeys.byDocument(documentId) });
  // شمارنده بازخورد باز روی سند و کارتابل بایگانی هم عوض می‌شود.
  void queryClient.invalidateQueries({ queryKey: ['archive'] });
  void queryClient.invalidateQueries({ queryKey: ['documents'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
