import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UploadLimits, UploadTypeKey } from '@dm/shared';

import { API_BASE, ApiError, apiFetch } from '../../shared/api/client';

export interface AttachmentRow {
  readonly id: string;
  readonly kind: 'SCAN' | 'OTHER';
  readonly originalFilename: string;
  readonly typeKey: UploadTypeKey;
  readonly detectedMime: string;
  /** مبالغ و اندازه‌ها رشته عددی‌اند (ADR-0003 برای مبلغ، همان قرارداد برای bigint). */
  readonly sizeBytes: string;
  readonly status: 'PENDING' | 'READY' | 'FAILED';
  readonly createdAt: string;
  readonly uploadedBy: { readonly id: string; readonly fullName: string } | null;
  readonly previewable: boolean;
}

export interface AttachmentListResult {
  readonly items: readonly AttachmentRow[];
  readonly limits: UploadLimits;
}

export interface UploadResult {
  readonly uploaded: readonly AttachmentRow[];
  /** فایل‌هایی که رد شدند — با **دلیل مشخص** هر کدام، نه یک پیام کلی. */
  readonly failed: readonly { readonly filename: string; readonly message: string }[];
}

export interface AttachmentHistoryRow {
  readonly id: string;
  readonly action: string;
  readonly createdAt: string;
  readonly actor: { readonly id: string; readonly fullName: string } | null;
}

export const attachmentKeys = {
  list: (documentId: string) => ['attachments', 'list', documentId] as const,
  history: (attachmentId: string) => ['attachments', 'history', attachmentId] as const,
};

export function useAttachments(documentId: string | null) {
  return useQuery({
    queryKey: attachmentKeys.list(documentId ?? ''),
    queryFn: () => apiFetch<AttachmentListResult>(`/documents/${documentId as string}/attachments`),
    enabled: documentId !== null,
  });
}

export function useAttachmentHistory(attachmentId: string | null) {
  return useQuery({
    queryKey: attachmentKeys.history(attachmentId ?? ''),
    queryFn: () =>
      apiFetch<readonly AttachmentHistoryRow[]>(`/attachments/${attachmentId as string}/history`),
    enabled: attachmentId !== null,
  });
}

/**
 * آپلود چندفایلی.
 *
 * `apiFetch` برای JSON ساخته شده و اینجا به‌کار نمی‌آید: بدنه `FormData` است و اگر
 * `Content-Type` دستی تنظیم شود، مرز (boundary) آن گم می‌شود. پس همان قراردادها
 * (کوکی نشست + هدر CSRF) اینجا دوباره و صریح رعایت می‌شوند.
 */
export function useUploadAttachments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      files,
    }: {
      documentId: string;
      files: readonly File[];
    }): Promise<UploadResult> => {
      const form = new FormData();
      for (const file of files) form.append('files', file);

      const csrf = readCsrfCookie();
      const response = await fetch(`${API_BASE}/documents/${documentId}/attachments`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        ...(csrf ? { headers: { 'x-csrf-token': csrf } } : {}),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const body = (payload ?? {}) as { code?: string; message?: string; details?: never[] };
        throw new ApiError(
          response.status,
          body.code ?? 'UNKNOWN',
          body.message ?? 'آپلود ناموفق بود',
          body.details ?? [],
        );
      }

      return payload as UploadResult;
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: attachmentKeys.list(variables.documentId) });
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
    },
  });
}

export function useDeleteAttachment(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiFetch<void>(`/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentKeys.list(documentId) });
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
    },
  });
}

/** نشانی محتوای فایل؛ همیشه از مسیر مجوزدار API، هرگز از مسیر استاتیک. */
export function attachmentContentUrl(
  attachmentId: string,
  disposition: 'inline' | 'attachment',
): string {
  return `${API_BASE}/attachments/${attachmentId}/content${
    disposition === 'inline' ? '?disposition=inline' : ''
  }`;
}

function readCsrfCookie(): string | null {
  const match = document.cookie.split('; ').find((entry) => entry.startsWith('dm_csrf='));
  return match ? decodeURIComponent(match.slice('dm_csrf='.length)) : null;
}
