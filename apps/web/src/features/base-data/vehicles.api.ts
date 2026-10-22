import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../../shared/api/client';
import type { PageResult } from './base-data.api';

/**
 * خودروها — اطلاعات پایهٔ فاکتور سوخت.
 *
 * پلاک زیر یک **نوع خودرو** ثبت می‌شود و فرم سوخت هم اول نوع را می‌پرسد و بعد
 * پلاک‌های همان نوع را می‌آورد؛ پس فهرست همیشه نوع را هم برمی‌گرداند.
 */

export interface VehicleRow {
  readonly id: string;
  readonly vehicleTypeId: string;
  readonly plateNumber: string;
  readonly isActive: boolean;
  readonly notes: string | null;
  readonly vehicleType: { readonly id: string; readonly title: string };
}

export interface VehicleInput {
  readonly vehicleTypeId: string;
  readonly plateNumber: string;
  readonly isActive?: boolean;
  readonly notes?: string;
}

export const vehicleKeys = {
  all: ['base-data', 'vehicles'] as const,
  list: (page: number, search: string, vehicleTypeId: string, isActive: string) =>
    ['base-data', 'vehicles', 'list', page, search, vehicleTypeId, isActive] as const,
};

export function useVehicles(page: number, search: string, vehicleTypeId = '', isActive = '') {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set('search', search);
  if (vehicleTypeId) query.set('vehicleTypeId', vehicleTypeId);
  if (isActive) query.set('isActive', isActive);

  return useQuery({
    queryKey: vehicleKeys.list(page, search, vehicleTypeId, isActive),
    queryFn: () => apiFetch<PageResult<VehicleRow>>(`/base-data/vehicles?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateVehicles(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
    // فرم سوخت پلاک‌ها را با جست‌وجوی سمت سرور می‌گیرد؛ همان پیشوند کلید.
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  };
}

export function useCreateVehicle() {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (input: VehicleInput) =>
      apiFetch<VehicleRow>('/base-data/vehicles', { method: 'POST', json: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateVehicle() {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<VehicleInput> & { id: string }) =>
      apiFetch<VehicleRow>(`/base-data/vehicles/${id}`, { method: 'PATCH', json: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteVehicle() {
  const invalidate = useInvalidateVehicles();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/base-data/vehicles/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
