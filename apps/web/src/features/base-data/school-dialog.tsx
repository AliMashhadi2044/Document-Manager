import { useState, type FormEvent } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Toggle } from '../../shared/ui/toggle';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage } from '../../shared/format/money';
import { useBootstrap } from './base-data.api';
import { useCreateSchool, useUpdateSchool, type SchoolRow } from './schools.api';
import { LookupQuickDialog } from './lookup-quick-dialog';

/**
 * ساخت و اصلاح مدرسه — هم در صفحهٔ اطلاعات پایه و هم **وسط ثبت فاکتور**.
 *
 * یک کامپوننت برای هر دو جا: اگر فرمِ وسط کار نسخهٔ کوچک‌شدهٔ خودش را داشت، همان
 * فیلدی که در صفحهٔ اصلی اجباری است اینجا جا می‌افتاد و رکورد ناقص ساخته می‌شد.
 *
 * ناحیه خودش ممکن است وجود نداشته باشد؛ پس از همین‌جا هم ساختنی است — وگرنه زنجیرهٔ
 * «برای ساختن مدرسه باید اول از فرم بیرون بروم» یک حلقه عقب‌تر تکرار می‌شد.
 */
export function SchoolDialog({
  school,
  defaultDistrictId,
  onClose,
  onSaved,
}: {
  school: SchoolRow | null;
  defaultDistrictId?: string;
  onClose: () => void;
  /** شناسهٔ رکورد ساخته‌شده، تا فراخواننده بتواند همان را انتخاب کند. */
  onSaved: (school: SchoolRow, message: string) => void;
}): JSX.Element {
  const bootstrap = useBootstrap();
  const create = useCreateSchool();
  const update = useUpdateSchool();

  const [districtId, setDistrictId] = useState(school?.districtId ?? defaultDistrictId ?? '');
  const [title, setTitle] = useState(school?.title ?? '');
  const [code, setCode] = useState(school?.code ?? '');
  const [isActive, setIsActive] = useState(school?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(school?.sortOrder ?? 0));
  const [newDistrict, setNewDistrict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    const payload = {
      districtId,
      title: title.trim(),
      code: code.trim(),
      isActive,
      sortOrder: Number(sortOrder) || 0,
    };

    const action = school
      ? update.mutateAsync({ id: school.id, ...payload })
      : create.mutateAsync(payload);

    void action.then(
      (saved) => onSaved(saved, school ? 'مدرسه اصلاح شد.' : 'مدرسه ثبت شد.'),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <>
      <Modal title={school ? 'اصلاح مدرسه' : 'مدرسهٔ جدید'} onClose={onClose}>
        <form className="grid gap-x-5 gap-y-4 md:grid-cols-2" onSubmit={submit}>
          <div className="md:col-span-2">
            <Select
              label="ناحیه"
              required
              placeholder={null}
              value={districtId}
              onChange={setDistrictId}
              options={(bootstrap.data?.districts ?? []).map((district) => ({
                value: district.id,
                label: district.title,
              }))}
              emptyLabel={bootstrap.isPending ? 'در حال بارگذاری…' : 'ناحیه‌ای ثبت نشده است'}
              onCreate={() => setNewDistrict(true)}
              createLabel="افزودن ناحیهٔ تازه"
              hint="مدرسه زیر یک ناحیه ثبت می‌شود؛ همین ناحیه در فاکتور انشعابات می‌نشیند."
            />
          </div>

          <div className="md:col-span-2">
            <Input
              label="نام مدرسه"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              hint="نام کامل، همان‌طور که روی قبض یا سند می‌آید."
            />
          </div>

          <Input
            label="کد مدرسه"
            dir="ltr"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            hint="اختیاری"
          />

          <Input
            label="ترتیب نمایش"
            inputMode="numeric"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value.replace(/\D/gu, ''))}
            hint="عدد کوچک‌تر، بالاتر در فهرست."
          />

          <div className="flex items-center md:col-span-2">
            <Toggle
              checked={isActive}
              onChange={setIsActive}
              label="فعال — در فهرست انتخاب فاکتور انشعابات دیده می‌شود"
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

          <div className="md:col-span-2 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button type="submit" loading={busy} disabled={districtId === '' || title.trim() === ''}>
              {school ? 'ثبت اصلاح' : 'ثبت مدرسه'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              انصراف
            </Button>
          </div>
        </form>
      </Modal>

      {newDistrict ? (
        <LookupQuickDialog
          resource="districts"
          titleFa="ناحیه"
          onClose={() => setNewDistrict(false)}
          onCreated={(created) => {
            setDistrictId(created.id);
            setNewDistrict(false);
          }}
        />
      ) : null}
    </>
  );
}
