import { useState, type FormEvent } from 'react';
import { INVOICE_KIND_LABELS } from '@dm/shared';

import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Select } from '../../shared/ui/select';
import { Modal } from '../../shared/ui/modal';
import { Badge } from '../../shared/ui/badge';
import { Menu, MenuItem, MenuSeparator } from '../../shared/ui/menu';
import { Icon } from '../../shared/ui/icon';
import { Card, CardBody, CardHeader } from '../../shared/ui/card';
import { ErrorState, LoadingState } from '../../shared/ui/states';
import { ApiError } from '../../shared/api/client';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { useCurrentUser } from '../auth/auth.api';
import {
  useBudgetCategories,
  useCreateChapter,
  useDeleteChapter,
  useInvoiceTypes,
  useLinkInvoiceType,
  useUnlinkInvoiceType,
  useUpdateChapter,
  type CategoryRow,
  type ChapterRow,
} from './base-data.api';

/**
 * فصل‌های بودجه و انواع فاکتور مجازشان.
 *
 * این صفحه همان جایی است که تصمیم «با انتخاب این فصل، کدام فرم فاکتور باز شود»
 * گرفته می‌شود — و آن تصمیم **داده** است، نه شرطی در کد (docs/05-invoice-types.md §۴).
 *
 * دو قاعده که رفتار دکمه‌ها را توضیح می‌دهند:
 *
 *  - فصلی که در فاکتورهای ثبت‌شده به کار رفته **حذف نمی‌شود**؛ غیرفعال می‌شود.
 *    فاکتور عنوان فصل را snapshot دارد، ولی ارتباطش با رکورد هم نگه داشته می‌شود.
 *  - حذف یک اتصال، فاکتورهای گذشته را خراب نمی‌کند؛ فقط بر ایجاد فاکتور تازه اثر دارد.
 */
export function ChaptersView(): JSX.Element {
  const { data, isPending, isError, refetch } = useBudgetCategories();
  const { data: user } = useCurrentUser();
  const canWrite = user?.permissions.includes('base_data:write') ?? false;

  const [editing, setEditing] = useState<{ chapter: ChapterRow | null; category: CategoryRow } | null>(
    null,
  );
  const [linking, setLinking] = useState<ChapterRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const update = useUpdateChapter();
  const remove = useDeleteChapter();
  const unlink = useUnlinkInvoiceType();

  const act = (action: Promise<unknown>, done: string): void => {
    setMessage(null);
    void action.then(
      () => setMessage(done),
      (error: unknown) =>
        setMessage(error instanceof ApiError ? formatServerMessage(error.message) : 'انجام نشد'),
    );
  };

  if (isPending) return <LoadingState label="در حال بارگذاری فصل‌ها…" />;
  if (isError) {
    return <ErrorState message="دریافت فصل‌ها ناموفق بود" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}

      {!canWrite ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          برای تغییر فصل‌ها به مجوز «نوشتن اطلاعات پایه» نیاز است؛ این صفحه برای شما فقط خواندنی است.
        </p>
      ) : null}

      {data.map((category) => (
        <Card key={category.id}>
          <CardHeader
            icon="layers"
            title={category.titleFa}
            description={`${toPersianDigits(String(category.chapters.length))} فصل`}
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setEditing({ chapter: null, category })}>
                  <Icon name="plus" size={15} />
                  فصل جدید
                </Button>
              ) : undefined
            }
          />

          <CardBody className="pt-0">
            {category.chapters.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                این گروه هنوز فصلی ندارد.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {category.chapters.map((chapter) => (
                  <li key={chapter.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="min-w-40 font-medium">{chapter.title}</span>

                      <span className="money text-xs text-muted-foreground">
                        {chapter.code ? `کد: ${toPersianDigits(chapter.code)}` : 'بدون کد'}
                      </span>

                      {!chapter.isActive ? <Badge tone="neutral">غیرفعال</Badge> : null}

                      <span className="text-xs text-muted-foreground">
                        <span className="money">{toPersianDigits(String(chapter.invoiceCount))}</span>{' '}
                        فاکتور
                      </span>

                      {/*
                        همهٔ کنش‌ها در یک منو، نه چهار دکمه در هر ردیف.

                        با چند دکمهٔ برچسب‌دار در هر ردیف، چشم کاربر پیش از آنکه عنوان فصل را
                        بخواند، با چهار کنش روبه‌رو می‌شود — و آن کنش‌ها چیزی نیستند که هر بار لازم‌اند.
                      */}
                      {canWrite ? (
                        <div className="ms-auto">
                          <Menu
                            align="end"
                            label={`کنش‌های ${chapter.title}`}
                            triggerLabel={`کنش‌های ${chapter.title}`}
                            triggerTitle="کنش‌ها"
                            trigger={<Icon name="more" size={18} />}
                          >
                            <MenuItem action onSelect={() => setEditing({ chapter, category })}>
                              <Icon name="edit" size={15} />
                              <span className="flex-1">اصلاح نام و کد</span>
                            </MenuItem>

                            <MenuItem action onSelect={() => setLinking(chapter)}>
                              <Icon name="plus" size={15} />
                              <span className="flex-1">اتصال نوع فاکتور</span>
                            </MenuItem>

                            <MenuSeparator />

                            <MenuItem
                              action
                              onSelect={() =>
                                act(
                                  update.mutateAsync({
                                    id: chapter.id,
                                    isActive: !chapter.isActive,
                                  }),
                                  chapter.isActive ? 'فصل غیرفعال شد.' : 'فصل فعال شد.',
                                )
                              }
                            >
                              <Icon name="power" size={15} />
                              <span className="flex-1">
                                {chapter.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
                              </span>
                            </MenuItem>

                            {/* حذف فقط برای فصل بی‌فاکتور؛ بقیه باید غیرفعال شوند. */}
                            {chapter.invoiceCount === 0 ? (
                              <MenuItem
                                action
                                className="text-destructive"
                                onSelect={() => {
                                  if (!window.confirm(`فصل «${chapter.title}» حذف شود؟`)) return;
                                  act(remove.mutateAsync(chapter.id), 'فصل حذف شد.');
                                }}
                              >
                                <Icon name="trash" size={15} />
                                <span className="flex-1">حذف فصل</span>
                              </MenuItem>
                            ) : null}
                          </Menu>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">انواع فاکتور مجاز:</span>

                      {chapter.invoiceTypes.length === 0 ? (
                        <Badge tone="danger">هیچ نوع فاکتوری متصل نیست</Badge>
                      ) : (
                        chapter.invoiceTypes.map((link) => (
                          <span
                            key={link.invoiceType.id}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                              link.isDefault
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground'
                            }`}
                            title={INVOICE_KIND_LABELS[link.invoiceType.kind]}
                          >
                            {link.invoiceType.titleFa}
                            {link.isDefault ? ' (پیش‌فرض)' : ''}
                            {canWrite ? (
                              <button
                                type="button"
                                aria-label={`حذف اتصال ${link.invoiceType.titleFa} از ${chapter.title}`}
                                onClick={() =>
                                  act(
                                    unlink.mutateAsync({
                                      chapterId: chapter.id,
                                      invoiceTypeId: link.invoiceType.id,
                                    }),
                                    'اتصال حذف شد.',
                                  )
                                }
                                className="rounded transition-colors hover:text-destructive"
                              >
                                <Icon name="close" size={12} />
                              </button>
                            ) : null}
                          </span>
                        ))
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ))}

      {editing ? (
        <ChapterDialog
          chapter={editing.chapter}
          category={editing.category}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      ) : null}

      {linking ? (
        <LinkDialog
          chapter={linking}
          onClose={() => setLinking(null)}
          onSaved={(text) => {
            setLinking(null);
            setMessage(text);
          }}
        />
      ) : null}
    </div>
  );
}

/** ایجاد و اصلاح فصل. */
function ChapterDialog({
  chapter,
  category,
  onClose,
  onSaved,
}: {
  chapter: ChapterRow | null;
  category: CategoryRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const create = useCreateChapter();
  const update = useUpdateChapter();

  const [title, setTitle] = useState(chapter?.title ?? '');
  const [code, setCode] = useState(chapter?.code ?? '');
  const [sortOrder, setSortOrder] = useState(String(chapter?.sortOrder ?? 0));
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    const payload = {
      title: title.trim(),
      code: code.trim(),
      sortOrder: Number(sortOrder) || 0,
    };

    const action = chapter
      ? update.mutateAsync({ id: chapter.id, ...payload })
      : create.mutateAsync({ categoryId: category.id, isActive: true, ...payload });

    void action.then(
      () => onSaved(chapter ? 'فصل اصلاح شد.' : 'فصل ساخته شد.'),
      (failure: unknown) =>
        setError(
          failure instanceof ApiError ? formatServerMessage(failure.message) : 'ثبت ناموفق بود',
        ),
    );
  };

  return (
    <Modal title={chapter ? 'اصلاح فصل' : `فصل جدید در ${category.titleFa}`} onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit}>
        <Input
          label="عنوان فصل"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          hint="عنوان در هر گروه بودجه باید یکتا باشد."
        />

        <Input
          label="کد فصل"
          dir="ltr"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          hint="اختیاری؛ در صورت وجود، در همان گروه یکتاست."
        />

        <Input
          label="ترتیب نمایش"
          inputMode="numeric"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value.replace(/\D/gu, ''))}
        />

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-border pt-4">
          <Button type="submit" loading={create.isPending || update.isPending}>
            {chapter ? 'ثبت اصلاح' : 'ساخت فصل'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>

      {chapter ? (
        <p className="mt-3 text-xs text-muted-foreground">
          عنوان فصل در فاکتورهای ثبت‌شده snapshot شده است؛ تغییر اینجا آن‌ها را عوض نمی‌کند.
        </p>
      ) : null}
    </Modal>
  );
}

/** اتصال یک نوع فاکتور به فصل. */
function LinkDialog({
  chapter,
  onClose,
  onSaved,
}: {
  chapter: ChapterRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const types = useInvoiceTypes();
  const link = useLinkInvoiceType();

  const [invoiceTypeId, setInvoiceTypeId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = new Set(chapter.invoiceTypes.map((item) => item.invoiceType.id));
  const options = (types.data ?? [])
    .filter((type) => !linked.has(type.id))
    .map((type) => ({
      value: type.id,
      label: type.titleFa,
      description: INVOICE_KIND_LABELS[type.kind],
    }));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    void link
      .mutateAsync({ chapterId: chapter.id, invoiceTypeId, isDefault, sortOrder: 0 })
      .then(
        () => onSaved('نوع فاکتور به فصل متصل شد.'),
        (failure: unknown) =>
          setError(
            failure instanceof ApiError ? formatServerMessage(failure.message) : 'اتصال ناموفق بود',
          ),
      );
  };

  return (
    <Modal title={`اتصال نوع فاکتور به «${chapter.title}»`} onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit}>
        <Select
          label="نوع فاکتور"
          required
          prefsKey="invoice-type-link"
          // گزینه خالی معنا ندارد: این فرم بدون انتخاب، کاری انجام نمی‌دهد.
          placeholder={null}
          value={invoiceTypeId}
          onChange={setInvoiceTypeId}
          options={options}
          emptyLabel={
            types.isPending ? 'در حال بارگذاری…' : 'همه انواع فاکتور به این فصل متصل‌اند'
          }
          hint="با انتخاب این فصل در فرم فاکتور، همین فهرست تعیین می‌کند کدام فرم باز شود."
        />

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
            className="size-4 rounded border-input accent-[var(--color-primary)]"
          />
          پیش‌فرضِ این فصل باشد
        </label>

        <p className="text-xs text-muted-foreground">
          اگر فصلی فقط یک نوع فاکتور داشته باشد، همان خودکار انتخاب می‌شود؛ با چند نوع، کاربر انتخاب
          می‌کند و پیش‌فرض اول فهرست می‌آید.
        </p>

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-border pt-4">
          <Button type="submit" loading={link.isPending} disabled={invoiceTypeId === ''}>
            اتصال
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Modal>
  );
}
