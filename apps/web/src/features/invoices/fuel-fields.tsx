import { useState } from 'react';
import {
  calculateFuelInvoice,
  daysInJalaliMonth,
  formatJalali,
  resolveFuelEntries,
  type Money,
} from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { MoneyInput } from '../../shared/ui/money-input';
import { Select } from '../../shared/ui/select';
import { VehicleDialog } from '../base-data/vehicle-dialog';
import { LookupQuickDialog } from '../base-data/lookup-quick-dialog';
import { JalaliMonthPicker } from '../../shared/ui/jalali-month-picker';
import { formatMoney, toPersianDigits } from '../../shared/format/money';
import { useVehicleSearch } from './invoices.api';
import { safePreview } from './invoice-preview';

export interface FuelEntryDraft {
  /** شناسه فقط برای کلید React؛ به سرور نمی‌رود. */
  readonly key: string;
  readonly day: number | null;
  readonly amount: string;
}

export interface FuelDraft {
  readonly vehicleTypeId: string;
  readonly vehicleId: string;
  readonly fuelTypeId: string;
  readonly jalaliYear: number;
  readonly jalaliMonth: number;
  readonly entries: readonly FuelEntryDraft[];
}

export function emptyFuelDraft(jalaliYear: number): FuelDraft {
  return {
    vehicleTypeId: '',
    vehicleId: '',
    fuelTypeId: '',
    jalaliYear,
    jalaliMonth: 1,
    entries: [newEntry()],
  };
}

function newEntry(): FuelEntryDraft {
  return { key: crypto.randomUUID(), day: null, amount: '' };
}

/**
 * فرم فاکتور سوخت.
 *
 * ترتیب فیلدها عمدی است و همان ترتیب تصمیم‌گیری کاربر است: نوع خودرو (جست‌وجوپذیر)
 * ⇒ پلاک‌های **همان** نوع ⇒ نوع سوخت ⇒ ماه شمسی ⇒ ردیف‌های روز/مبلغ.
 *
 * اعتبار روز دو بار بررسی می‌شود: اینجا برای بازخورد فوری، و در سرور به‌عنوان مرجع.
 * هر دو از یک تابع در `@dm/shared` استفاده می‌کنند، پس پیام‌ها واگرا نمی‌شوند.
 */
export function FuelFields({
  draft,
  onChange,
  vehicleTypes,
  fuelTypes,
  initialPlateSearch = '',
}: {
  /** پلاکِ از پیش انتخاب‌شده (ویرایش فاکتور). */
  initialPlateSearch?: string;
  draft: FuelDraft;
  onChange: (next: FuelDraft) => void;
  vehicleTypes: ReadonlyArray<{ id: string; title: string }>;
  fuelTypes: ReadonlyArray<{ id: string; title: string }>;
}): JSX.Element {
  /*
    متن جست‌وجوی پلاک.

    در ویرایش با مقدار پلاکِ ثبت‌شده شروع می‌شود: فهرست پلاک‌ها سمت سرور جست‌وجو
    می‌شود و بدون این، گزینهٔ انتخاب‌شده در نتیجهٔ خالیِ اول نیست و کادر خالی
    به‌نظر می‌رسد.
  */
  const [plateSearch, setPlateSearch] = useState(initialPlateSearch);
  /** گفت‌وگوی ساخت سریع: پلاک، نوع خودرو یا نوع سوخت. */
  const [quick, setQuick] = useState<'vehicle' | 'vehicle-type' | 'fuel-type' | null>(null);
  const vehicles = useVehicleSearch(draft.vehicleTypeId, plateSearch);

  const monthLength = safePreview(() => daysInJalaliMonth(draft.jalaliYear, draft.jalaliMonth));

  // جمع فاکتور از همان تابع سرور می‌آید، نه جمع دستی در JSX.
  const totals = safePreview(() =>
    calculateFuelInvoice(
      draft.entries
        .filter((entry) => entry.amount !== '')
        .map((entry) => BigInt(entry.amount) as Money),
    ),
  );

  const dayProblems = collectDayProblems(draft);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {/* فهرست انواع خودرو کوتاه است و در bootstrap آمده؛ جست‌وجویش محلی است. */}
        <Select
          label="نوع خودرو"
          required
          prefsKey="vehicle-type"
          value={draft.vehicleTypeId}
          options={vehicleTypes.map((type) => ({ value: type.id, label: type.title }))}
          onChange={(vehicleTypeId) => {
            // تغییر نوع خودرو، پلاک انتخاب‌شده را بی‌اعتبار می‌کند.
            setPlateSearch('');
            onChange({ ...draft, vehicleTypeId, vehicleId: '' });
          }}
          onCreate={() => setQuick('vehicle-type')}
          createLabel="افزودن نوع خودرو"
          hint="ابتدا نوع خودرو، سپس پلاک‌های همان نوع"
        />

        <Select
          label="پلاک"
          required
          disabled={draft.vehicleTypeId === ''}
          prefsKey="vehicle-plate"
          remoteSearch={{
            search: plateSearch,
            onSearchChange: setPlateSearch,
            loading: vehicles.isFetching,
            total: vehicles.data?.total,
          }}
          value={draft.vehicleId}
          options={(vehicles.data?.items ?? []).map((vehicle) => ({
            value: vehicle.id,
            // پلاک هم مثل بقیهٔ ارقام سامانه با ارقام فارسی دیده می‌شود.
            label: toPersianDigits(vehicle.plateNumber),
            description: vehicle.notes ?? undefined,
          }))}
          onChange={(vehicleId) => onChange({ ...draft, vehicleId })}
          emptyLabel={
            draft.vehicleTypeId === ''
              ? 'ابتدا نوع خودرو را انتخاب کنید'
              : 'برای این نوع خودرو پلاکی ثبت نشده است'
          }
          // ساخت پلاک تازه فقط وقتی معنا دارد که نوعش معلوم باشد.
          {...(draft.vehicleTypeId === ''
            ? {}
            : { onCreate: () => setQuick('vehicle'), createLabel: 'افزودن پلاک' })}
        />

        <Select
          label="نوع سوخت"
          required
          value={draft.fuelTypeId}
          onChange={(nextValue) => onChange({ ...draft, fuelTypeId: nextValue })}
          options={fuelTypes.map((type) => ({ value: type.id, label: type.title }))}
          onCreate={() => setQuick('fuel-type')}
          createLabel="افزودن نوع سوخت"
        />
      </div>

      {quick === 'vehicle' ? (
        <VehicleDialog
          vehicle={null}
          defaultVehicleTypeId={draft.vehicleTypeId}
          onClose={() => setQuick(null)}
          onSaved={(created) => {
            // پلاک تازه بی‌درنگ انتخاب می‌شود؛ جست‌وجوی پلاک سمت سرور است، پس متن
            // جست‌وجو هم روی همان پلاک گذاشته می‌شود تا در فهرست باشد.
            setPlateSearch(created.plateNumber);
            onChange({ ...draft, vehicleId: created.id });
            setQuick(null);
          }}
        />
      ) : null}

      {quick === 'vehicle-type' ? (
        <LookupQuickDialog
          resource="vehicle-types"
          titleFa="نوع خودرو"
          onClose={() => setQuick(null)}
          onCreated={(created) => {
            setPlateSearch('');
            onChange({ ...draft, vehicleTypeId: created.id, vehicleId: '' });
            setQuick(null);
          }}
        />
      ) : null}

      {quick === 'fuel-type' ? (
        <LookupQuickDialog
          resource="fuel-types"
          titleFa="نوع سوخت"
          onClose={() => setQuick(null)}
          onCreated={(created) => {
            onChange({ ...draft, fuelTypeId: created.id });
            setQuick(null);
          }}
        />
      ) : null}

      <JalaliMonthPicker
        year={draft.jalaliYear}
        month={draft.jalaliMonth}
        onChange={({ year, month }) => onChange({ ...draft, jalaliYear: year, jalaliMonth: month })}
      />

      <div className="rounded-md border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h4 className="text-sm font-medium">ردیف‌های سوخت‌گیری</h4>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...draft, entries: [...draft.entries, newEntry()] })}
          >
            افزودن ردیف
          </Button>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-16 px-3 py-2 text-start">ردیف</th>
              <th className="w-32 px-3 py-2 text-start">روز</th>
              <th className="px-3 py-2 text-start">مبلغ</th>
              <th className="w-28 px-3 py-2 text-start">تاریخ</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {draft.entries.map((entry, index) => (
              <tr key={entry.key} className="border-t border-border align-top">
                <td className="px-3 py-2 money">{toPersianDigits(String(index + 1))}</td>
                <td className="px-3 py-2">
                  <Select
                    aria-label={`روز ردیف ${index + 1}`}
                    value={entry.day === null ? '' : String(entry.day)}
                    onChange={(nextValue) =>
                      updateEntry(draft, onChange, index, {
                        day: nextValue === '' ? null : Number(nextValue),
                      })
                    }
                    // گزینه‌های روز از طول **همان ماه** می‌آیند، پس روز ناموجود حتی
                    // قابل انتخاب نیست؛ سرور هم جداگانه ردش می‌کند.
                    options={Array.from({ length: monthLength ?? 31 }, (_, dayIndex) => ({
                      value: String(dayIndex + 1),
                      label: toPersianDigits(String(dayIndex + 1)),
                    }))}
                  />
                </td>
                <td className="px-3 py-2">
                  <MoneyInput
                    value={entry.amount}
                    onChange={(amount) => updateEntry(draft, onChange, index, { amount })}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {entry.day === null ? '—' : safeJalali(draft, entry.day)}
                </td>
                <td className="px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={draft.entries.length === 1}
                    onClick={() =>
                      onChange({
                        ...draft,
                        entries: draft.entries.filter((_, position) => position !== index),
                      })
                    }
                  >
                    حذف
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border bg-muted/30">
            <tr>
              <td className="px-3 py-2 font-medium" colSpan={2}>
                جمع
              </td>
              <td className="px-3 py-2 font-bold money" colSpan={3}>
                {totals ? formatMoney(totals.total.toString()) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {dayProblems.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {dayProblems.map((problem) => (
            <li key={problem}>• {problem}</li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-muted-foreground">
        فاکتور سوخت مالیات و تخفیف ندارد؛ جمع فاکتور همان مجموع ردیف‌هاست.
      </p>
    </div>
  );
}

function updateEntry(
  draft: FuelDraft,
  onChange: (next: FuelDraft) => void,
  index: number,
  patch: Partial<FuelEntryDraft>,
): void {
  onChange({
    ...draft,
    entries: draft.entries.map((entry, position) =>
      position === index ? { ...entry, ...patch } : entry,
    ),
  });
}

function safeJalali(draft: FuelDraft, day: number): string {
  const text = safePreview(() =>
    formatJalali({ year: draft.jalaliYear, month: draft.jalaliMonth, day }),
  );
  return text ?? 'تاریخ نامعتبر';
}

/**
 * پیام‌های روز نامعتبر از **همان** تابع سرور می‌آیند، تا متن خطای فرم و خطای ثبت
 * یکی باشد.
 */
function collectDayProblems(draft: FuelDraft): string[] {
  const filled = draft.entries.filter((entry) => entry.day !== null && entry.amount !== '');
  if (filled.length === 0) return [];

  try {
    resolveFuelEntries(
      draft.jalaliYear,
      draft.jalaliMonth,
      filled.map((entry) => ({ day: entry.day as number, amount: BigInt(entry.amount) as Money })),
    );
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : 'ردیف‌های سوخت‌گیری معتبر نیستند'];
  }
}
