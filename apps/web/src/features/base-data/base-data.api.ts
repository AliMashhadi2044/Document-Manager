import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';

export interface LookupItem {
  readonly id: string;
  readonly title: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly usageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export interface LookupResourceInfo {
  readonly key: string;
  readonly titleFa: string;
}

export interface LookupListParams {
  readonly resource: string;
  readonly page: number;
  readonly search: string;
  readonly isActive?: 'true' | 'false' | undefined;
  readonly sortBy?: string | undefined;
  readonly sortDir: 'asc' | 'desc';
}

export const baseDataKeys = {
  resources: ['base-data', 'resources'] as const,
  lookups: (params: LookupListParams) => ['base-data', 'lookups', params] as const,
  bootstrap: ['base-data', 'bootstrap'] as const,
  categories: ['base-data', 'categories'] as const,
};

export function useLookupResources() {
  return useQuery({
    queryKey: baseDataKeys.resources,
    queryFn: () => apiFetch<LookupResourceInfo[]>('/base-data/lookups/resources'),
    // فهرست منابع ثابت است و نیازی به بازخوانی مکرر ندارد.
    staleTime: 10 * 60_000,
  });
}

export function useLookupList(params: LookupListParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    sortDir: params.sortDir,
  });
  if (params.search) query.set('search', params.search);
  if (params.isActive) query.set('isActive', params.isActive);
  if (params.sortBy) query.set('sortBy', params.sortBy);

  return useQuery({
    queryKey: baseDataKeys.lookups(params),
    queryFn: () =>
      apiFetch<PageResult<LookupItem>>(`/base-data/lookups/${params.resource}?${query.toString()}`),
    enabled: params.resource !== '',
    // داده صفحه قبلی تا رسیدن صفحه جدید نمایش داده می‌شود تا جدول نپرد.
    placeholderData: (previous) => previous,
  });
}

export interface ReferenceItem {
  readonly id: string;
  readonly title: string;
}

export interface BootstrapData {
  readonly paymentMethods: ReadonlyArray<{
    readonly id: string;
    readonly kind: string;
    readonly titleFa: string;
    readonly requiresPaymentIdentifier: boolean;
    readonly requiresBillIdentifier: boolean;
  }>;
  readonly utilityTypes: readonly ReferenceItem[];
  readonly fuelTypes: readonly ReferenceItem[];
  readonly stadRequestTypes: readonly ReferenceItem[];
  readonly measurementUnits: readonly ReferenceItem[];
  readonly districts: readonly ReferenceItem[];
  readonly vehicleTypes: readonly ReferenceItem[];
}

/** داده‌های مرجعِ فرم‌ها در یک درخواست — کم‌حجم و کم‌تغییر. */
export function useBootstrap() {
  return useQuery({
    queryKey: baseDataKeys.bootstrap,
    queryFn: () => apiFetch<BootstrapData>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
  });
}

function useInvalidateLookups() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['base-data', 'lookups'] });
    /*
      فرم‌ها فهرست‌هایشان را از `bootstrap` می‌گیرند و نه از مسیر lookups.

      بدون این خط، موردی که کاربر همان لحظه از داخل فرم ساخته بود تا بازخوانی بعدی
      در فهرست انتخابش دیده نمی‌شد — یعنی دقیقاً همان چیزی که ساختنش را از فرم ممکن
      کردیم، بی‌فایده می‌شد.
    */
    void queryClient.invalidateQueries({ queryKey: baseDataKeys.bootstrap });
  };
}

export function useCreateLookup(resource: string) {
  const invalidate = useInvalidateLookups();
  return useMutation({
    mutationFn: (input: { title: string; sortOrder?: number }) =>
      apiFetch<LookupItem>(`/base-data/lookups/${resource}`, { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateLookup(resource: string) {
  const invalidate = useInvalidateLookups();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; title?: string; isActive?: boolean }) =>
      apiFetch<LookupItem>(`/base-data/lookups/${resource}/${id}`, {
        method: 'PATCH',
        json: input,
      }),
    onSuccess: invalidate,
  });
}

/**
 * ذخیرهٔ ترتیب تازه، با به‌روزرسانی خوشبینانه.
 *
 * جابه‌جایی باید **فوری** دیده شود: ردیفی که کاربر رها کرده و نیم‌ثانیه سر جای قبلی
 * می‌ماند، حس شکست می‌دهد و کاربر دوباره می‌کشد. در صورت خطا، داده قبلی برمی‌گردد.
 */
export function useReorderLookup(resource: string, params: LookupListParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      apiFetch<void>(`/base-data/lookups/${resource}/reorder`, {
        method: 'PATCH',
        json: { ids },
      }),

    onMutate: async (ids) => {
      const key = baseDataKeys.lookups(params);
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<PageResult<LookupItem>>(key);
      if (previous) {
        const byId = new Map(previous.items.map((item) => [item.id, item]));
        const reordered = ids
          .map((id) => byId.get(id))
          .filter((item): item is LookupItem => item !== undefined);
        queryClient.setQueryData<PageResult<LookupItem>>(key, {
          ...previous,
          items: reordered,
        });
      }

      return { previous, key };
    },

    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['base-data', 'lookups'] });
    },
  });
}

export function useDeleteLookup(resource: string) {
  const invalidate = useInvalidateLookups();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/base-data/lookups/${resource}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ─────────────── فصل‌ها و اتصال به انواع فاکتور ───────────────

export interface InvoiceTypeRef {
  readonly id: string;
  readonly key: string;
  readonly kind: 'NORMAL' | 'STAD' | 'UTILITY' | 'FUEL';
  readonly titleFa: string;
}

export interface ChapterRow {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  /** تعداد فاکتورهایی که به این فصل ارجاع دارند — مبنای اینکه حذف ممکن است یا نه. */
  readonly invoiceCount: number;
  readonly invoiceTypes: ReadonlyArray<{ isDefault: boolean; invoiceType: InvoiceTypeRef }>;
}

export interface CategoryRow {
  readonly id: string;
  readonly key: 'CURRENT' | 'CAPITAL';
  readonly titleFa: string;
  readonly chapters: readonly ChapterRow[];
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: baseDataKeys.categories,
    queryFn: () => apiFetch<CategoryRow[]>('/base-data/chapters/categories'),
  });
}

/** انواع فاکتور قابل اتصال — فهرستی ثابت که به بازخوانی مکرر نیاز ندارد. */
export function useInvoiceTypes() {
  return useQuery({
    queryKey: ['base-data', 'invoice-types'] as const,
    queryFn: () => apiFetch<InvoiceTypeRef[]>('/base-data/chapters/invoice-types'),
    staleTime: 10 * 60_000,
  });
}

export interface PaymentMethodChoice {
  readonly id: string;
  readonly key: string;
  readonly kind: string;
  readonly titleFa: string;
  readonly allowed: boolean;
}

export interface InvoiceTypePaymentMethods {
  readonly invoiceTypeId: string;
  readonly titleFa: string;
  readonly defaultPaymentMethodId: string | null;
  /** هیچ محدودیتی تعریف نشده: همهٔ روش‌های فعال مجازند. */
  readonly unrestricted: boolean;
  readonly methods: readonly PaymentMethodChoice[];
}

/** روش‌های پرداخت یک نوع فاکتور، با علامتِ مجاز بودن. */
export function useInvoiceTypePaymentMethods(invoiceTypeId: string | null) {
  return useQuery({
    queryKey: ['base-data', 'invoice-types', invoiceTypeId, 'payment-methods'] as const,
    queryFn: () =>
      apiFetch<InvoiceTypePaymentMethods>(
        `/base-data/chapters/invoice-types/${invoiceTypeId as string}/payment-methods`,
      ),
    enabled: invoiceTypeId !== null,
  });
}

/**
 * جایگزینی کامل فهرست مجاز.
 *
 * فهرست خالی یعنی «محدودیت را بردار»، نه «هیچ روشی مجاز نیست» — همان قراردادی که
 * سرور دارد.
 */
export function useSetInvoiceTypePaymentMethods() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceTypeId,
      paymentMethodIds,
    }: {
      invoiceTypeId: string;
      paymentMethodIds: readonly string[];
    }) =>
      apiFetch<InvoiceTypePaymentMethods>(
        `/base-data/chapters/invoice-types/${invoiceTypeId}/payment-methods`,
        { method: 'PUT', json: { paymentMethodIds } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['base-data', 'invoice-types'] });
      // فرم فاکتور فهرست مجاز را از همین مسیر می‌خواند.
      void queryClient.invalidateQueries({ queryKey: ['base-data', 'chapters'] });
    },
  });
}

function useInvalidateChapters(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: baseDataKeys.categories });
    // فرم فاکتور هم فهرست فصل‌ها و انواع مجاز را از همین داده می‌سازد.
    void queryClient.invalidateQueries({ queryKey: ['base-data', 'chapters'] });
  };
}

export interface ChapterInput {
  readonly categoryId?: string;
  readonly title?: string;
  readonly code?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export function useCreateChapter() {
  const invalidate = useInvalidateChapters();
  return useMutation({
    mutationFn: (input: ChapterInput & { categoryId: string; title: string }) =>
      apiFetch<ChapterRow>('/base-data/chapters', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateChapter() {
  const invalidate = useInvalidateChapters();
  return useMutation({
    mutationFn: ({ id, ...input }: ChapterInput & { id: string }) =>
      apiFetch<ChapterRow>(`/base-data/chapters/${id}`, { method: 'PATCH', json: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteChapter() {
  const invalidate = useInvalidateChapters();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/base-data/chapters/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useLinkInvoiceType() {
  const invalidate = useInvalidateChapters();
  return useMutation({
    mutationFn: ({
      chapterId,
      ...input
    }: {
      chapterId: string;
      invoiceTypeId: string;
      isDefault: boolean;
      sortOrder: number;
    }) =>
      apiFetch<unknown>(`/base-data/chapters/${chapterId}/invoice-types`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: invalidate,
  });
}

export function useUnlinkInvoiceType() {
  const invalidate = useInvalidateChapters();
  return useMutation({
    mutationFn: ({ chapterId, invoiceTypeId }: { chapterId: string; invoiceTypeId: string }) =>
      apiFetch<void>(`/base-data/chapters/${chapterId}/invoice-types/${invoiceTypeId}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });
}
