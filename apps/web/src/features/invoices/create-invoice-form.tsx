import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  INVOICE_KIND_REGISTRY,
  formatJalali,
  isoDateToJalali,
  jalaliToIsoDate,
  parseJalali,
  type InvoiceKind,
  type InvoiceLineModel,
} from '@dm/shared';

import { apiFetch, ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/button';
import { Card, CardHeader } from '../../shared/ui/card';
import { Input } from '../../shared/ui/input';
import { formatServerMessage, toPersianDigits } from '../../shared/format/money';
import { Select } from '../../shared/ui/select';
import { HELP_CLASS, LABEL_CLASS } from '../../shared/ui/field';
import { Segmented } from '../../shared/ui/segmented';
import { JalaliDatePicker } from '../../shared/ui/date-picker';
import { VendorDialog } from '../vendors/vendor-dialog';
import { useBudgetCategories } from '../base-data/base-data.api';
import {
  useChapterInvoiceTypes,
  useCreateInvoice,
  useInvoiceDraft,
  useUpdateInvoice,
  useVendorSearch,
  type ChapterInvoiceTypeOption,
  type CreateInvoicePayload,
  type InvoiceDetailsPayload,
} from './invoices.api';
import { ItemsFields, emptyItemsDraft, invoiceTaxToPayload, itemsToPayload, type ItemsDraft } from './items-fields';
import { UtilityFields, EMPTY_UTILITY, type UtilityDraft } from './utility-fields';
import { FuelFields, emptyFuelDraft, type FuelDraft } from './fuel-fields';
import { PaymentFields, EMPTY_PAYMENT, paymentToPayload, type PaymentDraft, type PaymentMethodRef } from './payment-fields';
import { detailsTotal, type RoundingPolicyRef } from './invoice-preview';

interface BootstrapData {
  readonly paymentMethods: readonly PaymentMethodRef[];
  readonly utilityTypes: ReadonlyArray<{ id: string; title: string }>;
  readonly fuelTypes: ReadonlyArray<{ id: string; title: string }>;
  readonly vehicleTypes: ReadonlyArray<{ id: string; title: string }>;
  readonly measurementUnits: ReadonlyArray<{ id: string; title: string }>;
}

/**
 * افزودن فاکتور به سند.
 *
 * **مسیر انتخاب فرم** — همان معیار پذیرش ۱ فاز ۴:
 *
 *   فصل ⇒ (درخواست به سرور) انواع فاکتور مجاز همان فصل ⇒ `kind` نوع انتخاب‌شده
 *        ⇒ `INVOICE_KIND_REGISTRY[kind].lineModel` ⇒ کامپوننت فرم
 *
 * هیچ شرطی روی **عنوان فصل** یا کلید نوع فاکتور نیست. اگر مدیر سامانه فردا فصلی با
 * نام دیگر بسازد و به نوع «انشعابات» وصلش کند، همین فرم باز می‌شود؛ و اگر فصلی به
 * دو نوع وصل باشد، کاربر انتخاب می‌کند (معیار پذیرش ۲).
 */
export function CreateInvoiceForm({
  documentId,
  documentJalaliYear,
  policy,
  lockedCategoryKey,
  invoiceId = null,
  onClose,
  onCreated,
}: {
  documentId: string;
  /**
   * فاکتوری که ویرایش می‌شود — `null` یعنی فاکتور تازه.
   *
   * همین یک فرم برای هر دو: فرم ویرایشِ جدا یعنی دو جا برای هر قاعده‌ای که فردا
   * اضافه شود، و اولین تغییر یکی از آن‌ها را جا می‌گذارد.
   */
  invoiceId?: string | null;
  documentJalaliYear: number;
  policy: RoundingPolicyRef;
  /**
   * گروه بودجه‌ای که این سند قبلاً گرفته است — `null` یعنی سند هنوز فاکتوری ندارد.
   *
   * یک سند یا جاری است یا عمرانی؛ گروه مخالف اینجا خاموش می‌شود تا کاربر تا پای
   * ثبت نرود و آنجا خطا بگیرد. قاعده در سرور هم هست.
   */
  lockedCategoryKey: 'CURRENT' | 'CAPITAL' | null;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const categories = useBudgetCategories();
  const bootstrap = useQuery({
    queryKey: ['base-data', 'bootstrap'],
    queryFn: () => apiFetch<BootstrapData>('/base-data/bootstrap'),
    staleTime: 5 * 60_000,
  });
  const create = useCreateInvoice(documentId);
  const update = useUpdateInvoice(documentId);
  const draft = useInvoiceDraft(invoiceId);
  const editing = invoiceId !== null;

  /** گروه بودجه (جاری / عمرانی) — فهرست فصل‌ها را فیلتر می‌کند. */
  const [categoryId, setCategoryId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [invoiceTypeId, setInvoiceTypeId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayJalali());
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState<PaymentDraft>(EMPTY_PAYMENT);
  /** تا وقتی کاربر روش پرداخت را دست نزده، پیش‌فرض **نوع فعلی** فاکتور حاکم است. */
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** گفت‌وگوی ساخت فروشنده، از داخل همین فرم. */
  const [newVendor, setNewVendor] = useState(false);

  const [itemsDraft, setItemsDraft] = useState<ItemsDraft>(() => emptyItemsDraft(null));
  const [utilityDraft, setUtilityDraft] = useState<UtilityDraft>(EMPTY_UTILITY);
  const [fuelDraft, setFuelDraft] = useState<FuelDraft>(() => emptyFuelDraft(documentJalaliYear));

  /*
    پر کردن فرم از فاکتور موجود — **یک بار**.

    `hydrated` لازم است چون همین اثر با هر رسیدن داده دوباره اجرا می‌شود و بدون آن،
    هر ویرایشی که کاربر انجام داده با مقدار سرور بازنویسی می‌شد.

    ترتیب هم مهم است: گروه بودجه و فصل و نوع فاکتور پیش از بقیه می‌نشینند، چون
    شکلِ بقیهٔ فرم از همان‌ها می‌آید.
  */
  const [hydrated, setHydrated] = useState(false);
  /** پلاکِ فاکتورِ در حال ویرایش — فهرست پلاک سمت سرور جست‌وجو می‌شود. */
  const [initialPlate, setInitialPlate] = useState('');

  useEffect(() => {
    const data = draft.data;
    if (!data || hydrated) return;

    setCategoryId(data.categoryId);
    setChapterId(data.chapterId);
    setInvoiceTypeId(data.invoiceTypeId);
    setVendorId(data.vendorId ?? '');
    setVendorSearch(data.vendorName ?? '');
    setInvoiceNumber(data.invoiceNumber ?? '');
    // با ارقام لاتین، چون همین رشته دوباره خوانده و به سرور تبدیل می‌شود.
    setInvoiceDate(formatJalali(isoDateToJalali(data.invoiceDate), { persianDigits: false }));
    setDescription(data.description ?? '');
    setNotes(data.notes ?? '');

    const details = data.details as Record<string, unknown>;

    if (details.kind === 'UTILITY') {
      setUtilityDraft({
        schoolId: String(details.schoolId),
        districtTitle: String(details.districtTitle ?? ''),
        utilityTypeId: String(details.utilityTypeId),
        baseAmount: String(details.baseAmount),
        discountAmount: String(details.discountAmount),
        tax: {
          mode: details.taxMode as 'PERCENT' | 'AMOUNT',
          rateBp: (details.taxRateBp as number | null) ?? 1000,
          amount: String(details.taxAmount ?? ''),
        },
        // تأیید تکرار دوباره گرفته می‌شود: شرایط ممکن است از آن زمان عوض شده باشد.
        acknowledgeDuplicate: false,
      });
    } else if (details.kind === 'FUEL') {
      setFuelDraft({
        vehicleTypeId: String(details.vehicleTypeId ?? ''),
        vehicleId: String(details.vehicleId),
        fuelTypeId: String(details.fuelTypeId),
        jalaliYear: Number(details.jalaliYear),
        jalaliMonth: Number(details.jalaliMonth),
        entries: (details.entries as { day: number; amount: string }[]).map((entry) => ({
          key: crypto.randomUUID(),
          day: entry.day,
          amount: entry.amount,
        })),
      });
      setInitialPlate(String(details.plateNumber ?? ''));
    } else {
      setItemsDraft({
        invoiceTax: {
          mode: details.taxMode as 'PERCENT' | 'AMOUNT',
          rateBp: (details.taxRateBp as number | null) ?? 1000,
          amount: String(details.taxAmount ?? ''),
        },
        items: (details.items as Record<string, unknown>[]).map((item) => ({
          key: crypto.randomUUID(),
          description: String(item.description),
          productCode: String(item.productCode ?? ''),
          quantity: String(item.quantity),
          unitId: String(item.unitId ?? ''),
          unitPrice: String(item.unitPrice),
          discountAmount: String(item.discountAmount),
          tax: {
            mode: item.taxMode as 'PERCENT' | 'AMOUNT',
            rateBp: (item.taxRateBp as number | null) ?? 1000,
            amount: String(item.taxAmount ?? ''),
          },
        })),
      });
    }

    if (data.payment) {
      setPaymentTouched(true);
      setPayment({
        paymentMethodId: data.payment.paymentMethodId,
        vendorBankAccountId: data.payment.vendorBankAccountId ?? '',
        pettyCashHolderId: data.payment.pettyCashHolderId ?? '',
        paymentIdentifier: data.payment.paymentIdentifier ?? '',
        billIdentifier: data.payment.billIdentifier ?? '',
        beneficiaryAmount: data.payment.beneficiaryAmount ?? '',
        pettyCashAmount: data.payment.pettyCashAmount ?? '',
        notes: data.payment.notes ?? '',
      });
    }

    setHydrated(true);
  }, [draft.data, hydrated]);

  const invoiceTypes = useChapterInvoiceTypes(chapterId);
  const vendors = useVendorSearch(vendorSearch);

  const options = invoiceTypes.data?.options ?? [];
  const selectedType = options.find((option) => option.invoiceTypeId === invoiceTypeId);
  const kind: InvoiceKind | null = selectedType?.kind ?? null;
  const lineModel: InvoiceLineModel | null = kind ? INVOICE_KIND_REGISTRY[kind].lineModel : null;

  // فصل با یک نوع مجاز ⇒ انتخاب خودکار؛ با چند نوع ⇒ پیش‌فرض فصل، و کاربر می‌تواند
  // عوضش کند (§۱۰ پرامپت).
  useEffect(() => {
    if (options.length === 0) {
      setInvoiceTypeId('');
      return;
    }
    const preferred = options.find((option) => option.isDefault) ?? options[0];
    setInvoiceTypeId((current) =>
      options.some((option) => option.invoiceTypeId === current)
        ? current
        : (preferred as ChapterInvoiceTypeOption).invoiceTypeId,
    );
  }, [options]);

  // روش پرداخت پیش‌فرض **هر نوع فاکتور** (الزام فاز ۴).
  //
  // نکته‌ای که در آزمون دستی پیدا شد: اگر فقط «وقتی خالی است» پر شود، با عوض شدن نوع
  // فاکتور، پیش‌فرض نوع قبلی باقی می‌ماند — کاربر فاکتور سوخت می‌سازد و روش «قبض»
  // از فاکتور انشعابات روی آن مانده است. پس تا وقتی کاربر دست نزده، پیش‌فرض نوع
  // فعلی جایگزین می‌شود و نبودِ پیش‌فرض یعنی خالی.
  useEffect(() => {
    if (paymentTouched) return;
    const method = selectedType?.defaultPaymentMethod ?? null;
    setPayment((current) => ({ ...EMPTY_PAYMENT, notes: current.notes, paymentMethodId: method?.id ?? '' }));
  }, [paymentTouched, selectedType?.invoiceTypeId, selectedType?.defaultPaymentMethod]);

  /*
    گروه‌های بودجه، به‌شکل یک کلید چندحالته بالای فهرست فصل‌ها.

    پیش از این عنوان گروه، پیشوندِ برچسبِ هر فصل بود («جاری — مواد مصرفی») و کاربر
    باید در یک فهرست بلندِ درهم دنبال فصلش می‌گشت. حالا گروه یک انتخاب جداست و فهرست
    فصل‌ها فقط همان گروه را نشان می‌دهد — پس برچسب‌ها هم کوتاه‌تر و خواناتر شدند.
  */
  const categoryOptions = useMemo(
    () =>
      (categories.data ?? [])
        .filter((category) => category.chapters.some((chapter) => chapter.isActive))
        .map((category) => {
          const blocked = lockedCategoryKey !== null && category.key !== lockedCategoryKey;

          return {
            value: category.id,
            label: category.titleFa,
            icon: (category.key === 'CAPITAL' ? 'layers' : 'store') as 'layers' | 'store',
            badge: toPersianDigits(
              String(category.chapters.filter((chapter) => chapter.isActive).length),
            ),
            hint: category.key === 'CAPITAL' ? 'هزینه های عمرانی' : 'هزینه‌های جاری',
            disabled: blocked,
            ...(blocked ? { disabledReason: 'این سند گروه بودجهٔ دیگری دارد' } : {}),
          };
        }),
    [categories.data, lockedCategoryKey],
  );

  /*
    گروه پیش‌فرض: اولین گروهِ **مجاز** که فصل فعال دارد.

    بدون این، کاربر اول باید یک انتخاب اضافه بکند تا فهرست فصل‌ها پر شود؛ و در سندی
    که گروهش قفل شده، پیش‌فرض نباید روی گروه خاموش بنشیند.
  */
  useEffect(() => {
    const allowed = categoryOptions.filter((option) => !option.disabled);
    if (allowed.length === 0) return;
    setCategoryId((current) =>
      allowed.some((option) => option.value === current) ? current : (allowed[0]?.value ?? ''),
    );
  }, [categoryOptions]);

  /*
    روش‌های پرداختِ قابل انتخاب، بر اساس **نوع فاکتور**.

    مثال خودِ سامانه: «قبض» برای انشعابات معنا دارد و برای خرید کالا نه. تا پیش از
    این، همهٔ روش‌ها در همهٔ فاکتورها دیده می‌شدند و جلوگیری از انتخاب اشتباه فقط به
    حواس کاربر بند بود.

    نبودِ محدودیت (`null`) یعنی همهٔ روش‌های فعال — نه فهرست خالی.
  */
  const allowedMethods = useMemo(() => {
    const all = bootstrap.data?.paymentMethods ?? [];
    const allowed = selectedType?.allowedPaymentMethodIds ?? null;
    if (allowed === null) return all;
    return all.filter((method) => allowed.includes(method.id));
  }, [bootstrap.data?.paymentMethods, selectedType?.allowedPaymentMethodIds]);

  const chapters = useMemo(
    () =>
      (categories.data ?? [])
        .filter((category) => category.id === categoryId)
        .flatMap((category) =>
          category.chapters
            .filter((chapter) => chapter.isActive)
            .map((chapter) => ({
              value: chapter.id,
              label: `${chapter.title}${chapter.code ? ` (${chapter.code})` : ''}`,
            })),
        ),
    [categories.data, categoryId],
  );

  // با عوض شدن گروه، فصلِ انتخاب‌شده ممکن است دیگر در فهرست نباشد؛ ماندنش یعنی فرم
  // روی مقداری کار می‌کند که کاربر نمی‌بیند.
  useEffect(() => {
    setChapterId((current) =>
      current === '' || chapters.some((chapter) => chapter.value === current) ? current : '',
    );
  }, [chapters]);

  const reference = bootstrap.data;
  const isoInvoiceDate = safeIso(invoiceDate);

  /*
    مبلغ کل فاکتور، همان‌طور که سرور حسابش می‌کند.

    فقط پرداخت ترکیبی به آن نیاز دارد (تقسیم مبلغ بین دو مقصد)، ولی از همان
    ورودی‌ای می‌آید که ثبت می‌شود — نه از drafts — تا عددی که کاربر تقسیم می‌کند
    همان عددی باشد که ثبت خواهد شد.
  */
  const draftTotal = useMemo(() => {
    if (!kind) return null;
    const details = buildDetails(kind, { itemsDraft, utilityDraft, fuelDraft }, policy);
    return details === null ? null : detailsTotal(details, policy);
  }, [kind, itemsDraft, utilityDraft, fuelDraft, policy]);

  const submit = (): void => {
    setMessage(null);

    if (!kind || isoInvoiceDate === null) {
      setMessage('نوع فاکتور و تاریخ صورتحساب را کامل کنید.');
      return;
    }

    const details = buildDetails(kind, { itemsDraft, utilityDraft, fuelDraft }, policy);
    if (details === null) {
      setMessage('اطلاعات فرم کامل نیست.');
      return;
    }

    const payload: CreateInvoicePayload = {
      chapterId,
      invoiceTypeId,
      vendorId: vendorId || null,
      invoiceNumber: invoiceNumber.trim() || null,
      invoiceDate: isoInvoiceDate,
      description: description.trim() || null,
      notes: notes.trim() || null,
      details,
      payment: paymentToPayload(payment),
      // فقط برای انشعابات معنا دارد؛ بقیه خانواده‌ها هیچ‌وقت تکراری اعلام نمی‌شوند.
      acknowledgeDuplicate: kind === 'UTILITY' ? utilityDraft.acknowledgeDuplicate : false,
    };

    const handlers = {
      onSuccess: () => {
        onCreated();
        onClose();
      },
      onError: (error: unknown) =>
        setMessage(error instanceof ApiError ? describeError(error) : 'خطا در ثبت فاکتور'),
    };

    if (editing) {
      update.mutate({ invoiceId: invoiceId as string, ...payload }, handlers);
    } else {
      create.mutate(payload, handlers);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={editing ? 'edit' : 'plus'}
        title={editing ? 'ویرایش فاکتور' : 'افزودن فاکتور'}
        description="فصل و نوع فاکتور، شکل بقیه فرم را تعیین می‌کنند."
        action={
          <Button variant="ghost" size="sm" onClick={onClose}>
            بستن
          </Button>
        }
      />

      <div className="space-y-6 p-5">
        {categoryOptions.length > 0 ? (
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">گروه بودجه</span>
            <Segmented
              label="گروه بودجه"
              size="lg"
              options={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
            />
            {lockedCategoryKey ? (
              <p className="text-xs text-muted-foreground">
                گروه بودجهٔ این سند با فاکتور اولش تعیین شده است؛ یک سند فقط فاکتورهای
                یک گروه را می‌پذیرد. برای گروه دیگر، سند جداگانه‌ای بسازید.
              </p>
            ) : null}
          </div>
        ) : null}

        {/*
          `items-start` و خانه‌های هم‌ساخت: هر دو ستون باید از یک خط شروع شوند.

          پیش از این، حالت‌های «در حال خواندن» و «تنها نوع مجاز» با `self-end` به کف
          خانه می‌چسبیدند و ارتفاعشان هم با کنترل انتخاب یکی نبود؛ نتیجه این بود که
          «فصل» و «نوع فاکتور» در یک راستا نمی‌نشستند.
        */}
        <div className="grid items-start gap-x-5 gap-y-4 md:grid-cols-2">
          <Select
            label="فصل"
            required
            value={chapterId}
            onChange={(nextValue) => setChapterId(nextValue)}
            options={chapters}
            hint="انواع فاکتور مجاز، از اتصال‌های همین فصل در اطلاعات پایه می‌آیند."
          />

          {chapterId === '' ? (
            <ReadOnlyField
              label="نوع فاکتور"
              value="—"
              hint="ابتدا فصل را انتخاب کنید."
            />
          ) : invoiceTypes.isPending ? (
            // تا وقتی پاسخ سرور نرسیده، «نوعی تعریف نشده» یک **خطای دروغ** است؛
            // فهرست خالی در حال بارگذاری با فهرست خالی واقعی یکی نیست.
            <ReadOnlyField label="نوع فاکتور" value="در حال خواندن…" hint="انواع مجاز این فصل" />
          ) : options.length === 0 ? (
            <ReadOnlyField
              label="نوع فاکتور"
              value="تعریف نشده"
              tone="error"
              hint="برای این فصل هیچ نوع فاکتوری در «فصل‌ها و انواع فاکتور» وصل نشده است."
            />
          ) : options.length === 1 ? (
            <ReadOnlyField
              label="نوع فاکتور"
              value={options[0]?.titleFa ?? ''}
              hint="تنها نوع مجاز این فصل"
            />
          ) : (
            <Select
              label="نوع فاکتور"
              required
              value={invoiceTypeId}
              onChange={(nextValue) => setInvoiceTypeId(nextValue)}
              placeholder={null}
              options={options.map((option) => ({
                value: option.invoiceTypeId,
                label: option.titleFa,
              }))}
              hint="از اتصال‌های همین فصل می‌آید."
            />
          )}
        </div>

        {kind === null || reference === undefined ? (
          <p className="text-sm text-muted-foreground">
            برای ادامه، فصل را انتخاب کنید.
          </p>
        ) : (
          <>
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-3">
              <Select
                label="فروشنده"
                prefsKey="vendor"
                remoteSearch={{
                  search: vendorSearch,
                  onSearchChange: setVendorSearch,
                  loading: vendors.isFetching,
                  total: vendors.data?.total,
                }}
                value={vendorId}
                options={(vendors.data?.items ?? []).map((vendor) => ({
                  value: vendor.id,
                  label: vendor.name,
                  description: vendor.representativeName ?? undefined,
                }))}
                onChange={setVendorId}
                onCreate={() => setNewVendor(true)}
                createLabel="افزودن فروشنده"
                hint="اگر فروشنده ثبت نشده، از پایین همین فهرست بسازیدش."
              />

              <Input
                label="شماره صورتحساب"
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                hint="اختیاری"
              />

              <JalaliDatePicker
                label="تاریخ صورتحساب"
                required
                value={isoInvoiceDate}
                onChange={(iso) => setInvoiceDate(iso === null ? '' : formatJalali(isoDateToJalali(iso)))}
                {...(invoiceDate.trim() !== '' && isoInvoiceDate === null
                  ? { error: 'تاریخ شمسی معتبر نیست' }
                  : {})}
              />
            </div>

            {/* نقطه واحد انتخاب فرم: از روی `lineModel` خانواده، نه عنوان فصل. */}
            {lineModel === 'ITEMS' ? (
              <ItemsFields
                draft={itemsDraft}
                onChange={setItemsDraft}
                units={reference.measurementUnits}
                policy={policy}
              />
            ) : null}

            {lineModel === 'SINGLE_AMOUNT' ? (
              <UtilityFields
                draft={utilityDraft}
                onChange={setUtilityDraft}
                utilityTypes={reference.utilityTypes}
                policy={policy}
                documentId={documentId}
              />
            ) : null}

            {lineModel === 'DAILY_ENTRIES' ? (
              <FuelFields
                draft={fuelDraft}
                onChange={setFuelDraft}
                vehicleTypes={reference.vehicleTypes}
                fuelTypes={reference.fuelTypes}
                initialPlateSearch={initialPlate}
              />
            ) : null}

            <PaymentFields
              totalAmount={draftTotal}
              draft={payment}
              onChange={(next) => {
                setPaymentTouched(true);
                setPayment(next);
              }}
              methods={allowedMethods}
              vendorName={
                (vendors.data?.items ?? []).find((vendor) => vendor.id === vendorId)?.name ?? ''
              }
              vendorId={vendorId}
            />

            {/*
              شرح، یک **عنوان** است و توضیحات یک یادداشت.

              جدا نگه داشتنشان به‌خاطر گزارش مالیات است: ستون «نوع کالا» از شرح پر
              می‌شود و یک یادداشت چندخطی آنجا جا نمی‌شود.
            */}
            <Input
              label="شرح فاکتور"
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              hint="یک خط: این فاکتور بابت چیست. در گزارش مالیات، پیش‌فرض ستون «نوع کالا» می‌شود."
            />

            <Input
              label="توضیحات فاکتور"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              hint="توضیح اختصاصی همین فاکتور"
            />

            {message ? (
              <p
                role="alert"
                className="whitespace-pre-line rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {message}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button
                loading={create.isPending || update.isPending}
                disabled={editing && !hydrated}
                onClick={submit}
              >
                {editing ? 'ثبت ویرایش' : 'ثبت فاکتور'}
              </Button>
              <Button variant="secondary" onClick={onClose}>
                انصراف
              </Button>
            </div>
          </>
        )}
      </div>

      {newVendor ? (
        <VendorDialog
          vendor={null}
          onClose={() => setNewVendor(false)}
          onSaved={(created) => {
            /*
              فروشندهٔ تازه بی‌درنگ انتخاب می‌شود.

              جست‌وجوی فروشنده سمت سرور است، پس متن جست‌وجو هم روی نام تازه گذاشته
              می‌شود تا همان رکورد در فهرست باشد و کاربر انتخابِ بی‌برچسب نبیند.
            */
            setVendorSearch(created.name);
            setVendorId(created.id);
            setNewVendor(false);
          }}
        />
      ) : null}
    </Card>
  );
}

/**
 * ساخت `details` بر اساس خانواده.
 *
 * این تابع تنها جایی است که شکل ورودی هر خانواده ساخته می‌شود؛ `kind` از پاسخ سرور
 * می‌آید و سرور هم دوباره با نوع فاکتور می‌سنجدش.
 */
function buildDetails(
  kind: InvoiceKind,
  drafts: { itemsDraft: ItemsDraft; utilityDraft: UtilityDraft; fuelDraft: FuelDraft },
  policy: RoundingPolicyRef,
): InvoiceDetailsPayload | null {
  const lineModel = INVOICE_KIND_REGISTRY[kind].lineModel;

  if (lineModel === 'ITEMS') {
    if (kind !== 'NORMAL' && kind !== 'STAD') return null;
    const tax = invoiceTaxToPayload(drafts.itemsDraft, policy);
    return {
      kind,
      taxMode: tax.taxMode,
      taxRateBp: tax.taxRateBp,
      taxAmount: tax.taxAmount,
      items: itemsToPayload(drafts.itemsDraft, policy),
    };
  }

  if (lineModel === 'SINGLE_AMOUNT') {
    const draft = drafts.utilityDraft;
    if (draft.schoolId === '' || draft.utilityTypeId === '' || draft.baseAmount === '') return null;
    return {
      kind: 'UTILITY',
      schoolId: draft.schoolId,
      utilityTypeId: draft.utilityTypeId,
      baseAmount: draft.baseAmount,
      discountAmount: draft.discountAmount || '0',
      taxMode: draft.tax.mode,
      taxRateBp: draft.tax.mode === 'PERCENT' ? draft.tax.rateBp : null,
      taxAmount: draft.tax.mode === 'AMOUNT' ? draft.tax.amount || '0' : null,
    };
  }

  const draft = drafts.fuelDraft;
  const entries = draft.entries.filter((entry) => entry.day !== null && entry.amount !== '');
  if (draft.vehicleId === '' || draft.fuelTypeId === '' || entries.length === 0) return null;

  return {
    kind: 'FUEL',
    vehicleId: draft.vehicleId,
    fuelTypeId: draft.fuelTypeId,
    jalaliYear: draft.jalaliYear,
    jalaliMonth: draft.jalaliMonth,
    entries: entries.map((entry) => ({ day: entry.day as number, amount: entry.amount })),
  };
}

/**
 * تاریخ شمسی تایپ‌شده ⇒ `YYYY-MM-DD` میلادی؛ نامعتبر ⇒ `null`.
 *
 * خواندن و تبدیل هر دو از `@dm/shared` می‌آیند (ارقام فارسی، جداکننده‌های مختلف و
 * اعتبار روز در ماه). نوشتن دوباره‌شان اینجا همان ریسک R12 است.
 */
/**
 * فیلدِ فقط‌خواندنی با همان ابعاد کنترل‌های فرم.
 *
 * چرا کامپوننت و نه چند `<p>` درجا: ارتفاع برچسب، ارتفاع کادر و خط راهنما باید
 * **دقیقاً** مثل `Select` باشد، وگرنه دو ستون کنار هم ناهم‌تراز می‌شوند.
 */
function ReadOnlyField({
  label,
  value,
  hint,
  tone = 'muted',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'muted' | 'error';
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <span className={LABEL_CLASS}>{label}</span>
      <p
        className={
          tone === 'error'
            ? 'flex h-10 items-center truncate rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-sm text-destructive'
            : 'flex h-10 items-center truncate rounded-lg border border-dashed border-border bg-muted/40 px-3 text-sm'
        }
      >
        {value}
      </p>
      <p className={`${HELP_CLASS} ${tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
        {hint}
      </p>
    </div>
  );
}

function safeIso(jalaliText: string): string | null {
  try {
    return jalaliToIsoDate(parseJalali(jalaliText));
  } catch {
    return null;
  }
}

function todayJalali(): string {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  // با ارقام لاتین، چون همین رشته دوباره خوانده و به سرور تبدیل می‌شود.
  return formatJalali(isoDateToJalali(iso), { persianDigits: false });
}

function describeError(error: ApiError): string {
  const lines =
    error.details.length === 0
      ? [error.message]
      : [error.message, ...error.details.map((detail) => `• ${detail.message}`)];
  // ارقام لاتین پیام سرور در لایه نمایش فارسی می‌شوند.
  return formatServerMessage(lines.join('\n'));
}
