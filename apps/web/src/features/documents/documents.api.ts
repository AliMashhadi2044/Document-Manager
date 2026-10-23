import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentStatus, DocumentType, TaxMode } from '@dm/shared';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

/**
 * مبالغ از API به‌صورت **رشته عددی** می‌آیند (ADR-0003).
 * اینجا عمداً به `number` تبدیل نمی‌شوند؛ نمایش از روی همان رشته انجام می‌شود.
 */
export interface DocumentRow {
  readonly id: string;
  readonly title: string;
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly fiscalYear: number;
  readonly jalaliYear: number;
  readonly documentNumber: string | null;
  readonly totalAmount: string;
  readonly totalTax: string;
  readonly createdAt: string;
  readonly buyerSnapshot?: { readonly name: string };
  readonly _count?: { readonly invoices: number };
}

export interface InvoiceItemRow {
  readonly id: string;
  readonly rowNo: number;
  /** فقط در فاکتور سوخت مقدار دارد: روز و تاریخ همان ردیف. */
  readonly fuelEntry: { readonly jalaliDay: number; readonly entryDate: string } | null;
  readonly description: string;
  readonly productCode: string | null;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly grossAmount: string;
  readonly discountAmount: string;
  readonly netAmount: string;
  readonly taxMode: TaxMode;
  readonly taxRateBp: number | null;
  readonly taxAmount: string;
  readonly totalAmount: string;
}

export interface InvoiceRow {
  readonly id: string;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string;
  readonly invoiceKind: 'NORMAL' | 'STAD' | 'UTILITY' | 'FUEL';
  readonly chapterTitleSnapshot: string;
  /** گروه بودجهٔ فصل — سند فقط یکی از دو گروه را می‌پذیرد. */
  readonly chapter: { readonly category: { readonly key: 'CURRENT' | 'CAPITAL' } };
  readonly grossAmount: string;
  readonly discountAmount: string;
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly totalAmount: string;
  readonly notes: string | null;
  readonly vendorSnapshot: { readonly name: string; readonly representativeName: string | null } | null;
  readonly invoiceType: { readonly titleFa: string };
  readonly payment: {
    readonly methodKind: string;
    readonly ibanSnapshot: string | null;
    readonly bankTitleSnapshot: string | null;
    readonly paymentIdentifier: string | null;
    /** اطلاعات تنخواه در لحظهٔ ثبت — نه اطلاعات پایهٔ امروز. */
    readonly pettyCashHolderNameSnapshot: string | null;
    readonly pettyCashAccountHolderSnapshot: string | null;
    readonly pettyCashBankTitleSnapshot: string | null;
    readonly pettyCashIbanSnapshot: string | null;
    readonly paymentMethod: { readonly titleFa: string };
  } | null;
  readonly items: readonly InvoiceItemRow[];
  /** جزئیات اختصاصی؛ حداکثر یکی از این دو مقدار دارد (فاز ۴). */
  readonly utilityDetail: {
    readonly schoolTitleSnapshot: string;
    readonly districtTitleSnapshot: string;
    readonly utilityTypeTitleSnapshot: string;
  } | null;
  readonly fuelDetail: {
    readonly plateNumberSnapshot: string;
    readonly vehicleTypeTitleSnapshot: string;
    readonly fuelTypeTitleSnapshot: string;
    readonly jalaliYear: number;
    readonly jalaliMonth: number;
  } | null;
}

export interface DocumentDetail extends DocumentRow {
  readonly totalGross: string;
  readonly totalDiscount: string;
  readonly totalNet: string;
  readonly roundingPolicy: { readonly scope: 'LINE' | 'INVOICE'; readonly mode: 'HALF_UP' | 'FLOOR' | 'HALF_EVEN' };
  readonly buyerSnapshot: { readonly name: string; readonly economicCode: string | null };
  /** رکورد زندهٔ خریدار — فرم ویرایش از همین پر می‌شود، نه از snapshot. */
  readonly buyerEntityId: string;
  readonly stadMetadata: {
    readonly needNumber: string;
    readonly workflowNumber: string;
    readonly requestNumber: string;
    readonly requestTypeId: string | null;
    readonly notes: string | null;
    readonly requestType: { readonly title: string } | null;
  } | null;
  readonly invoices: readonly InvoiceRow[];
}

export interface RevisionRow {
  readonly id: string;
  readonly revisionNo: number;
  readonly trigger: string;
  readonly reason: string | null;
  readonly createdAt: string;
}

export const documentKeys = {
  list: (page: number, search: string) => ['documents', 'list', page, search] as const,
  detail: (id: string) => ['documents', 'detail', id] as const,
  revisions: (id: string) => ['documents', 'revisions', id] as const,
};

export function useDocuments(page: number, search: string) {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('search', search);

  return useQuery({
    queryKey: documentKeys.list(page, search),
    queryFn: () => apiFetch<PageResult<DocumentRow>>(`/documents?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: documentKeys.detail(id ?? ''),
    queryFn: () => apiFetch<DocumentDetail>(`/documents/${id as string}`),
    enabled: id !== null,
  });
}

export function useRevisions(id: string | null) {
  return useQuery({
    queryKey: documentKeys.revisions(id ?? ''),
    queryFn: () => apiFetch<RevisionRow[]>(`/documents/${id as string}/revisions`),
    enabled: id !== null,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      type: DocumentType;
      fiscalYear: number;
      jalaliYear: number;
      buyerEntityId: string;
      stad: {
        needNumber: string;
        workflowNumber: string;
        requestNumber: string;
        requestTypeId: string | null;
        notes: string | null;
      } | null;
    }) => apiFetch<DocumentRow>('/documents', { method: 'POST', json: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

/**
 * ویرایش مشخصات سند — فقط تا پیش از ثبت نهایی (سرور همین را اجبار می‌کند).
 *
 * فیلدهای نیامده دست‌نخورده می‌مانند، پس همین یک تابع هم برای تغییر شرح به‌کار
 * می‌آید و هم برای فرم کامل.
 */
export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      title?: string;
      fiscalYear?: number;
      jalaliYear?: number;
      buyerEntityId?: string;
      stad?: {
        needNumber: string;
        workflowNumber: string;
        requestNumber: string;
        requestTypeId: string | null;
        notes: string | null;
      };
    }) => apiFetch<DocumentRow>(`/documents/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

/**
 * ثبت نهایی.
 *
 * کلید idempotency **یک‌بار برای هر تلاش کاربر** ساخته می‌شود و در صورت retry شبکه
 * همان کلید می‌رود، پس سرور دوبار ثبت نمی‌کند (ریسک R8).
 */
export function useFinalizeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ document: DocumentDetail; suggestedReport: { titleFa: string } | null }>(
        `/documents/${id}/finalize`,
        { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

export function useReopenDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<DocumentDetail>(`/documents/${id}/reopen`, {
        method: 'POST',
        json: { reason },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

/**
 * ارجاع سند به بایگانی — پایان کار کارپردازی روی سند.
 *
 * مثل ثبت نهایی، گذار وضعیت است و کلید idempotency لازم دارد تا تلاش دوباره شبکه دو
 * گذار ثبت نکند.
 */
export function useSendToArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DocumentDetail>(`/documents/${id}/send-to-archive`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * ارجاع سند برای اصلاح — اقدام ناظر، با ثبت علت الزامی.
 *
 * مجوزش `feedback:create` است، یعنی همان کسی که حق ثبت ایراد دارد؛ کارپردازی سند
 * خودش را برگشت نمی‌زند.
 */
export function useSendBackForRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<DocumentDetail>(`/documents/${id}/send-back`, {
        method: 'POST',
        json: { reason },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['archive'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
