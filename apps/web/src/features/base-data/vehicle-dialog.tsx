import { useState, type FormEvent } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { PlateInput } from '../../shared/ui/plate-input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage } from '../../shared/format/money';
import { useBootstrap } from './base-data.api';
import { useCreateVehicle, useUpdateVehicle, type VehicleRow } from './vehicles.api';
import { LookupQuickDialog } from './lookup-quick-dialog';

/**
 * ساخت و اصلاح خودرو (پلاک) — هم در صفحهٔ خودروها و هم وسط ثبت فاکتور سوخت.
 *
 * نوع خودرو هم ممکن است نباشد و از همین‌جا ساختنی است؛ وگرنه زنجیرهٔ «برای ثبت
 * پلاک باید از فرم بیرون بروم» یک حلقه عقب‌تر تکرار می‌شد.
 */
export function VehicleDialog({
  vehicle,
  defaultVehicleTypeId,
  onClose,
  onSaved,
}: {
  vehicle: VehicleRow | null;
  defaultVehicleTypeId?: string;
  onClose: () => void;
  onSaved: (vehicle: VehicleRow, message: string) => void;
}): JSX.Element {
  const bootstrap = useBootstrap();
  const create = useCreateVehicle();
  const update = useUpdateVehicle();

  const [vehicleTypeId, setVehicleTypeId] = useState(
    vehicle?.vehicleTypeId ?? defaultVehicleTypeId ?? '',
  );
  const [plateNumber, setPlateNumber] = useState(vehicle?.plateNumber ?? '');
  const [notes, setNotes] = useState(vehicle?.notes ?? '');
  const [isActive, setIsActive] = useState(vehicle?.isActive ?? true);
  const [newType, setNewType] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    const payload = {
      vehicleTypeId,
      plateNumber: plateNumber.trim(),
      notes: notes.trim(),
      isActive,
    };

    const action = vehicle
      ? update.mutateAsync({ id: vehicle.id, ...payload })
      : create.mutateAsync(payload);

    void action.then(
      (saved) => onSaved(saved, vehicle ? 'خودرو اصلاح شد.' : 'خودرو ثبت شد.'),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <>
      <Modal title={vehicle ? 'اصلاح خودرو' : 'خودروی جدید'} onClose={onClose}>
        <form className="grid gap-x-5 gap-y-4 md:grid-cols-2" onSubmit={submit}>
          <Select
            label="نوع خودرو"
            required
            placeholder={null}
            value={vehicleTypeId}
            onChange={setVehicleTypeId}
            options={(bootstrap.data?.vehicleTypes ?? []).map((type) => ({
              value: type.id,
              label: type.title,
            }))}
            emptyLabel={bootstrap.isPending ? 'در حال بارگذاری…' : 'نوع خودرویی ثبت نشده است'}
            onCreate={() => setNewType(true)}
            createLabel="افزودن نوع خودرو"
          />

          <PlateInput required label="پلاک" value={plateNumber} onChange={setPlateNumber} />

          <div className="md:col-span-2">
            <Input
              label="یادداشت"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              hint="اختیاری — مثلاً واحد استفاده‌کننده."
            />
          </div>

          <div className="flex items-center md:col-span-2">
            <Toggle
              checked={isActive}
              onChange={setIsActive}
              label="فعال — در فهرست پلاک‌های فاکتور سوخت دیده می‌شود"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="md:col-span-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="md:col-span-2 flex gap-2 border-t border-border pt-4">
            <Button
              type="submit"
              loading={busy}
              disabled={vehicleTypeId === '' || plateNumber.trim() === ''}
            >
              {vehicle ? 'ثبت اصلاح' : 'ثبت خودرو'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              انصراف
            </Button>
          </div>
        </form>
      </Modal>

      {newType ? (
        <LookupQuickDialog
          resource="vehicle-types"
          titleFa="نوع خودرو"
          onClose={() => setNewType(false)}
          onCreated={(created) => {
            setVehicleTypeId(created.id);
            setNewType(false);
          }}
        />
      ) : null}
    </>
  );
}
