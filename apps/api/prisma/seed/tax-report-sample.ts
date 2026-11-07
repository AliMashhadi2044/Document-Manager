/**
 * یک سند برای **دیدن گزارش مالیات در همهٔ حالت‌هایش** — فقط محیط توسعه.
 *
 * گزارش مالیات ستون‌هایی دارد که هر کدام می‌توانند خالی باشند، و قاعده‌هایی که
 * فقط با دادهٔ خاص دیده می‌شوند: فروشنده‌ای که چند فاکتور دارد شمارهٔ صورت‌حساب
 * نمی‌گیرد، سلول دوبخشی وقتی یک نیمه‌اش نیست باید یک‌تکه شود، سرستون باید تکهٔ
 * بی‌داده را بیندازد، و مبلغِ بالاتر از آستانه باید خاکستری شود.
 *
 * با یک سند معمولی هیچ‌کدام دیده نمی‌شوند. این سند ده فروشنده دارد که هر کدام
 * عمداً یک چیز کم یا زیاد دارند.
 *
 * **داده از همان مسیری می‌آید که کاربر می‌آید**: سرویس‌های واقعی سند و فاکتور،
 * با همان اعتبارسنجی و همان موتور مالی. نوشتن مستقیم در جدول‌ها داده‌ای می‌ساخت
 * که قاعده‌های سامانه را رد نکرده است.
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from '@dm/shared';

import { AppModule } from '../../src/app.module';
import { DocumentsService } from '../../src/modules/documents/documents.service';
import { InvoicesService } from '../../src/modules/invoices/invoices.service';
import type { AuthenticatedUser } from '../../src/common/auth/auth.decorators';

const prisma = new PrismaClient();

interface VendorSpec {
  readonly key: string;
  readonly name: string;
  readonly personType: 'NATURAL' | 'LEGAL';
  readonly representativeName?: string;
  readonly economicCode?: string;
  readonly nationalId?: string;
  readonly addressLine?: string;
  readonly postalCode?: string;
  readonly phone?: string;
  /** چه چیزی را در گزارش می‌آزماید. */
  readonly covers: string;
}

/*
  ده فروشنده، هر کدام یک حالت.

  نام‌ها «نمونه» دارند تا در فهرست فروشندگان با داده واقعی اشتباه گرفته نشوند.
*/
const VENDORS: readonly VendorSpec[] = [
  {
    key: 'full',
    name: 'شرکت نمونه کامل بهاران',
    personType: 'LEGAL',
    representativeName: 'رضا بهاری',
    economicCode: '711134858911',
    addressLine: 'تهران، خیابان آزادی، پلاک ۱۲',
    postalCode: '1345678901',
    phone: '02166554433',
    covers: 'همه ستون‌ها پر — ردیف مرجع',
  },
  {
    key: 'multi',
    name: 'شرکت نمونه سه‌فاکتوره پارس',
    personType: 'LEGAL',
    representativeName: 'مریم پارسا',
    economicCode: '711134858929',
    addressLine: 'کرج، بلوار دانش، پلاک ۴',
    postalCode: '3145678902',
    phone: '02634445566',
    covers: 'سه فاکتور ⇒ شماره صورت‌حساب خالی می‌ماند',
  },
  {
    key: 'two',
    name: 'زهرا نمونه‌زاده',
    personType: 'NATURAL',
    nationalId: '7123456781',
    addressLine: 'اصفهان، خیابان چهارباغ',
    covers: 'دو فاکتور، شخص حقیقی، بدون تلفن و کد پستی',
  },
  {
    key: 'noid',
    name: 'فروشگاه نمونه بی‌شناسه',
    personType: 'LEGAL',
    representativeName: 'سعید نیکو',
    addressLine: 'شیراز، معالی‌آباد',
    phone: '07136667788',
    covers: 'بدون کد ملی و شماره اقتصادی ⇒ نیمهٔ دوم سلول طرف قرارداد خالی',
  },
  {
    key: 'nophone',
    name: 'شرکت نمونه بی‌تلفن آریا',
    personType: 'LEGAL',
    economicCode: '711134858937',
    addressLine: 'مشهد، بلوار وکیل‌آباد',
    postalCode: '9187654321',
    covers: 'بدون تلفن و بدون نمایندهٔ ثبت‌شده',
  },
  {
    key: 'noaddr',
    name: 'علی نمونه‌پور',
    personType: 'NATURAL',
    nationalId: '7234567892',
    phone: '09121234567',
    covers: 'بدون نشانی و بدون کد پستی',
  },
  {
    key: 'bare',
    name: 'تعاونی نمونه بدون اطلاعات',
    personType: 'LEGAL',
    covers: 'هیچ اطلاعات تکمیلی ندارد — کم‌داده‌ترین ردیف',
  },
  {
    key: 'long',
    name: 'شرکت تعاونی تولیدی و خدماتی نمونه طراحان صنعت ساختمان استان البرز',
    personType: 'LEGAL',
    representativeName: 'محمدحسین شریفی‌نژاد اصفهانی',
    economicCode: '711134858945',
    addressLine:
      'البرز، کرج، مهرشهر، بلوار ارم، نبش خیابان ۲۰۴ شرقی، مجتمع تجاری اداری نمونه، طبقه پنجم، واحد ۵۰۳',
    postalCode: '3185412367',
    phone: '02633445566',
    covers: 'نام، نشانی و نام نماینده بلند — فشار چیدمان روی کاغذ',
  },
  {
    key: 'big',
    name: 'شرکت نمونه مبلغ بزرگ کیان',
    personType: 'LEGAL',
    representativeName: 'نگار کیانی',
    economicCode: '711134858952',
    addressLine: 'تهران، سعادت‌آباد',
    postalCode: '1998765432',
    phone: '02122334455',
    covers: 'مبلغ بسیار بزرگ — آزمون آستانهٔ علامت‌گذاری خاکستری',
  },
  {
    key: 'exempt',
    name: 'موسسه نمونه معاف از مالیات',
    personType: 'LEGAL',
    representativeName: 'حسن معافی',
    nationalId: '74001234563',
    addressLine: 'قم، بلوار امین',
    postalCode: '3715648920',
    phone: '02532223344',
    covers: 'مالیات صفر و تخفیف‌دار',
  },
];

interface InvoiceSpec {
  readonly vendor: string;
  readonly description: string;
  readonly unitPrice: string;
  readonly discount: string;
  /** درصد مالیات به basis point؛ `0` یعنی معاف. */
  readonly taxRateBp: number;
  /** روزِ ماه برای تاریخ صورت‌حساب — ترتیب ردیف‌ها از همین می‌آید. */
  readonly day: number;
  /** `null` یعنی فاکتور شمارهٔ صورت‌حساب ندارد. */
  readonly invoiceNumber: string | null;
}

const INVOICES: readonly InvoiceSpec[] = [
  { vendor: 'full', description: 'خرید تجهیزات اداری', unitPrice: '125000000', discount: '5000000', taxRateBp: 1000, day: 3, invoiceNumber: 'FS-2601' },

  // سه فاکتور از یک فروشنده: تجمیع، شماره را خالی می‌گذارد.
  { vendor: 'multi', description: 'خرید کاغذ A4', unitPrice: '42000000', discount: '0', taxRateBp: 1000, day: 5, invoiceNumber: 'PR-11' },
  { vendor: 'multi', description: 'خرید تونر چاپگر', unitPrice: '38500000', discount: '1500000', taxRateBp: 1000, day: 9, invoiceNumber: 'PR-12' },
  { vendor: 'multi', description: 'خرید لوازم التحریر', unitPrice: '17250000', discount: '0', taxRateBp: 1000, day: 14, invoiceNumber: 'PR-13' },

  // دو فاکتور: همان قاعده، با شخص حقیقی.
  { vendor: 'two', description: 'خدمات نظافت ماهانه', unitPrice: '60000000', discount: '0', taxRateBp: 1000, day: 6, invoiceNumber: 'KH-7' },
  { vendor: 'two', description: 'خدمات نظافت ماه دوم', unitPrice: '60000000', discount: '0', taxRateBp: 1000, day: 20, invoiceNumber: 'KH-8' },

  { vendor: 'noid', description: 'خرید ابزار دستی', unitPrice: '23400000', discount: '400000', taxRateBp: 1000, day: 7, invoiceNumber: 'AB-305' },

  // فاکتورِ بی‌شماره: تنها فاکتور این فروشنده است، ولی شماره ندارد.
  { vendor: 'nophone', description: 'تعمیر سیستم گرمایش', unitPrice: '88000000', discount: '0', taxRateBp: 1000, day: 8, invoiceNumber: null },

  { vendor: 'noaddr', description: 'حمل و نقل بار', unitPrice: '9500000', discount: '0', taxRateBp: 500, day: 10, invoiceNumber: 'HM-44' },
  { vendor: 'bare', description: 'خرید مواد مصرفی', unitPrice: '14750000', discount: '0', taxRateBp: 1000, day: 11, invoiceNumber: 'MM-2' },
  { vendor: 'long', description: 'اجرای نمای ساختمان اداری', unitPrice: '640000000', discount: '40000000', taxRateBp: 1000, day: 12, invoiceNumber: 'SB-9012' },
  { vendor: 'big', description: 'خرید سامانه سرور و ذخیره‌سازی', unitPrice: '4850000000', discount: '50000000', taxRateBp: 1000, day: 13, invoiceNumber: 'KI-777' },

  // معاف: مالیات صفر، با تخفیف.
  { vendor: 'exempt', description: 'خدمات آموزشی', unitPrice: '72000000', discount: '12000000', taxRateBp: 0, day: 15, invoiceNumber: 'MA-18' },
];

/*
  سند دوم: **هیچ** ردیفی شمارهٔ صورت‌حساب ندارد.

  قاعده‌ای که فقط با همین داده دیده می‌شود: تکه‌ای از سرستون که در هیچ ردیفی داده
  ندارد، از سرستون می‌افتد. در سند ده‌فروشنده‌ای این اتفاق نمی‌افتد، چون آنجا
  بعضی ردیف‌ها شماره دارند — و همان هم درست است: سرستون دربارهٔ **ستون** است و
  نه یک ردیف.
*/
const NO_NUMBER_INVOICES: readonly InvoiceSpec[] = [
  { vendor: 'full', description: 'خرید میز و صندلی', unitPrice: '31000000', discount: '0', taxRateBp: 1000, day: 4, invoiceNumber: null },
  { vendor: 'bare', description: 'خرید پرده', unitPrice: '12500000', discount: '0', taxRateBp: 1000, day: 6, invoiceNumber: null },
  { vendor: 'noaddr', description: 'نصب و راه‌اندازی', unitPrice: '7800000', discount: '0', taxRateBp: 1000, day: 8, invoiceNumber: null },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('این اسکریپت فقط برای محیط توسعه است');
  }

  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const documents = context.get(DocumentsService);
  const invoices = context.get(InvoicesService);

  try {
    const actor = await resolveActor();
    const base = await ensureBaseData();
    const vendorIds = await ensureVendors();

    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/gu, '');

    const document = await buildDocument(
      documents,
      invoices,
      actor,
      base,
      vendorIds,
      `سند آزمون گزارش مالیات — ده فروشنده (${stamp})`,
      `WF-TAX-${stamp.slice(-6)}`,
      INVOICES,
    );

    console.log(`  شناسه: ${document}`);
    console.log(`  ${INVOICES.length} فاکتور از ${VENDORS.length} فروشنده`);
    for (const vendor of VENDORS) {
      console.log(`  • ${vendor.name} — ${vendor.covers}`);
    }

    const second = await buildDocument(
      documents,
      invoices,
      actor,
      base,
      vendorIds,
      `سند آزمون گزارش مالیات — بدون شماره صورت‌حساب (${stamp})`,
      `WF-TAXN-${stamp.slice(-6)}`,
      NO_NUMBER_INVOICES,
    );
    console.log(`\n✓ «سند دوم» شناسه: ${second}`);
    console.log('  هیچ ردیفی شماره ندارد ⇒ سرستون باید فقط «تاریخ صورت حساب» شود');

  } finally {
    await context.close();
  }
}

/**
 * یک سند با فهرستی از فاکتورها، از همان مسیری که کاربر می‌رود.
 *
 * عنوان مهرِ زمان دارد تا اجرای دوباره سند قبلی را دست نزند و دو نسخه هم نسازد.
 */
async function buildDocument(
  documents: DocumentsService,
  invoices: InvoicesService,
  actor: AuthenticatedUser,
  base: BaseData,
  vendorIds: ReadonlyMap<string, string>,
  title: string,
  workflowNumber: string,
  plan: readonly InvoiceSpec[],
): Promise<string> {
  const document = await documents.create(
    {
      title,
      type: 'NORMAL',
      fiscalYear: base.fiscalYear,
      jalaliYear: base.jalaliYear,
      buyerEntityId: base.buyerEntityId,
      workflowNumber,
      workflowDate: `${base.fiscalYear + 621}-10-01`,
      stad: null,
    },
    actor,
  );

  for (const spec of plan) {
    await invoices.create(
      document.id,
      {
        chapterId: base.chapterId,
        invoiceTypeId: base.normalTypeId,
        vendorId: vendorIds.get(spec.vendor) as string,
        invoiceNumber: spec.invoiceNumber,
        invoiceDate: `${base.fiscalYear + 621}-10-${String(spec.day).padStart(2, '0')}`,
        description: spec.description,
        notes: null,
        details: {
          kind: 'NORMAL',
          taxMode: 'PERCENT',
          taxRateBp: spec.taxRateBp,
          taxAmount: null,
          items: [
            {
              rowNo: 1,
              description: spec.description,
              productCode: null,
              quantity: '1',
              unitId: base.unitId,
              unitPrice: spec.unitPrice,
              discountAmount: spec.discount,
              taxMode: 'PERCENT',
              taxRateBp: spec.taxRateBp,
              taxAmount: null,
            },
          ],
        },
        payment: {
          /*
            تنخواه.

            این سند دربارهٔ گزارش مالیات است و نه مقصد پرداخت؛ ساده‌ترین روشی که
            فرم می‌پذیرد، کمترین نوفه را در داده می‌سازد.
          */
          paymentMethodId: base.pettyCashMethodId,
          vendorBankAccountId: null,
          paymentIdentifier: null,
          billIdentifier: null,
          payeeName: null,
          pettyCashHolderId: base.pettyCashHolderId,
          beneficiaryAmount: null,
          pettyCashAmount: null,
          notes: null,
        },
      },
      actor,
    );
  }

  // گزارش روی پیش‌نویس باز نمی‌شود.
  await documents.finalize(document.id, actor);
  console.log(`✓ «${title}» — ${plan.length} فاکتور`);
  return document.id;
}

/** مجوزها از نقش‌های **واقعی** همان کاربر؛ سند نمونه نباید با مجوز ساختگی ساخته شود. */
async function resolveActor(): Promise<AuthenticatedUser> {
  const user = await prisma.user.findFirst({
    where: { isActive: true },
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) throw new Error('هیچ کاربری ثبت نشده است؛ ابتدا داده مرجع را seed کنید');

  const permissions = new Set<Permission>();
  for (const link of user.roles) {
    for (const permission of DEFAULT_ROLE_PERMISSIONS[
      link.role.key as keyof typeof DEFAULT_ROLE_PERMISSIONS
    ] ?? []) {
      permissions.add(permission);
    }
  }

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roles: user.roles.map((link) => link.role.key),
    permissions: [...permissions],
    sessionId: 'seed',
  };
}

interface BaseData {
  readonly buyerEntityId: string;
  readonly fiscalYear: number;
  readonly jalaliYear: number;
  readonly chapterId: string;
  readonly normalTypeId: string;
  readonly unitId: string;
  readonly pettyCashMethodId: string;
  readonly pettyCashHolderId: string;
}

async function ensureBaseData(): Promise<BaseData> {
  const buyer = await prisma.buyerEntity.findFirst({ where: { isActive: true } });
  if (!buyer) throw new Error('مجموعه خریداری ثبت نشده است');

  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { isClosed: false },
    orderBy: { year: 'desc' },
  });
  if (!fiscalYear) throw new Error('سال مالی بازی ثبت نشده است');

  const chapter = await prisma.budgetChapter.findFirst({ where: { isActive: true } });
  if (!chapter) throw new Error('فصل بودجه‌ای ثبت نشده است');

  const normalType = await prisma.invoiceType.findUnique({ where: { key: 'NORMAL' } });
  if (!normalType) throw new Error('نوع فاکتور عادی ثبت نشده است');

  // بدون این اتصال، سرویس ثبت فاکتور فصل را برای این نوع نمی‌پذیرد.
  await prisma.chapterInvoiceType.upsert({
    where: { chapterId_invoiceTypeId: { chapterId: chapter.id, invoiceTypeId: normalType.id } },
    update: {},
    create: { chapterId: chapter.id, invoiceTypeId: normalType.id },
  });

  const unit = await prisma.measurementUnit.findFirst({ where: { isActive: true } });
  if (!unit) throw new Error('واحد اندازه‌گیری ثبت نشده است');

  const pettyCash = await prisma.paymentMethod.findFirst({
    where: { key: 'PETTY_CASH', isActive: true },
  });
  if (!pettyCash) throw new Error('روش پرداخت تنخواه ثبت نشده است');

  const holder =
    (await prisma.pettyCashHolder.findFirst({ where: { isActive: true } })) ??
    (await prisma.pettyCashHolder.create({
      data: {
        fullName: 'تنخواه‌گردان نمونه',
        ibanNormalized: 'IR062960000000100324200001',
        bankCode: '029',
        isActive: true,
      },
    }));

  return {
    buyerEntityId: buyer.id,
    fiscalYear: fiscalYear.year,
    jalaliYear: fiscalYear.year,
    chapterId: chapter.id,
    normalTypeId: normalType.id,
    unitId: unit.id,
    pettyCashMethodId: pettyCash.id,
    pettyCashHolderId: holder.id,
  };
}

/**
 * فروشنده‌ها، بدون ساختنِ دوباره در اجرای بعدی.
 *
 * نام فروشنده یکتا **نیست**، پس upsert روی نام کار نمی‌کند؛ ولی شمارهٔ اقتصادی و
 * کد ملی در دیتابیس یکتا هستند (ایندکس جزئی روی مقدار ناتهی). پس جست‌وجو اول با
 * همان شناسه‌ها انجام می‌شود و بعد با نام — وگرنه اجرای دوم با خطای یکتایی
 * می‌افتاد، همان‌طور که افتاد.
 */
async function ensureVendors(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const spec of VENDORS) {
    const identity = [
      ...(spec.economicCode === undefined ? [] : [{ economicCode: spec.economicCode }]),
      ...(spec.nationalId === undefined ? [] : [{ nationalId: spec.nationalId }]),
      { name: spec.name },
    ];
    const existing = await prisma.vendor.findFirst({ where: { OR: identity } });
    const vendor =
      existing ??
      (await prisma.vendor.create({
        data: {
          name: spec.name,
          personType: spec.personType,
          representativeName: spec.representativeName ?? null,
          economicCode: spec.economicCode ?? null,
          nationalId: spec.nationalId ?? null,
          addressLine: spec.addressLine ?? null,
          postalCode: spec.postalCode ?? null,
          phone: spec.phone ?? null,
          isActive: true,
        },
      }));
    ids.set(spec.key, vendor.id);
  }

  return ids;
}

main()
  .catch((error: unknown) => {
    console.error('ساخت سند آزمون گزارش مالیات ناموفق بود:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
