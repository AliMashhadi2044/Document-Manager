/**
 * اسناد نمونه — **فقط محیط توسعه**.
 *
 * انگیزه‌اش گزارش «شماره شبا ذینفعان سند» بود: فرمی که باید هر چهار مقصد پرداخت را
 * نشان دهد (حساب ذی‌نفع، قبض، تنخواه، و پرداخت ترکیبی که در دو ردیف می‌نشیند). بدون
 * داده‌ای که همهٔ این حالت‌ها را داشته باشد، نه می‌شود فرم را دید و نه می‌شود باور
 * کرد درست است.
 *
 * **داده از همان مسیری می‌آید که کاربر می‌آید**: سرویس‌های واقعی سند و فاکتور، با
 * همان اعتبارسنجی، همان snapshotها و همان موتور مالی. نوشتن مستقیم در جدول‌ها
 * سریع‌تر بود، ولی داده‌ای می‌ساخت که قاعده‌های سامانه را رد نکرده — و اولین چیزی
 * که با آن آزموده می‌شد، خودش غلط بود.
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, type Permission } from '@dm/shared';

import { AppModule } from '../../src/app.module';
import { DocumentsService } from '../../src/modules/documents/documents.service';
import { InvoicesService } from '../../src/modules/invoices/invoices.service';
import type { AuthenticatedUser } from '../../src/common/auth/auth.decorators';

const prisma = new PrismaClient();

/** شبای معتبر با رقم کنترلی درست — همان بررسی‌ای که سرویس انجام می‌دهد. */
function ibanFor(bankCode: string, account: string): string {
  const bban = bankCode + account.padStart(19, '0');
  for (let candidate = 2; candidate <= 98; candidate += 1) {
    const iban = `IR${String(candidate).padStart(2, '0')}${bban}`;
    if (mod97(iban) === 1n) return iban;
  }
  throw new Error(`ساخت شبا برای ${bankCode}/${account} ناموفق بود`);
}

function mod97(iban: string): bigint {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0n;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const value = code >= 48 && code <= 57 ? BigInt(code - 48) : BigInt(code - 55);
    remainder = (remainder * (value >= 10n ? 100n : 10n) + value) % 97n;
  }
  return remainder;
}

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

    for (const plan of PLANS) {
      await buildDocument(documents, invoices, actor, base, plan);
    }

    console.log(`✓ ${PLANS.length} سند نمونه ثبت و نهایی شد`);
  } finally {
    await context.close();
  }
}

/**
 * کاربرِ ثبت‌کننده.
 *
 * مجوزها از **نقش‌های واقعی همان کاربر** خوانده می‌شوند و نه یک فهرست دلخواه: اگر
 * سند نمونه با مجوزی ساخته شود که کاربر واقعی ندارد، داده‌ای می‌ماند که از راه
 * معمول ساخته نمی‌شد.
 */
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
  readonly methodByKey: ReadonlyMap<string, string>;
  readonly vendors: ReadonlyMap<string, { id: string; accountId: string }>;
  readonly billVendors: ReadonlyMap<string, string>;
  readonly pettyCashHolderId: string;
}

/** فروشنده‌هایی که روی فرم مرجع بودند، با شبای معتبر خودشان. */
const VENDORS = [
  { name: 'مرکز آموزشی رفاهی فرهنگیان', bank: '010', account: '4076031203895764' },
  { name: 'زینب معارف وند', bank: '018', account: '53379400901' },
  { name: 'شرکت زرین اقبال بهارستان', bank: '012', account: '90152810370' },
  { name: 'حامد قمقامی', bank: '016', account: '91505892900' },
] as const;

/** طرف‌های قبض: مدرسه‌هایی که قبضشان پرداخت می‌شود. */
const BILL_VENDORS = ['مدرسه فرشته کوچک', 'مدرسه ورجان'] as const;

interface InvoicePlan {
  readonly description: string;
  readonly unitPrice: string;
  readonly method: 'BENEFICIARY_ACCOUNT' | 'BILL' | 'PETTY_CASH' | 'SPLIT';
  readonly vendor?: string;
  readonly billVendor?: string;
  readonly billIdentifier?: string;
  readonly paymentIdentifier?: string;
  /** سهم ذی‌نفع در پرداخت ترکیبی؛ بقیه سهم کارپرداز است. */
  readonly beneficiaryShare?: string;
}

interface DocumentPlan {
  readonly title: string;
  readonly invoices: readonly InvoicePlan[];
}

/*
  سه سند، هر کدام یک ترکیب متفاوت.

  سند اول همهٔ مقصدها را با هم دارد — همان حالتی که سخت‌ترین است و باید دیده شود.
*/
const PLANS: readonly DocumentPlan[] = [
  {
    title: 'سند نمونه — همه مقصدهای پرداخت',
    invoices: [
      // دو فاکتور به یک حساب، با دو شناسهٔ پرداخت متفاوت: یک ردیف، دو شناسه.
      {
        description: 'اجاره سالن همایش',
        unitPrice: '4201678000',
        method: 'BENEFICIARY_ACCOUNT',
        vendor: 'مرکز آموزشی رفاهی فرهنگیان',
        paymentIdentifier: '385031276140',
      },
      {
        description: 'پذیرایی همایش',
        unitPrice: '24330000',
        method: 'BENEFICIARY_ACCOUNT',
        vendor: 'مرکز آموزشی رفاهی فرهنگیان',
        paymentIdentifier: '145011111400',
      },
      {
        description: 'خدمات نظافت',
        unitPrice: '449750000',
        method: 'BENEFICIARY_ACCOUNT',
        vendor: 'زینب معارف وند',
        paymentIdentifier: '533794009012',
      },
      {
        description: 'خرید تجهیزات اداری',
        unitPrice: '2277000000',
        method: 'SPLIT',
        vendor: 'شرکت زرین اقبال بهارستان',
        beneficiaryShare: '2000000000',
        paymentIdentifier: '901528103711',
      },
      {
        description: 'ملزومات مصرفی',
        unitPrice: '883604000',
        method: 'PETTY_CASH',
      },
    ],
  },
  {
    title: 'سند نمونه — قبوض مدارس',
    invoices: [
      {
        description: 'قبض برق مدرسه',
        unitPrice: '1716576000',
        method: 'BILL',
        billVendor: 'مدرسه فرشته کوچک',
        billIdentifier: '5001510724423',
        paymentIdentifier: '171657610146',
      },
      {
        description: 'قبض گاز مدرسه',
        unitPrice: '750415000',
        method: 'BILL',
        billVendor: 'مدرسه ورجان',
        billIdentifier: '5004473124428',
        paymentIdentifier: '750415101261',
      },
      {
        description: 'تعمیر تاسیسات',
        unitPrice: '140000000',
        method: 'BENEFICIARY_ACCOUNT',
        vendor: 'حامد قمقامی',
      },
      {
        description: 'هزینه‌های متفرقه',
        unitPrice: '483490510',
        method: 'PETTY_CASH',
      },
    ],
  },
  {
    title: 'سند نمونه — پرداخت ترکیبی',
    invoices: [
      {
        description: 'خرید لوازم کارگاه',
        unitPrice: '1000000000',
        method: 'SPLIT',
        vendor: 'زینب معارف وند',
        beneficiaryShare: '600000000',
      },
      {
        description: 'حمل و نقل',
        unitPrice: '120000000',
        method: 'PETTY_CASH',
      },
    ],
  },
];

/** نام فروشنده یکتا **نیست**، پس upsert روی نام کار نمی‌کند. */
async function findOrCreateVendor(name: string): Promise<{ id: string }> {
  const existing = await prisma.vendor.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.vendor.create({ data: { name, personType: 'LEGAL', isActive: true } });
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

  // اتصال فصل به نوع فاکتور عادی لازم است، وگرنه سرویس ثبت فاکتور ردش می‌کند.
  await prisma.chapterInvoiceType.upsert({
    where: { chapterId_invoiceTypeId: { chapterId: chapter.id, invoiceTypeId: normalType.id } },
    update: {},
    create: { chapterId: chapter.id, invoiceTypeId: normalType.id },
  });

  const unit = await prisma.measurementUnit.findFirst({ where: { isActive: true } });
  if (!unit) throw new Error('واحد اندازه‌گیری ثبت نشده است');

  const methods = await prisma.paymentMethod.findMany({ where: { isActive: true } });
  const methodByKey = new Map(methods.map((method) => [method.key, method.id]));

  const vendors = new Map<string, { id: string; accountId: string }>();
  for (const entry of VENDORS) {
    const vendor = await findOrCreateVendor(entry.name);

    const iban = ibanFor(entry.bank, entry.account);
    const account = await prisma.vendorBankAccount.upsert({
      where: { ibanNormalized: iban },
      update: { isActive: true },
      create: {
        vendorId: vendor.id,
        // `iban` مقدار واردشدهٔ کاربر است و `ibanNormalized` مبنای یکتایی؛ اینجا
        // هر دو یکی‌اند چون مولد از همان ابتدا شکل نرمال را می‌سازد.
        iban,
        ibanNormalized: iban,
        // کلید بانک همان کد سه‌رقمی شباست؛ اگر بانک ثبت نشده باشد، حساب بدون
        // بانک می‌ماند و فرم ستونش را خالی نشان می‌دهد — نه اینکه ثبت شکست بخورد.
        bankCode: entry.bank,
        isActive: true,
        isDefault: true,
      },
    });

    vendors.set(entry.name, { id: vendor.id, accountId: account.id });
  }

  const billVendors = new Map<string, string>();
  for (const name of BILL_VENDORS) {
    const vendor = await findOrCreateVendor(name);
    billVendors.set(name, vendor.id);
  }

  const holderIban = ibanFor('017', '883604000123');
  const existingHolder = await prisma.pettyCashHolder.findFirst({
    where: { fullName: 'محمدصادق محمدی' },
  });
  const holder =
    existingHolder ??
    (await prisma.pettyCashHolder.create({
      data: {
        fullName: 'محمدصادق محمدی',
        ibanNormalized: holderIban,
        bankCode: '017',
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
    methodByKey,
    vendors,
    billVendors,
    pettyCashHolderId: holder.id,
  };
}

async function buildDocument(
  documents: DocumentsService,
  invoices: InvoicesService,
  actor: AuthenticatedUser,
  base: BaseData,
  plan: DocumentPlan,
): Promise<void> {
  // عنوان یکتا می‌شود تا اجرای دوباره، سند قبلی را دست نزند و دو نسخه هم نسازد.
  const title = `${plan.title} (${new Date().toISOString().slice(0, 10)})`;
  const already = await prisma.financialDocument.findFirst({ where: { title, deletedAt: null } });
  if (already) {
    console.log(`• «${title}» از قبل هست`);
    return;
  }

  const document = await documents.create(
    {
      title,
      type: 'NORMAL',
      fiscalYear: base.fiscalYear,
      jalaliYear: base.jalaliYear,
      buyerEntityId: base.buyerEntityId,
      workflowNumber: `WF-${Math.floor(Math.random() * 90_000) + 10_000}`,
      workflowDate: `${base.fiscalYear + 621}-10-01`,
      stad: null,
    },
    actor,
  );

  for (const [index, item] of plan.invoices.entries()) {
    const vendorId =
      item.method === 'BILL'
        ? (base.billVendors.get(item.billVendor as string) as string)
        : item.method === 'PETTY_CASH'
          ? null
          : (base.vendors.get(item.vendor as string)?.id ?? null);

    const total = BigInt(item.unitPrice);
    const beneficiary = item.beneficiaryShare === undefined ? null : BigInt(item.beneficiaryShare);

    await invoices.create(
      document.id,
      {
        chapterId: base.chapterId,
        invoiceTypeId: base.normalTypeId,
        vendorId,
        invoiceNumber: `${1000 + index}`,
        invoiceDate: `${base.fiscalYear + 621}-10-${String(index + 1).padStart(2, '0')}`,
        description: item.description,
        notes: null,
        details: {
          kind: 'NORMAL',
          taxMode: 'AMOUNT',
          taxRateBp: null,
          // مالیات صفر: این داده برای دیدن مقصدهای پرداخت است و مبلغ گرد، خواندن
          // فرم را ساده می‌کند.
          taxAmount: '0',
          items: [
            {
              rowNo: 1,
              description: item.description,
              productCode: null,
              quantity: '1',
              unitId: base.unitId,
              unitPrice: item.unitPrice,
              discountAmount: '0',
              taxMode: 'AMOUNT',
              taxRateBp: null,
              taxAmount: '0',
            },
          ],
        },
        payment: {
          paymentMethodId: base.methodByKey.get(
            item.method === 'SPLIT' ? 'SPLIT' : item.method,
          ) as string,
          vendorBankAccountId:
            item.method === 'BENEFICIARY_ACCOUNT' || item.method === 'SPLIT'
              ? (base.vendors.get(item.vendor as string)?.accountId ?? null)
              : null,
          paymentIdentifier: item.paymentIdentifier ?? null,
          billIdentifier: item.billIdentifier ?? null,
          pettyCashHolderId:
            item.method === 'PETTY_CASH' || item.method === 'SPLIT' ? base.pettyCashHolderId : null,
          beneficiaryAmount: beneficiary === null ? null : beneficiary.toString(),
          pettyCashAmount: beneficiary === null ? null : (total - beneficiary).toString(),
          notes: null,
        },
      },
      actor,
    );
  }

  // ثبت نهایی تا گزارش‌ها قابل اجرا باشند؛ گزارش روی پیش‌نویس باز نمی‌شود.
  await documents.finalize(document.id, actor);
  console.log(`✓ «${title}» با ${plan.invoices.length} فاکتور`);
}

main()
  .catch((error: unknown) => {
    console.error('ثبت اسناد نمونه ناموفق بود:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
