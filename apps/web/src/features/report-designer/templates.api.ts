import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TemplateV1 } from '@dm/report-engine';

import { apiFetch, type ApiErrorDetail } from '../../shared/api/client';
import type { ReportPreview } from '../reports/reports.api';

/**
 * مسیرهای طراح قالب گزارش (فاز ۷).
 *
 * یک قاعده در همه این مسیرها دیده می‌شود: **قالب هرگز همراه درخواست اجرا نمی‌رود.**
 * طراح، پیش‌نویس را ذخیره می‌کند و بعد با **شناسه نسخه** پیش‌نمایش می‌گیرد. اگر قالب از
 * بدنه درخواست اجرا می‌شد، هر کاربری می‌توانست قالبی بسازد که به داده‌ای اشاره کند که
 * حق دیدنش را ندارد و تنها دفاع، اعتبارسنجی همان لحظه می‌بود.
 *
 * تنها استثنا `templates/check` است که **چیزی اجرا نمی‌کند**: فقط می‌گوید این ساختار
 * معتبر است یا نه، تا طراح خطا را پیش از ذخیره نشان دهد.
 */

export interface TemplateListRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly isSystem: boolean;
  /** همین قالب است که با کلید نوع گزارش اجرا می‌شود؟ */
  readonly isActive: boolean;
  readonly reportType: { readonly key: string; readonly titleFa: string };
  readonly currentVersion:
    | { readonly id: string; readonly versionNo: number; readonly publishedAt: string | null }
    | null;
  readonly createdBy: { readonly id: string; readonly fullName: string } | null;
  readonly versionCount: number;
  readonly runCount: number;
  readonly updatedAt: string;
}

export interface TemplateVersionRow {
  readonly id: string;
  readonly versionNo: number;
  readonly status: 'DRAFT' | 'PUBLISHED';
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly createdBy: { readonly id: string; readonly fullName: string } | null;
}

export interface TemplateDetail {
  readonly id: string;
  readonly name: string;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly reportType: {
    readonly key: string;
    readonly titleFa: string;
    readonly dataScopeKey: string;
  };
  readonly currentVersionId: string | null;
  readonly versions: readonly TemplateVersionRow[];
}

export interface TemplateVersionContent {
  readonly id: string;
  readonly versionNo: number;
  readonly status: 'DRAFT' | 'PUBLISHED';
  readonly definitionId: string;
  readonly template: TemplateV1;
}

export interface DataSourceDto {
  readonly key: string;
  readonly titleFa: string;
  readonly cardinality: 'single' | 'list';
  readonly fields: readonly {
    readonly key: string;
    readonly titleFa: string;
    readonly type: 'money' | 'integer' | 'text' | 'date' | 'jalaliDate' | 'boolean';
  }[];
}

export const templateKeys = {
  list: (includeArchived: boolean) => ['report-templates', 'list', includeArchived] as const,
  detail: (definitionId: string) => ['report-templates', 'detail', definitionId] as const,
  version: (versionId: string) => ['report-templates', 'version', versionId] as const,
  dataSources: ['report-templates', 'data-sources'] as const,
};

export function useTemplateList(includeArchived: boolean) {
  return useQuery({
    queryKey: templateKeys.list(includeArchived),
    queryFn: () =>
      apiFetch<readonly TemplateListRow[]>(
        `/reports/definitions${includeArchived ? '?includeArchived=true' : ''}`,
      ),
  });
}

export function useArchiveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ definitionId }: { definitionId: string }) =>
      apiFetch<{ id: string; status: 'ARCHIVED' }>(
        `/reports/definitions/${definitionId}/archive`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['report-templates', 'list'] });
    },
  });
}

export function useTemplateDetail(definitionId: string | null) {
  return useQuery({
    queryKey: templateKeys.detail(definitionId ?? ''),
    queryFn: () => apiFetch<TemplateDetail>(`/reports/definitions/${definitionId as string}`),
    enabled: definitionId !== null,
  });
}

export function useTemplateVersion(versionId: string | null) {
  return useQuery({
    queryKey: templateKeys.version(versionId ?? ''),
    queryFn: () =>
      apiFetch<TemplateVersionContent>(`/reports/versions/${versionId as string}`),
    enabled: versionId !== null,
    // قالب نسخه منتشرشده تغییرناپذیر است و پیش‌نویس هم فقط با ذخیره خودِ ما عوض می‌شود.
    staleTime: 60_000,
  });
}

/**
 * منابع داده مجاز **برای همین کاربر**.
 *
 * فهرست از سرور می‌آید و با مجوزهای کاربر فیلتر شده است؛ پس مرورگر فهرست مسیرهایی را
 * که حق دیدنشان را ندارد، حتی نمی‌بیند. این فقط یک راحتی رابط کاربری نیست — نشان دادن
 * نام ستون‌هایی که کاربر به آن‌ها دسترسی ندارد، خودش افشای اطلاعات است.
 */
export function useDataSources() {
  return useQuery({
    queryKey: templateKeys.dataSources,
    queryFn: () => apiFetch<readonly DataSourceDto[]>('/reports/data-sources'),
    staleTime: 10 * 60_000,
  });
}

export interface SignatoryRole {
  readonly roleKey: string;
  readonly fullName: string;
  readonly positionTitle: string;
}

/**
 * نقش‌های امضاکننده.
 *
 * قالب تنها `roleKey` را نگه می‌دارد؛ نام و سمت در لحظه تولید خروجی snapshot می‌شوند.
 * این فهرست برای **انتخاب نقش** است و نامی را در قالب ذخیره نمی‌کند.
 */
export function useSignatories() {
  return useQuery({
    queryKey: ['report-templates', 'signatories'] as const,
    queryFn: () => apiFetch<readonly SignatoryRole[]>('/reports/signatories'),
    staleTime: 5 * 60_000,
  });
}

export function useCopyTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ definitionId, name }: { definitionId: string; name: string }) =>
      apiFetch<{ id: string; name: string }>(`/reports/definitions/${definitionId}/copy`, {
        method: 'POST',
        json: { name },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['report-templates', 'list'] });
    },
  });
}

/**
 * «این گزارش را ویرایش کن» — سرور خودش تصمیم می‌گیرد کپی لازم است یا نه.
 *
 * کاربر دیگر لازم نیست بداند «قالب سیستمی» یعنی چه و چرا باید ازش کپی بگیرد.
 */
export function useEditableTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (definitionId: string) =>
      apiFetch<{ definitionId: string; created: boolean }>(
        `/reports/definitions/${definitionId}/editable`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['report-templates', 'list'] });
    },
  });
}

export function useRenameTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ definitionId, name }: { definitionId: string; name: string }) =>
      apiFetch<{ id: string; name: string }>(`/reports/definitions/${definitionId}`, {
        method: 'PATCH',
        json: { name },
      }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['report-templates', 'list'] });
      void queryClient.invalidateQueries({
        queryKey: templateKeys.detail(variables.definitionId),
      });
    },
  });
}

export function useSaveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      definitionId,
      template,
    }: {
      definitionId: string;
      template: TemplateV1;
    }) =>
      apiFetch<{ id: string; versionNo: number; status: 'DRAFT' | 'PUBLISHED' }>(
        `/reports/definitions/${definitionId}/draft`,
        { method: 'POST', json: { template } },
      ),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: templateKeys.detail(variables.definitionId),
      });
      void queryClient.invalidateQueries({ queryKey: templateKeys.version(result.id) });
    },
  });
}

export function usePublishVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      activate,
    }: {
      versionId: string;
      definitionId: string;
      /** همان‌جا قالب را قالبِ فعالِ این نوع گزارش هم بکن. */
      activate: boolean;
    }) =>
      apiFetch<{
        id: string;
        versionNo: number;
        status: 'PUBLISHED';
        becameActive: boolean;
      }>(`/reports/versions/${versionId}/publish`, {
        method: 'POST',
        json: { activate },
        // انتشار دوباره با یک کلید، دو نسخه نمی‌سازد (ریسک R8).
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['report-templates', 'list'] });
      void queryClient.invalidateQueries({
        queryKey: templateKeys.detail(variables.definitionId),
      });
    },
  });
}

export function useActivateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ definitionId }: { definitionId: string }) =>
      apiFetch<{ definitionId: string; reportTypeKey: string; isActive: true }>(
        `/reports/definitions/${definitionId}/activate`,
        { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } },
      ),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['report-templates', 'list'] });
      void queryClient.invalidateQueries({
        queryKey: templateKeys.detail(variables.definitionId),
      });
    },
  });
}

/**
 * اعتبارسنجی ساختار قالب روی سرور، بدون ذخیره.
 *
 * موتور در مرورگر هم همین بررسی را انجام می‌دهد (بسته ایزومورفیک است) ولی **مرجع،
 * سرور است**: فهرست مسیرهای مجاز و مجوزها آنجا هستند و قالبی که فقط مرورگر تأییدش
 * کرده باشد، چیزی را تضمین نمی‌کند.
 */
export function useCheckTemplate() {
  return useMutation<{ ok: true }, unknown, { template: unknown }>({
    mutationFn: ({ template }) =>
      apiFetch<{ ok: true }>('/reports/templates/check', {
        method: 'POST',
        json: { template },
      }),
  });
}

export function usePreviewVersion() {
  return useMutation({
    mutationFn: ({ versionId, documentId }: { versionId: string; documentId: string }) =>
      apiFetch<ReportPreview>(
        `/reports/versions/${versionId}/documents/${documentId}/preview`,
        { method: 'POST' },
      ),
  });
}

/** بازتولید یک خروجی تاریخی با همان نسخه قالبِ آن اجرا. */
export function useReproduceRun() {
  return useMutation({
    mutationFn: ({ runId }: { runId: string }) =>
      apiFetch<ReportPreview>(`/reports/runs/${runId}/reproduce`, { method: 'POST' }),
  });
}

/** جزئیات خطای اعتبارسنجی قالب، برای نمایش زیر هر فیلد. */
export function problemsOf(error: unknown): readonly ApiErrorDetail[] {
  if (error !== null && typeof error === 'object' && 'details' in error) {
    const details = (error as { details?: readonly ApiErrorDetail[] }).details;
    if (Array.isArray(details)) return details;
  }
  return [];
}
