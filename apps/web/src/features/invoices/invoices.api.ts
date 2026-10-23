import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InvoiceKind, PaymentMethodKind, TaxMode } from '@dm/shared';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from '../base-data/base-data.api';

/**
 * داده‌های فرم فاکتور.
 *
 * فهرست‌های بلند (مدرسه، پلاک، فروشنده) **سمت سرور** جست‌وجو و صفحه‌بندی می‌شوند؛
 * هیچ‌کدام از این hookها کل جدول را نمی‌آورند (الزام بهینگی، پاسخ Q12).
 */

export interface ChapterInvoiceTypeOption {
  readonly invoiceTypeId: string;
  readonly key: string;
  readonly kind: InvoiceKind;
  readonly titleFa: string;
  readonly isDefault: boolean;
  readonly defaultPaymentMethod: {
    readonly id: string;
    readonly kind: PaymentMethodKind;
    readonly titleFa: string;
  } | null;
  /**
   * روش‌های پرداخت مجاز این نوع فاکتور.
   *
   * `null` یعنی محدودیتی تعریف نشده و همهٔ روش‌های فعال مجازند — که با فهرست خالی
   * یکی نیست.
   */
  readonly allowedPaymentMethodIds: readonly string[] | null;
}

export interface ChapterInvoiceTypes {
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly options: readonly ChapterInvoiceTypeOption[];
}

/** انواع فاکتور مجاز یک فصل — همین پاسخ تعیین می‌کند کدام فرم باز شود. */
export function useChapterInvoiceTypes(chapterId: string) {
  return useQuery({
    queryKey: ['base-data', 'chapters', chapterId, 'invoice-types'],
    queryFn: () => apiFetch<ChapterInvoiceTypes>(`/base-data/chapters/${chapterId}/invoice-types`),
    enabled: chapterId !== '',
    staleTime: 5 * 60_000,
  });
}

export interface SchoolOption {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly district: { readonly id: string; readonly title: string };
}

export function useSchoolSearch(search: string) {
  return useQuery({
    queryKey: ['base-data', 'schools', search],
    queryFn: () =>
      apiFetch<PageResult<SchoolOption>>(
        `/base-data/schools?isActive=true&pageSize=20&search=${encodeURIComponent(search)}`,
      ),
    staleTime: 60_000,
  });
}

export interface VehicleOption {
  readonly id: string;
  readonly plateNumber: string;
  readonly notes: string | null;
  readonly vehicleType: { readonly id: string; readonly title: string };
}

/** پلاک‌های یک نوع خودرو. بدون نوع خودرو، فهرست پلاک معنا ندارد و درخواست نمی‌رود. */
export function useVehicleSearch(vehicleTypeId: string, search: string) {
  return useQuery({
    queryKey: ['base-data', 'vehicles', vehicleTypeId, search],
    queryFn: () =>
      apiFetch<PageResult<VehicleOption>>(
        `/base-data/vehicles?isActive=true&pageSize=20&vehicleTypeId=${vehicleTypeId}` +
          `&search=${encodeURIComponent(search)}`,
      ),
    enabled: vehicleTypeId !== '',
    staleTime: 60_000,
  });
}

export interface VendorOption {
  readonly id: string;
  readonly name: string;
  readonly representativeName: string | null;
  readonly personType: 'NATURAL' | 'LEGAL';
}

export function useVendorSearch(search: string) {
  return useQuery({
    queryKey: ['vendors', 'search', search],
    queryFn: () =>
      apiFetch<PageResult<VendorOption>>(
        `/vendors?isActive=true&pageSize=20&search=${encodeURIComponent(search)}`,
      ),
    staleTime: 60_000,
  });
}

export interface VendorBankAccountOption {
  readonly id: string;
  readonly iban: string;
  /** می‌تواند خالی باشد؛ برچسب گزینه نباید به آن تکیه کند. */
  readonly accountTitle: string | null;
  readonly bankTitle: string | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;
}

/** شباهای فروشنده از جزئیات همان فروشنده می‌آیند؛ مسیر جداگانه‌ای لازم نیست. */
export function useVendorBankAccounts(vendorId: string) {
  return useQuery({
    queryKey: ['vendors', 'detail', vendorId],
    queryFn: () =>
      apiFetch<{ bankAccounts: readonly VendorBankAccountOption[] }>(`/vendors/${vendorId}`),
    enabled: vendorId !== '',
    select: (data) => data.bankAccounts.filter((account) => account.isActive),
  });
}

// ─────────────── ایجاد فاکتور ───────────────

export interface ItemInputDraft {
  readonly rowNo: number;
  readonly description: string;
  readonly productCode: string | null;
  readonly quantity: string;
  readonly unitId: string | null;
  readonly unitPrice: string;
  readonly discountAmount: string;
  readonly taxMode: TaxMode;
  readonly taxRateBp: number | null;
  readonly taxAmount: string | null;
}

export type InvoiceDetailsPayload =
  | {
      readonly kind: 'NORMAL' | 'STAD';
      readonly taxMode: TaxMode;
      readonly taxRateBp: number | null;
      readonly taxAmount: string | null;
      readonly items: readonly ItemInputDraft[];
    }
  | {
      readonly kind: 'UTILITY';
      readonly schoolId: string;
      readonly utilityTypeId: string;
      readonly baseAmount: string;
      readonly discountAmount: string;
      readonly taxMode: TaxMode;
      readonly taxRateBp: number | null;
      readonly taxAmount: string | null;
    }
  | {
      readonly kind: 'FUEL';
      readonly vehicleId: string;
      readonly fuelTypeId: string;
      readonly jalaliYear: number;
      readonly jalaliMonth: number;
      readonly entries: ReadonlyArray<{ readonly day: number; readonly amount: string }>;
    };

export interface CreateInvoicePayload {
  readonly chapterId: string;
  readonly invoiceTypeId: string;
  readonly vendorId: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string;
  /** شرح فاکتور — عنوانی یک‌خطی؛ پیش‌فرضِ «نوع کالا» در گزارش مالیات. */
  readonly description: string | null;
  readonly notes: string | null;
  readonly details: InvoiceDetailsPayload;
  readonly payment: {
    readonly paymentMethodId: string;
    readonly vendorBankAccountId: string | null;
    readonly paymentIdentifier: string | null;
    readonly billIdentifier: string | null;
    readonly pettyCashHolderId: string | null;
    readonly notes: string | null;
  } | null;
  /** تأیید صریح ثبت با وجود هشدار پرداخت تکراری (فقط انشعابات). */
  readonly acknowledgeDuplicate?: boolean;
}

/**
 * فاکتور به شکل **ورودی ساخت** — ورودیِ فرم ویرایش.
 *
 * فرم ویرایش همان فرم ساخت است، پس چیزی که برای پر شدن لازم دارد همان شکلی است که
 * خودش پس می‌فرستد؛ چند قلم فقط برای نمایش هم همراهش می‌آید.
 */
export interface InvoiceDraft {
  readonly documentId: string;
  readonly categoryId: string;
  readonly chapterId: string;
  readonly invoiceTypeId: string;
  readonly vendorId: string | null;
  readonly vendorName: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string;
  readonly description: string | null;
  readonly notes: string | null;
  readonly details: Record<string, unknown>;
  readonly payment: {
    readonly paymentMethodId: string;
    readonly vendorBankAccountId: string | null;
    readonly pettyCashHolderId: string | null;
    readonly paymentIdentifier: string | null;
    readonly billIdentifier: string | null;
    readonly notes: string | null;
  } | null;
}

export function useInvoiceDraft(invoiceId: string | null) {
  return useQuery({
    queryKey: ['invoices', invoiceId, 'draft'],
    queryFn: () => apiFetch<InvoiceDraft>(`/documents/invoices/${invoiceId as string}/draft`),
    enabled: invoiceId !== null,
    // فرم باید هر بار مقدار تازه بگیرد؛ ویرایشِ ذخیره‌نشده نباید دوباره برگردد.
    gcTime: 0,
    staleTime: 0,
  });
}

export function useUpdateInvoice(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, ...payload }: CreateInvoicePayload & { invoiceId: string }) =>
      apiFetch<unknown>(`/documents/invoices/${invoiceId}`, { method: 'PUT', json: payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useCreateInvoice(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInvoicePayload) =>
      apiFetch<{ id: string }>(`/documents/${documentId}/invoices`, {
        method: 'POST',
        json: payload,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<void>(`/documents/invoices/${invoiceId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  });
}

export interface UtilityDuplicate {
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly invoiceDateJalali: string;
  readonly totalAmount: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly documentNumber: string | null;
  readonly documentStatus: string;
  readonly fiscalYear: number;
  readonly schoolTitle: string;
  readonly utilityTypeTitle: string;
  readonly paymentMethodTitle: string | null;
  readonly paymentIdentifier: string | null;
  readonly billIdentifier: string | null;
  readonly ibanSnapshot: string | null;
  readonly createdByName: string | null;
}

/**
 * پرداخت قبلی همین انشعاب برای همین مدرسه، در همین سال مالی.
 *
 * به‌محض انتخاب مدرسه و نوع انشعاب پرسیده می‌شود — نه موقع ثبت: هشداری که بعد از پر
 * کردن کل فرم بیاید، کارِ از قبل انجام‌شده را باطل می‌کند.
 */
export function useUtilityDuplicate(documentId: string, schoolId: string, utilityTypeId: string) {
  return useQuery({
    queryKey: ['documents', documentId, 'utility-duplicate', schoolId, utilityTypeId],
    queryFn: () =>
      apiFetch<{ duplicate: UtilityDuplicate | null; message: string | null }>(
        `/documents/${documentId}/utility-duplicate?schoolId=${schoolId}&utilityTypeId=${utilityTypeId}`,
      ),
    enabled: documentId !== '' && schoolId !== '' && utilityTypeId !== '',
  });
}
