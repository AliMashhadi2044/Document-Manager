import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { API_BASE, ApiError, apiFetch } from '../../shared/api/client';

/**
 * چیدمان گزارش، همان‌طور که سرور می‌فرستد.
 *
 * `raw` **رشته عددی** است، نه `number`: مبالغ ریالی از محدوده امن `number` بیرون
 * می‌زنند (ADR-0003) و این مرز هم مثل بقیه مرزهای سامانه، رشته رد می‌کند.
 */
export interface ReportCell {
  readonly text: string;
  readonly raw: string | null;
  readonly align: 'start' | 'center' | 'end';
  readonly extraLines: readonly { readonly text: string; readonly muted: boolean }[];
}

export interface ReportTableBlock {
  readonly kind: 'table';
  readonly id: string;
  readonly columns: readonly {
    readonly key: string;
    readonly titleFa: string;
    readonly width: { readonly unit: 'mm' | 'percent' | 'auto'; readonly value?: number };
    readonly align: 'start' | 'center' | 'end';
    readonly isNumeric: boolean;
  }[];
  readonly rows: readonly (readonly ReportCell[])[];
  readonly fildlerRowCount: number;
  readonly totals: readonly ReportCell[] | null;
  readonly totalsLabel: string | null;
}

export interface ReportTextBlock {
  readonly kind: 'text';
  readonly id: string;
  readonly text: string;
  readonly align: 'start' | 'center' | 'end';
  readonly bold: boolean;
  readonly fontSizePt: number | null;
}

export interface ReportSignatureBlock {
  readonly kind: 'signature';
  readonly id: string;
  readonly positionTitle: string;
  readonly fullName: string;
  readonly align: 'start' | 'center' | 'end';
  readonly spaceMm: number;
}

export type ReportBlock =
  | ReportTableBlock
  | ReportTextBlock
  | ReportSignatureBlock
  | { readonly kind: 'signatureRow'; readonly id: string; readonly blocks: readonly ReportSignatureBlock[] }
  | { readonly kind: 'variable'; readonly id: string; readonly labelFa: string | null; readonly text: string; readonly align: 'start' | 'center' | 'end' }
  | { readonly kind: 'divider'; readonly id: string }
  | { readonly kind: 'spacer'; readonly id: string; readonly heightMm: number }
  | { readonly kind: 'pageNumber'; readonly id: string; readonly templateFa: string };

export interface LaidOutReportDto {
  readonly titleFa: string;
  readonly page: {
    readonly size: string;
    readonly orientation: 'portrait' | 'landscape';
    readonly margins: { readonly top: number; readonly bottom: number; readonly inlineStart: number; readonly inlineEnd: number };
  };
  readonly header: readonly ReportBlock[];
  readonly body: readonly ReportBlock[];
  readonly footer: readonly ReportBlock[];
  readonly generatedAt: string;
}

export interface ReportPreview {
  readonly runId: string;
  readonly rowCount: number;
  /** فاکتورهای بدون فروشنده که در گزارش نیامده‌اند — هشدار شمارش‌شده §۸. */
  readonly skippedInvoiceCount: number;
  /** شناسه فروشنده هر ردیف، برای اقدام‌های رابط کاربری؛ ستون گزارش نیست. */
  readonly rowVendorIds: readonly string[];
  readonly report: LaidOutReportDto;
}

export interface AmountDetails {
  readonly invoices: readonly {
    readonly id: string;
    readonly invoiceNumber: string | null;
    readonly invoiceDate: string;
    readonly invoiceKind: string;
    readonly chapterTitle: string;
    readonly grossAmount: string;
    readonly discountAmount: string;
    readonly netAmount: string;
    readonly taxAmount: string;
    readonly totalAmount: string;
  }[];
  readonly totals: {
    readonly gross: string;
    readonly discount: string;
    readonly net: string;
    readonly tax: string;
    readonly total: string;
  };
}

export interface ProductTypeSuggestions {
  readonly current: { readonly id: string; readonly title: string } | null;
  readonly suggestions: readonly { readonly id: string; readonly title: string; readonly useCount: number }[];
  readonly allTypes: readonly { readonly id: string; readonly title: string }[];
  readonly recentPurchases: readonly {
    readonly id: string;
    readonly invoiceNumber: string | null;
    readonly invoiceDate: string;
    readonly totalAmount: string;
    readonly chapterTitle: string;
    readonly document: { readonly id: string; readonly title: string; readonly fiscalYear: number };
  }[];
}

export interface ReportRunRow {
  readonly id: string;
  readonly outputFormat: 'HTML' | 'EXCEL' | 'PDF';
  readonly status: string;
  readonly rowCount: number | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly requestedBy: { readonly id: string; readonly fullName: string } | null;
  readonly version: { readonly versionNo: number } | null;
}

export const reportKeys = {
  preview: (reportTypeKey: string, documentId: string) =>
    ['reports', 'preview', reportTypeKey, documentId] as const,
  runs: (documentId: string) => ['reports', 'runs', documentId] as const,
};

/**
 * پیش‌نمایش گزارش.
 *
 * `useQuery` با متد POST: اجرای گزارش یک رکورد اجرا می‌سازد، ولی از دید رابط کاربری
 * یک «خواندن» است که با باز شدن صفحه انجام می‌شود. `staleTime` صفر است تا تغییر نوع
 * کالا بلافاصله در گزارش دیده شود.
 */
export function useReportPreview(reportTypeKey: string, documentId: string | null) {
  return useQuery({
    queryKey: reportKeys.preview(reportTypeKey, documentId ?? ''),
    queryFn: () =>
      apiFetch<ReportPreview>(
        `/reports/${reportTypeKey}/documents/${documentId as string}/preview`,
        { method: 'POST' },
      ),
    enabled: documentId !== null,
    staleTime: 0,
  });
}

export function useReportRuns(documentId: string | null) {
  return useQuery({
    queryKey: reportKeys.runs(documentId ?? ''),
    queryFn: () =>
      apiFetch<readonly ReportRunRow[]>(`/reports/documents/${documentId as string}/runs`),
    enabled: documentId !== null,
  });
}

export function useProductTypeSuggestions() {
  return useMutation({
    mutationFn: ({ documentId, vendorId }: { documentId: string; vendorId: string }) =>
      apiFetch<ProductTypeSuggestions>(
        `/reports/documents/${documentId}/vendors/${vendorId}/product-type/suggestions`,
        { method: 'POST' },
      ),
  });
}

export function useAmountDetails() {
  return useMutation({
    mutationFn: ({ documentId, vendorId }: { documentId: string; vendorId: string }) =>
      apiFetch<AmountDetails>(
        `/reports/documents/${documentId}/vendors/${vendorId}/amount-details`,
        { method: 'POST' },
      ),
  });
}

export function useSetProductType(reportTypeKey: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorId, productTypeId }: { vendorId: string; productTypeId: string }) =>
      apiFetch<{ id: string; title: string }>(
        `/reports/documents/${documentId}/vendors/${vendorId}/product-type`,
        { method: 'POST', json: { productTypeId } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.preview(reportTypeKey, documentId) });
    },
  });
}

/**
 * دانلود خروجی فایلی.
 *
 * مسیرها POST‌اند (چون رکورد اجرا می‌سازند)، پس نمی‌شود با یک `<a href>` ساده دانلود
 * کرد؛ پاسخ به‌صورت blob گرفته و با یک لینک موقت ذخیره می‌شود.
 */
export async function downloadReport(
  reportTypeKey: string,
  documentId: string,
  format: 'excel' | 'html' | 'pdf',
  filename: string,
): Promise<void> {
  const csrf = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('dm_csrf='))
    ?.slice('dm_csrf='.length);

  const response = await fetch(
    `${API_BASE}/reports/${reportTypeKey}/documents/${documentId}/${format}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      ...(csrf ? { headers: { 'x-csrf-token': decodeURIComponent(csrf) } } : {}),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    throw new ApiError(response.status, body?.code ?? 'UNKNOWN', body?.message ?? 'دریافت خروجی ناموفق بود');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
