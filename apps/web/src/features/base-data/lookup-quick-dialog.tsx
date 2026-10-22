import { useState, type FormEvent } from 'react';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Modal } from '../../shared/ui/modal';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage } from '../../shared/format/money';
import { useCreateLookup, type LookupItem } from './base-data.api';

/**
 * ساخت سریع یک قلم از فهرست‌های سادهٔ اطلاعات پایه، بدون خروج از فرم جاری.
 *
 * چرا یک کامپوننت برای هفت منبع: ساختار همه یکسان است (عنوان و ترتیب) و همان
 * رجیستری سمت سرور هم همین را می‌گوید. نوشتن هفت گفت‌وگوی تکراری فقط هفت جای
 * متفاوت برای واگرا شدن می‌ساخت.
 *
 * این گفت‌وگو عمداً **کم‌فیلد** است: مورد تازه فعال و با ترتیب پیش‌فرض ساخته می‌شود و
 * تنظیم بقیه در صفحهٔ اطلاعات پایه ممکن است. هدف، برنگرداندن کاربر از وسط سند است.
 */
export function LookupQuickDialog({
  resource,
  titleFa,
  onClose,
  onCreated,
}: {
  /** کلید منبع در رجیستری سرور، مثلاً `measurement-units`. */
  resource: string;
  /** نام فارسی مفرد، برای عنوان گفت‌وگو و برچسب فیلد. */
  titleFa: string;
  onClose: () => void;
  onCreated: (item: LookupItem) => void;
}): JSX.Element {
  const create = useCreateLookup(resource);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    void create.mutateAsync({ title: title.trim() }).then(
      (created) => onCreated(created),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <Modal title={`${titleFa} جدید`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Input
          label={`عنوان ${titleFa}`}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          hint="پس از ثبت، همین مورد در فهرست انتخاب می‌نشیند."
        />

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-border pt-4">
          <Button type="submit" loading={create.isPending} disabled={title.trim() === ''}>
            ثبت
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Modal>
  );
}
