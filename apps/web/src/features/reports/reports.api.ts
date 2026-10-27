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
    /** خط دوم سرستون (کد فصل)؛ `null` یعنی سرستون یک‌خطی. */
    readonly subtitleFa: string | null;
    readonly width: { readonly unit: 'mm' | 'percent' | 'auto'; readonly value?: number };
    readonly align: 'start' | 'center' | 'end';
    readonly isNumeric: boolean;
  }[];
  readonly rows: readonly (readonly ReportCell[])[];
  /** ردیف‌های خالیِ فرم چاپی — فقط شمارهٔ ردیف دارند. */
  readonly fillerRows: readonly (readonly ReportCell[])[];
  readonly totals: readonly ReportCell[] | null;
  readonly totalsLabel: string | null;
  /** چند ستون را برچسب «جمع کل» می‌پوشاند. */
  readonly totalsLabelSpan: number;
  /**
   * پهنای هر سلول ردیف جمع، به تعداد ستون؛ `0` یعنی سلولِ پیش از آن پوشانده‌اش.
   *
   * لازم شد چون جمعِ نوشته‌شده به حروف در یک ستون باریک جا نمی‌شود و باید تا ستون
   * عددی بعدی کشیده شود — همان ادغام خانه‌ای که فرم کاغذی دارد.
   */
  readonly totalsSpans: readonly number[];
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
  /** فاکتورهای بدون روش پرداخت که در گزارش شبا ردیفی نساخته‌اند — دلیل جدا، شمارندهٔ جدا. */
  readonly skippedPaymentCount: number;
  /** شناسه فروشنده هر ردیف، برای اقدام‌های رابط کاربری؛ ستون گزارش نیست. */
  readonly rowVendorIds: readonly string[];
  /** شناسهٔ هر ردیف برای اقدام‌ها؛ در گزارش شبا، کلید مقصد پرداخت. */
  readonly rowKeys: readonly string[];
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
  /** ثبت‌شده برای همین سند و فروشنده؛ `id` خالی یعنی متن آزاد بوده است. */
  readonly current: { readonly id: string | null; readonly title: string } | null;
  readonly suggestions: readonly { readonly id: string; readonly title: string; readonly useCount: number }[];
  readonly allTypes: readonly { readonly id: string; readonly title: string }[];
  /** شرح فاکتورهای همین فروشنده در **همین سند** — اولی، پیش‌فرض است. */
  readonly invoiceDescriptions: readonly {
    readonly invoiceId: string;
    readonly description: string;
    readonly invoiceTypeTitle: string;
    readonly chapterTitle: string;
    readonly invoiceDate: string;
    readonly totalAmount: string;
  }[];
  /** تاریخچه: فاکتورهای قبلی همین فروشنده که شرح دارند. */
  readonly recentPurchases: readonly {
    readonly id: string;
    readonly invoiceNumber: string | null;
    readonly invoiceDate: string;
    readonly description: string;
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
/**
 * متن‌های سربرگ که کاربر برای همین خروجی عوض کرده است.
 *
 * به قالب دست نمی‌زند: تغییر به همین اجرا محدود است و با بستن صفحه می‌رود.
 */
export type TextOverrides = Readonly<Record<string, string>>;

export function useReportPreview(
  reportTypeKey: string,
  documentId: string | null,
  textOverrides: TextOverrides = {},
) {
  // کلید کوئری متن‌ها را هم در بر می‌گیرد، وگرنه ویرایش سربرگ پیش‌نمایش را تازه
  // نمی‌کرد و کاربر تغییرش را نمی‌دید.
  const signature = JSON.stringify(textOverrides);

  return useQuery({
    queryKey: [...reportKeys.preview(reportTypeKey, documentId ?? ''), signature],
    queryFn: () =>
      apiFetch<ReportPreview>(
        `/reports/${reportTypeKey}/documents/${documentId as string}/preview`,
        { method: 'POST', json: { textOverrides } },
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

/** گزینه‌های شرح یک ردیفِ فرم ریزهزینه. */
export interface LineTitleSuggestions {
  readonly current: { readonly id: string | null; readonly title: string } | null;
  /** پیش‌فرض: شرح خودِ فاکتور. */
  readonly invoiceDescription: string;
  readonly allTypes: readonly { readonly id: string; readonly title: string }[];
}

export function useLineTitleSuggestions() {
  return useMutation({
    mutationFn: ({ documentId, invoiceId }: { documentId: string; invoiceId: string }) =>
      apiFetch<LineTitleSuggestions>(
        `/reports/documents/${documentId}/invoices/${invoiceId}/line-title/suggestions`,
        { method: 'POST' },
      ),
  });
}

export function useSetLineTitle(reportTypeKey: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      ...body
    }: {
      invoiceId: string;
      productTypeId?: string | null;
      customTitle?: string | null;
    }) =>
      apiFetch<{ id: string | null; title: string }>(
        `/reports/documents/${documentId}/invoices/${invoiceId}/line-title`,
        { method: 'POST', json: body },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.preview(reportTypeKey, documentId) });
    },
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

/** ریز یک مقصد پرداخت: از هر فاکتور چقدر به این حساب رفته است. */
export interface BeneficiaryDetails {
  readonly identifier: string;
  readonly secondaryIdentifier: string;
  readonly accountHolder: string;
  readonly bankTitle: string;
  readonly kind: 'IBAN' | 'BILL' | 'PETTY_CASH';
  readonly total: string;
  readonly invoices: readonly {
    readonly id: string;
    readonly invoiceNumber: string | null;
    readonly invoiceDate: string;
    readonly vendorName: string;
    readonly invoiceTypeTitle: string;
    readonly chapterTitle: string;
    readonly invoiceTotal: string;
    readonly amount: string;
    /** فاکتور ترکیبی بوده و فقط بخشی از مبلغش به این مقصد می‌رود. */
    readonly isPartial: boolean;
  }[];
}

/**
 * کلید مقصد در **بدنه** می‌رود و نه در نشانی: شبا و شناسهٔ قبض در آن هستند و نشانی
 * صفحه جای داده‌ای نیست که در تاریخچهٔ مرورگر و لاگ بماند.
 */
export function useBeneficiaryDetails() {
  return useMutation({
    mutationFn: ({ documentId, key }: { documentId: string; key: string }) =>
      apiFetch<BeneficiaryDetails>(`/reports/documents/${documentId}/beneficiaries/details`, {
        method: 'POST',
        json: { key },
      }),
  });
}

export function useSetProductType(reportTypeKey: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      vendorId,
      ...body
    }: {
      vendorId: string;
      productTypeId?: string | null;
      customTitle?: string | null;
    }) =>
      apiFetch<{ id: string | null; title: string }>(
        `/reports/documents/${documentId}/vendors/${vendorId}/product-type`,
        { method: 'POST', json: body },
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
  textOverrides: TextOverrides = {},
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
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
      },
      // همان متن‌هایی که روی صفحه دیده می‌شوند، در فایل هم می‌نشینند.
      body: JSON.stringify({ textOverrides }),
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
