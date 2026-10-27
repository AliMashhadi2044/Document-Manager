import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, API_BASE } from '../../shared/api/client';

export interface OrganizationDto {
  readonly id: number;
  readonly name: string;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly phone: string | null;
  readonly fax: string | null;
  readonly logoPath: string | null;
  /** سال‌های پیش‌فرض فرم ایجاد سند؛ `null` یعنی تنظیم نشده. */
  readonly defaultFiscalYear: number | null;
  readonly defaultJalaliYear: number | null;
}

interface BootstrapDto {
  readonly organization: OrganizationDto | null;
}

export const organizationKeys = {
  bootstrap: ['base-data', 'bootstrap'] as const,
};

/**
 * اطلاعات سازمان از همان `bootstrap` اطلاعات پایه می‌آید.
 *
 * درخواست جداگانه‌ای برای نشان زده نمی‌شود: وجود یا نبودِ نشان از `logoPath` معلوم
 * است و خود تصویر با یک `<img>` از endpoint سرو می‌شود، یعنی مرورگر خودش کشش را
 * مدیریت می‌کند.
 */
export function useOrganization() {
  return useQuery({
    queryKey: organizationKeys.bootstrap,
    queryFn: () => apiFetch<BootstrapDto>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
    select: (data) => data.organization,
  });
}

/**
 * نشانی تصویر نشان.
 *
 * `version` در query string عمدی است: پس از جایگزینی نشان، نشانی باید **عوض شود**
 * وگرنه مرورگر همان تصویر قبلی را از کش نشان می‌دهد و کاربر فکر می‌کند بارگذاری
 * کار نکرده است.
 */
export function organizationLogoUrl(version: string | number): string {
  return `${API_BASE}/base-data/organization/logo?v=${encodeURIComponent(String(version))}`;
}

export function useUploadLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return apiFetch<{ hasLogo: true }>('/base-data/organization/logo', {
        method: 'POST',
        body,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: organizationKeys.bootstrap });
    },
  });
}

/** ذخیرهٔ سال‌های پیش‌فرض سازمان. */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name?: string;
      addressLine?: string | null;
      postalCode?: string | null;
      phone?: string | null;
      fax?: string | null;
      defaultFiscalYear?: number | null;
      defaultJalaliYear?: number | null;
    }) => apiFetch<OrganizationDto>('/base-data/organization', { method: 'PATCH', json: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: organizationKeys.bootstrap });
    },
  });
}

export function useRemoveLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<{ hasLogo: false }>('/base-data/organization/logo', { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: organizationKeys.bootstrap });
    },
  });
}
