import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FilterGroup, FilterOperator, ReportFieldType, ReportSort } from '@dm/shared';

import { API_BASE, ApiError, apiFetch } from '../../shared/api/client';

/**
 * گزارش‌گیری عمومی (فاز ۸).
 *
 * قاعده‌ای که این لایه را شکل می‌دهد: **هیچ فیلتر و مرتب‌سازی و صفحه‌بندی‌ای در
 * مرورگر انجام نمی‌شود.** هر تغییر فیلتر یا ستون مرتب‌سازی یک درخواست تازه است و
 * پاسخ، فقط همان صفحه را دارد. مرورگر هیچ‌وقت کل جدول را نمی‌بیند — نه برای بهینگی،
 * که آن هم هست، بلکه چون داده‌ای که به مرورگر رسیده باشد، دیگر محدود نیست.
 */

export interface DatasetFieldDto {
  readonly key: string;
  readonly titleFa: string;
  readonly type: ReportFieldType;
  readonly filterable: boolean;
  readonly sortable: boolean;
  readonly operators: readonly FilterOperator[];
  readonly enumValues: readonly { readonly value: string; readonly label: string }[] | null;
}

export interface DatasetDto {
  readonly key: string;
  readonly titleFa: string;
  readonly description: string;
  readonly kind: 'rows' | 'grouped';
  readonly defaultColumns: readonly string[];
  readonly defaultSort: readonly ReportSort[];
  readonly groupBy: readonly { readonly key: string; readonly titleFa: string }[] | null;
  readonly fields: readonly DatasetFieldDto[];
}

export interface ReportResultDto {
  readonly dataset: string;
  readonly columns: readonly { readonly key: string; readonly titleFa: string; readonly type: ReportFieldType }[];
  readonly rows: readonly Readonly<Record<string, string | number | boolean | null>>[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  /** جمع ستون‌های مبلغی روی **همه** ردیف‌های فیلترشده، نه فقط صفحه جاری. */
  readonly totals: Readonly<Record<string, string>>;
}

export interface ReportRequest {
  readonly columns: readonly string[];
  readonly filter: FilterGroup;
  readonly sort: readonly ReportSort[];
  readonly page: number;
  readonly pageSize: number;
  readonly groupBy?: string | undefined;
}

export interface SavedViewDto {
  readonly id: string;
  readonly name: string;
  readonly datasetKey: string;
  readonly columns: readonly string[];
  readonly filter: FilterGroup;
  readonly sort: readonly ReportSort[];
  readonly pageSize: number;
  readonly isShared: boolean;
  readonly isOwn: boolean;
  readonly owner: { readonly id: string; readonly fullName: string } | null;
  readonly updatedAt: string;
}

export interface ExportJobDto {
  readonly id: string;
  readonly datasetKey: string;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  readonly rowCount: number | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly errorMessage: string | null;
}

/** مبنای سال در فیلتر داشبورد. */
export type YearBasis = 'fiscal' | 'jalali';

export interface DashboardDto {
  readonly basis: YearBasis;
  readonly year: number | null;
  readonly fiscalYear: number | null;
  readonly jalaliYear: number | null;
  readonly documentCount: number;
  readonly invoiceCount: number;
  readonly openFeedbackCount: number;
  readonly pendingArchiveCount: number;
  readonly totals: {
    readonly gross: string;
    readonly discount: string;
    readonly net: string;
    readonly tax: string;
    readonly total: string;
  };
  readonly byStatus: readonly { readonly status: string; readonly count: number; readonly total: string }[];
  readonly byType: readonly { readonly type: string; readonly count: number; readonly total: string }[];
  readonly topVendors: readonly {
    readonly vendorId: string | null;
    readonly name: string;
    readonly invoiceCount: number;
    readonly total: string;
    readonly tax: string;
  }[];
  readonly byChapter: readonly {
    readonly chapterTitle: string;
    readonly invoiceCount: number;
    readonly total: string;
    readonly tax: string;
  }[];
  /** روند ماه‌های **شمسی** یک سال مالی؛ ماه بدون فاکتور هم با مقدار صفر می‌آید. */
  readonly byMonth: readonly {
    readonly month: number;
    readonly label: string;
    readonly invoiceCount: number;
    readonly total: string;
    readonly tax: string;
  }[];
}

export const analyticsKeys = {
  datasets: ['analytics', 'datasets'] as const,
  query: (dataset: string, request: ReportRequest) =>
    ['analytics', 'query', dataset, request] as const,
  views: (dataset: string) => ['analytics', 'views', dataset] as const,
  exports: ['analytics', 'exports'] as const,
  dashboard: (basis: YearBasis, year: number | null) =>
    ['analytics', 'dashboard', basis, year] as const,
  years: ['analytics', 'years'] as const,
};

export function useDatasets() {
  return useQuery({
    queryKey: analyticsKeys.datasets,
    queryFn: () => apiFetch<readonly DatasetDto[]>('/analytics/datasets'),
    staleTime: 10 * 60_000,
  });
}

/**
 * اجرای گزارش.
 *
 * `useQuery` با متد POST: از دید کاربر یک «خواندن» است و با تغییر فیلتر یا صفحه
 * دوباره اجرا می‌شود؛ متد POST فقط به این دلیل است که درخت فیلتر در URL جا نمی‌شود.
 */
export function useReportQuery(dataset: string | null, request: ReportRequest, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.query(dataset ?? '', request),
    queryFn: () =>
      apiFetch<ReportResultDto>(`/analytics/${dataset as string}/query`, {
        method: 'POST',
        json: request,
      }),
    enabled: dataset !== null && enabled,
    placeholderData: (previous) => previous,
  });
}

export function useExportPlan() {
  return useMutation({
    mutationFn: ({ dataset, request }: { dataset: string; request: ReportRequest }) =>
      apiFetch<{ rowCount: number; queued: boolean }>(`/analytics/${dataset}/export/plan`, {
        method: 'POST',
        json: request,
      }),
  });
}

export function useQueueExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dataset, request }: { dataset: string; request: ReportRequest }) =>
      apiFetch<{ id: string; status: string }>(`/analytics/${dataset}/export/queue`, {
        method: 'POST',
        json: request,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.exports });
    },
  });
}

export function useMyExports(enabled: boolean) {
  return useQuery({
    queryKey: analyticsKeys.exports,
    queryFn: () => apiFetch<readonly ExportJobDto[]>('/analytics/exports'),
    enabled,
    /**
     * تا وقتی کاری در صف یا در حال اجراست، هر پنج ثانیه یک‌بار پرسیده می‌شود و بعد
     * متوقف می‌شود. نظرسنجی دائمی روی صفحه‌ای که کاربر بازش گذاشته، هزینه بی‌دلیل است.
     */
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.some((job) => job.status === 'PENDING' || job.status === 'RUNNING')
        ? 5_000
        : false;
    },
  });
}

export function useSavedViews(dataset: string | null) {
  return useQuery({
    queryKey: analyticsKeys.views(dataset ?? ''),
    queryFn: () => apiFetch<readonly SavedViewDto[]>(`/analytics/${dataset as string}/views`),
    enabled: dataset !== null,
  });
}

export function useSaveView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      dataset,
      id,
      name,
      isShared,
      request,
    }: {
      dataset: string;
      id?: string;
      name: string;
      isShared: boolean;
      request: ReportRequest;
    }) =>
      apiFetch<{ id: string; name: string }>(`/analytics/${dataset}/views`, {
        method: 'POST',
        json: { id, name, isShared, query: request },
      }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.views(variables.dataset) });
    },
  });
}

export function useDeleteView(dataset: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewId }: { viewId: string }) =>
      apiFetch<{ id: string }>(`/analytics/views/${viewId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.views(dataset) });
    },
  });
}

/**
 * خلاصه داشبورد.
 *
 * `placeholderData` عمدی است: با عوض کردن سال، داده قبلی سر جایش می‌ماند تا پاسخ
 * تازه برسد. بدون آن، کل صفحه به اسکلت برمی‌گردد و کاربری که فقط یک فیلتر را
 * عوض کرده، همه زمینه را از دست می‌دهد.
 */
export function useDashboard(basis: YearBasis, year: number | null) {
  return useQuery({
    queryKey: analyticsKeys.dashboard(basis, year),
    queryFn: () => {
      const query = new URLSearchParams({ basis });
      if (year !== null) query.set('year', String(year));
      return apiFetch<DashboardDto>(`/analytics/dashboard?${query.toString()}`);
    },
    placeholderData: (previous) => previous,
  });
}

export interface DashboardYears {
  readonly fiscal: readonly number[];
  readonly jalali: readonly number[];
}

export function useDashboardYears() {
  return useQuery({
    queryKey: analyticsKeys.years,
    queryFn: () => apiFetch<DashboardYears>('/analytics/dashboard/years'),
    staleTime: 5 * 60_000,
  });
}

/**
 * دانلود خروجی هم‌زمان.
 *
 * مسیر POST است (چون درخواست در بدنه می‌رود و ردپای حسابرسی می‌نویسد)، پس با یک
 * `<a href>` ساده نمی‌شود دانلود کرد؛ پاسخ به‌صورت blob گرفته و با یک لینک موقت
 * ذخیره می‌شود.
 */
export async function downloadReportExport(
  dataset: string,
  request: ReportRequest,
  filename: string,
): Promise<number> {
  const csrf = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('dm_csrf='))
    ?.slice('dm_csrf='.length);

  const response = await fetch(`${API_BASE}/analytics/${dataset}/export`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { code?: string; message?: string }
      | null;
    throw new ApiError(
      response.status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? 'دریافت خروجی ناموفق بود',
    );
  }

  const rowCount = Number(response.headers.get('X-Row-Count') ?? '0');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return rowCount;
}

/** دانلود خروجی صف‌شده — مسیر GET است، پس یک لینک ساده کافی است. */
export function exportDownloadUrl(jobId: string): string {
  return `${API_BASE}/analytics/exports/${jobId}/download`;
}
