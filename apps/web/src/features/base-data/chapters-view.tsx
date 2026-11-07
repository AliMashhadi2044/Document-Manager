import { useEffect, useState, type FormEvent } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import {
  parseInvoiceDefaults,
  parseReportSettings,
  type InvoiceDefaults,
  type ReportSettings,
} from '@dm/shared';

import { apiFetch } from '../../shared/api/client';
import { useCurrentUser } from '../auth/auth.api';
import {
  useBudgetCategories,
  useCreateChapter,
  useDeleteChapter,
  useInvoiceTypePaymentMethods,
  useInvoiceTypes,
  useLinkInvoiceType,
  useSetInvoiceTypePaymentMethods,
  useUnlinkInvoiceType,
  useUpdateChapter,
  type CategoryRow,
  type ChapterRow,
  type InvoiceTypeRef,
  useSetInvoiceDefaults,
  useSetReportSettings,
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

      <PaymentMethodsCard canWrite={canWrite} />
      <InvoiceDefaultsCard
        canWrite={user?.permissions.includes('financial_settings:write') ?? false}
      />
      <ReportSettingsCard
        canWrite={user?.permissions.includes('financial_settings:write') ?? false}
      />

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
/**
 * روش‌های پرداخت مجاز، به تفکیک **نوع فاکتور**.
 *
 * چرا اینجا و نه در «اطلاعات پایه»: این یک محدودیت روی نوع فاکتور است و نه یک قلم
 * داده؛ کنار همان جایی می‌نشیند که انواع فاکتور به فصل وصل می‌شوند.
 *
 * چرا اصلاً: «قبض» برای انشعابات معنا دارد و برای خرید کالا نه. بدون این فهرست،
 * جلوگیری از انتخاب اشتباه فقط به حواس کاربر بند بود.
 */
/**
 * پیش‌فرض مالیات ردیف‌های فاکتور.
 *
 * تا دیروز هر ردیف تازه با «درصدی، ۱۰٪» شروع می‌شد و سازمانی که فاکتورهایش
 * معاف است، همان عدد را در هر ردیف دستی صفر می‌کرد.
 *
 * مجوزش `financial_settings:write` است و نه `base_data:write`: این عدد به
 * محاسبهٔ مالیات می‌رسد و کسی که فهرست‌ها را نگه می‌دارد لزوماً اختیار تصمیم
 * مالی ندارد.
 */
function InvoiceDefaultsCard({ canWrite }: { canWrite: boolean }): JSX.Element | null {
  const bootstrap = useQuery({
    queryKey: ['base-data', 'bootstrap'],
    queryFn: () => apiFetch<{ invoiceDefaults?: unknown }>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
  });
  const save = useSetInvoiceDefaults();

  const [draft, setDraft] = useState<InvoiceDefaults | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
    پاسخ سرور **خوانده** می‌شود، نه باور.

    سرویسی که هنوز ارتقا نیافته این کلید را اصلاً نمی‌فرستد؛ نشاندن مستقیمِ آن
    در حالت، `undefined` می‌گذاشت و رندر بعدی روی `taxMode` می‌افتاد — یعنی کل
    صفحهٔ فصل‌ها با یک کلیدِ نیامده از کار می‌افتاد (مرز خطا گرفتش، ولی کاربر
    صفحه‌اش را از دست می‌داد). `parseInvoiceDefaults` هر ورودی‌ای را به مقدار
    معتبر برمی‌گرداند.
  */
  useEffect(() => {
    if (bootstrap.data) setDraft(parseInvoiceDefaults(bootstrap.data.invoiceDefaults));
  }, [bootstrap.data]);

  if (!canWrite || !draft) return null;

  const percentMode = draft.taxMode === 'PERCENT';

  return (
    <Card>
      <CardHeader
        icon="money"
        title="پیش‌فرض مالیات ردیف‌ها"
        description="ردیف تازهٔ هر فاکتور با همین مقدار شروع می‌شود؛ کاربر می‌تواند در همان ردیف عوضش کند."
      />
      <CardBody className="space-y-4">
        {message ? (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="حالت"
            className="min-w-44"
            value={draft.taxMode}
            onChange={(value) =>
              setDraft({ ...draft, taxMode: value as InvoiceDefaults['taxMode'] })
            }
            options={[
              { value: 'PERCENT', label: 'درصدی' },
              { value: 'AMOUNT', label: 'مبلغ ثابت (ریال)' },
            ]}
          />

          {percentMode ? (
            <Input
              label="نرخ پیش‌فرض (درصد)"
              dir="ltr"
              inputMode="decimal"
              className="max-w-40"
              value={draft.taxRateBp === null ? '' : String(draft.taxRateBp / 100)}
              onChange={(event) => {
                const text = event.target.value.trim();
                if (text === '') {
                  setDraft({ ...draft, taxRateBp: null });
                  return;
                }
                const percent = Number(text.replace(/[٪%]/gu, ''));
                if (!Number.isFinite(percent) || percent < 0 || percent > 100) return;
                // نرخ به basis point صحیح نگه داشته می‌شود، نه اعشار (ADR-0003).
                setDraft({ ...draft, taxRateBp: Math.round(percent * 100) });
              }}
              hint="خالی یعنی «نرخ سال مالی». صفر یعنی ردیف‌ها بدون مالیات شروع شوند."
            />
          ) : (
            <Input
              label="مبلغ پیش‌فرض (ریال)"
              dir="ltr"
              inputMode="numeric"
              className="max-w-52"
              value={draft.taxAmount}
              onChange={(event) =>
                setDraft({ ...draft, taxAmount: event.target.value.replace(/\D/gu, '') })
              }
              hint="خالی یعنی مبلغ در هر ردیف دستی وارد شود."
            />
          )}

          <Button
            loading={save.isPending}
            onClick={() => {
              setError(null);
              setMessage(null);
              void save.mutateAsync(draft).then(
                () => setMessage('پیش‌فرض مالیات ذخیره شد.'),
                (failure: unknown) =>
                  setError(
                    failure instanceof ApiError
                      ? formatServerMessage(failure.message)
                      : 'ذخیره ناموفق بود',
                  ),
              );
            }}
          >
            ذخیره
          </Button>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

/**
 * آستانهٔ علامت‌گذاری مبلغ در گزارش مالیات.
 *
 * عددی که اینجا نوشته می‌شود در هیچ محاسبه‌ای شرکت نمی‌کند؛ فقط به قالب می‌گوید
 * کدام سلول‌ها را خاکستری کند — یک **کمکِ خواندن** روی گزارشی که ممکن است صد ردیف
 * داشته باشد.
 *
 * چرا کنار پیش‌فرض‌های مالیات و با همان مجوز: هر دو دربارهٔ عددِ مالیات‌اند و
 * اختیارشان یکی است. گذاشتنش در طراح قالب یعنی هر تغییرِ آستانه، انتشار نسخهٔ
 * تازهٔ قالب — و قالبِ کپی‌شدهٔ هر کاربر عددِ خودش را نگه می‌داشت.
 */
function ReportSettingsCard({ canWrite }: { canWrite: boolean }): JSX.Element | null {
  const bootstrap = useQuery({
    queryKey: ['base-data', 'bootstrap'],
    queryFn: () => apiFetch<{ reportSettings?: unknown }>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
  });
  const save = useSetReportSettings();

  const [draft, setDraft] = useState<ReportSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // پاسخِ سرویسِ ارتقا‌نیافته این کلید را ندارد؛ `parseReportSettings` هر ورودی را
  // به مقدار معتبر برمی‌گرداند و صفحه با یک کلیدِ نیامده از کار نمی‌افتد.
  useEffect(() => {
    if (bootstrap.data) setDraft(parseReportSettings(bootstrap.data.reportSettings));
  }, [bootstrap.data]);

  if (!canWrite || !draft) return null;

  return (
    <Card>
      <CardHeader
        icon="money"
        title="علامت‌گذاری مبلغ در گزارش مالیات"
        description="ردیفی که جمع کلش از این مبلغ بیشتر باشد، سلول مبلغش پس‌زمینهٔ خاکستری می‌گیرد؛ خودِ عدد با همان رنگ همیشگی خوانده می‌شود."
      />
      <CardBody className="space-y-4">
        {message ? (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="آستانهٔ مبلغ (ریال)"
            dir="ltr"
            inputMode="numeric"
            className="max-w-60"
            value={draft.taxHighlightAbove}
            onChange={(event) =>
              setDraft({ taxHighlightAbove: event.target.value.replace(/\D/gu, '') })
            }
            hint="خالی یعنی خاموش؛ هیچ سلولی علامت نمی‌خورد."
          />

          <Button
            loading={save.isPending}
            onClick={() => {
              setError(null);
              setMessage(null);
              void save.mutateAsync(draft).then(
                () =>
                  setMessage(
                    draft.taxHighlightAbove === ''
                      ? 'علامت‌گذاری خاموش شد.'
                      : 'آستانهٔ علامت‌گذاری ذخیره شد.',
                  ),
                (failure: unknown) =>
                  setError(
                    failure instanceof ApiError
                      ? formatServerMessage(failure.message)
                      : 'ذخیره ناموفق بود',
                  ),
              );
            }}
          >
            ذخیره
          </Button>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function PaymentMethodsCard({ canWrite }: { canWrite: boolean }): JSX.Element | null {
  const types = useInvoiceTypes();
  const [editing, setEditing] = useState<InvoiceTypeRef | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if ((types.data ?? []).length === 0) return null;

  return (
    <Card>
      <CardHeader
        icon="money"
        title="روش‌های پرداخت مجاز"
        description="برای هر نوع فاکتور تعیین کنید کدام روش‌های پرداخت در فرم دیده شوند."
      />
      <CardBody>
        {message ? (
          <p role="status" className="mb-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}

        <ul className="divide-y divide-border">
          {(types.data ?? []).map((type) => (
            <li key={type.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={type.titleFa}>
                {type.titleFa}
              </span>
              <Badge tone="neutral">{INVOICE_KIND_LABELS[type.kind]}</Badge>

              {canWrite ? (
                <Button size="sm" variant="secondary" onClick={() => setEditing(type)}>
                  روش‌های پرداخت
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardBody>

      {editing ? (
        <PaymentMethodsDialog
          invoiceType={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      ) : null}
    </Card>
  );
}

function PaymentMethodsDialog({
  invoiceType,
  onClose,
  onSaved,
}: {
  invoiceType: InvoiceTypeRef;
  onClose: () => void;
  onSaved: (message: string) => void;
}): JSX.Element {
  const detail = useInvoiceTypePaymentMethods(invoiceType.id);
  const save = useSetInvoiceTypePaymentMethods();

  /*
    `null` یعنی هنوز از سرور نیامده. پس از آن، مجموعهٔ تیک‌خورده‌ها محلی نگه داشته
    می‌شود تا کاربر چند تیک را با هم عوض کند و یک‌بار ذخیره شود.
  */
  const [picked, setPicked] = useState<Set<string> | null>(null);
  /** روش پیش‌فرض؛ `''` یعنی پیش‌فرضی نیست. */
  const [preferred, setPreferred] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail.data) return;
    setPicked(
      new Set(
        detail.data.unrestricted
          ? []
          : detail.data.methods.filter((method) => method.allowed).map((method) => method.id),
      ),
    );
    setPreferred(detail.data.defaultPaymentMethodId ?? '');
  }, [detail.data]);

  const toggle = (id: string): void =>
    setPicked((current) => {
      const next = new Set(current ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /*
    برداشتن تیکِ روشی که پیش‌فرض است، پیش‌فرض را هم برمی‌دارد.

    وگرنه ذخیره با خطای سرور رد می‌شد («پیش‌فرض باید میان مجازها بماند») و کاربر
    باید خودش می‌فهمید کدام تیک مقصر است.
  */
  useEffect(() => {
    if (preferred !== '' && picked !== null && picked.size > 0 && !picked.has(preferred)) {
      setPreferred('');
    }
  }, [picked, preferred]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);

    void save
      .mutateAsync({
        invoiceTypeId: invoiceType.id,
        paymentMethodIds: [...(picked ?? [])],
        defaultPaymentMethodId: preferred === '' ? null : preferred,
      })
      .then(
        () =>
          onSaved(
            (picked?.size ?? 0) === 0
              ? 'محدودیت برداشته شد؛ همهٔ روش‌های پرداخت مجازند.'
              : 'روش‌های پرداخت مجاز ذخیره شد.',
          ),
        (failure: unknown) =>
          setError(
            failure instanceof ApiError ? formatServerMessage(failure.message) : 'ذخیره ناموفق بود',
          ),
      );
  };

  return (
    <Modal title={`روش‌های پرداخت «${invoiceType.titleFa}»`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        {detail.isPending ? (
          <p className="text-sm text-muted-foreground">در حال دریافت…</p>
        ) : detail.isError ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            دریافت روش‌های پرداخت ناموفق بود.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {(detail.data?.methods ?? []).map((method) => {
                // بی‌محدودیت بودن یعنی همه مجازند؛ پس همه می‌توانند پیش‌فرض شوند.
                const allowed = (picked?.size ?? 0) === 0 || (picked?.has(method.id) ?? false);

                return (
                  <li key={method.id}>
                    <div className="flex items-center gap-2.5 rounded-lg p-2 text-sm hover:bg-muted/50">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={picked?.has(method.id) ?? false}
                          onChange={() => toggle(method.id)}
                          className="size-4 rounded border-input accent-[var(--color-primary)]"
                        />
                        <span className="truncate">{method.titleFa}</span>
                      </label>

                      {/*
                        پیش‌فرض، یک دکمهٔ جدا کنار هر روش.

                        تیک «مجاز است» و «پیش‌فرض است» دو چیزند و با یک کنترل قابل
                        بیان نبودند: روشی می‌تواند مجاز باشد و پیش‌فرض نباشد، ولی
                        پیش‌فرضی که مجاز نباشد بی‌معناست.
                      */}
                      <Button
                        type="button"
                        size="sm"
                        variant={preferred === method.id ? 'secondary' : 'ghost'}
                        disabled={!allowed}
                        aria-pressed={preferred === method.id}
                        title={
                          allowed
                            ? preferred === method.id
                              ? 'پیش‌فرض است؛ برای برداشتن دوباره بزنید'
                              : 'این روش پیش‌فرض این نوع فاکتور شود'
                            : 'روشی که مجاز نیست نمی‌تواند پیش‌فرض باشد'
                        }
                        onClick={() =>
                          setPreferred((current) => (current === method.id ? '' : method.id))
                        }
                      >
                        {preferred === method.id ? '★ پیش‌فرض' : '☆'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              {(picked?.size ?? 0) === 0
                ? 'هیچ روشی تیک نخورده است: یعنی محدودیتی اعمال نمی‌شود و همهٔ روش‌های فعال در فرم دیده می‌شوند.'
                : 'فقط روش‌های تیک‌خورده در فرم این نوع فاکتور دیده می‌شوند.'}
              {' '}
              {preferred === ''
                ? 'بدون پیش‌فرض، فرم فاکتور روش پرداخت را خالی باز می‌کند.'
                : 'روش پیش‌فرض، در فرم این نوع فاکتور از پیش انتخاب می‌شود و کاربر می‌تواند عوضش کند.'}
            </p>
          </>
        )}

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 border-t border-border pt-4">
          <Button type="submit" loading={save.isPending} disabled={picked === null}>
            ذخیره
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Modal>
  );
}

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
