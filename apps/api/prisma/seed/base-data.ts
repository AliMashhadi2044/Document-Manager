/**
 * داده پایه ساختاری — بخشی از داده مرجع.
 *
 * قاعده §۸ پرامپت: هیچ فهرستی (فصل، ناحیه، خودرو، سوخت، نوع درخواست) در **کد** نوشته
 * نمی‌شود. آنچه اینجاست **داده اولیه** است: کاربر می‌تواند ویرایش، غیرفعال یا اضافه کند
 * و هیچ منطقی به مقدار این ردیف‌ها وابسته نیست.
 *
 * تنها استثنا `kind` انواع فاکتور و `key` گروه‌های بودجه است، چون خانواده ساختاری‌اند و
 * کد برای هرکدام فرم و محاسبه‌گر دارد (docs/05-invoice-types.md §۱).
 */

import type { PrismaClient } from '@prisma/client';

import { IRAN_BANKS } from './banks';

export async function seedBanks(prisma: PrismaClient): Promise<void> {
  for (const bank of IRAN_BANKS) {
    await prisma.bank.upsert({
      where: { code: bank.code },
      update: { titleFa: bank.titleFa },
      create: bank,
    });
  }
  console.log(`✓ ${IRAN_BANKS.length} بانک ثبت شد`);
}

export async function seedPaymentMethods(prisma: PrismaClient): Promise<void> {
  const methods = [
    {
      key: 'BENEFICIARY_ACCOUNT',
      kind: 'BENEFICIARY_ACCOUNT' as const,
      titleFa: 'حساب ذی‌نفع',
      requiresPaymentIdentifier: false,
      requiresBillIdentifier: false,
      sortOrder: 1,
    },
    {
      key: 'PETTY_CASH',
      kind: 'PETTY_CASH' as const,
      titleFa: 'کارپرداز / تنخواه',
      requiresPaymentIdentifier: false,
      requiresBillIdentifier: false,
      sortOrder: 2,
    },
    {
      key: 'BILL',
      kind: 'BILL' as const,
      titleFa: 'قبض',
      requiresPaymentIdentifier: true,
      requiresBillIdentifier: true,
      sortOrder: 3,
    },
  ];

  for (const method of methods) {
    await prisma.paymentMethod.upsert({
      where: { key: method.key },
      update: { titleFa: method.titleFa },
      create: method,
    });
  }
  console.log(`✓ ${methods.length} روش پرداخت ثبت شد`);
}

export async function seedInvoiceTypes(prisma: PrismaClient): Promise<void> {
  const billMethod = await prisma.paymentMethod.findUnique({ where: { key: 'BILL' } });

  const types = [
    { key: 'NORMAL', kind: 'NORMAL' as const, titleFa: 'فاکتور عادی', sortOrder: 1, defaultPaymentMethodId: null },
    { key: 'STAD', kind: 'STAD' as const, titleFa: 'فاکتور سامانه ستاد', sortOrder: 2, defaultPaymentMethodId: null },
    {
      key: 'UTILITY',
      kind: 'UTILITY' as const,
      titleFa: 'فاکتور انشعابات',
      sortOrder: 3,
      // §۱۳.۶: روش پیش‌فرض انشعابات «قبض» است، ولی کاربر مجاز می‌تواند تغییرش دهد.
      defaultPaymentMethodId: billMethod?.id ?? null,
    },
    { key: 'FUEL', kind: 'FUEL' as const, titleFa: 'فاکتور سوخت', sortOrder: 4, defaultPaymentMethodId: null },
  ];

  for (const type of types) {
    await prisma.invoiceType.upsert({
      where: { key: type.key },
      update: { titleFa: type.titleFa, defaultPaymentMethodId: type.defaultPaymentMethodId },
      create: type,
    });
  }
  console.log(`✓ ${types.length} نوع فاکتور ثبت شد`);
}

export async function seedBudgetStructure(prisma: PrismaClient): Promise<void> {
  const categories = [
    { key: 'CURRENT' as const, titleFa: 'جاری', sortOrder: 1 },
    { key: 'CAPITAL' as const, titleFa: 'عمرانی', sortOrder: 2 },
  ];

  for (const category of categories) {
    await prisma.budgetCategory.upsert({
      where: { key: category.key },
      update: { titleFa: category.titleFa },
      create: category,
    });
  }

  // فصل‌های نمونه از §۸.۴ پرامپت — داده اولیه و کاملاً قابل ویرایش.
  const chapters: Array<{
    categoryKey: 'CURRENT' | 'CAPITAL';
    title: string;
    code: string | null;
    invoiceTypeKeys: string[];
    sortOrder: number;
  }> = [
    { categoryKey: 'CURRENT', title: 'مواد مصرفی', code: '2213000', invoiceTypeKeys: ['NORMAL', 'STAD'], sortOrder: 1 },
    { categoryKey: 'CURRENT', title: 'غذا و پذیرایی', code: '2208000', invoiceTypeKeys: ['NORMAL', 'STAD'], sortOrder: 2 },
    { categoryKey: 'CURRENT', title: 'سوخت خودرو', code: null, invoiceTypeKeys: ['FUEL'], sortOrder: 3 },

    { categoryKey: 'CAPITAL', title: 'تعمیرات', code: 'فصل ۱', invoiceTypeKeys: ['NORMAL', 'STAD'], sortOrder: 1 },
    { categoryKey: 'CAPITAL', title: 'تجهیزات', code: 'فصل ۲', invoiceTypeKeys: ['NORMAL', 'STAD'], sortOrder: 2 },
    { categoryKey: 'CAPITAL', title: 'سایبری', code: 'فصل ۴', invoiceTypeKeys: ['NORMAL', 'STAD'], sortOrder: 3 },
    { categoryKey: 'CAPITAL', title: 'انشعابات', code: 'فصل ۷', invoiceTypeKeys: ['UTILITY'], sortOrder: 4 },
    { categoryKey: 'CAPITAL', title: 'سوخت خودرو', code: 'فصل ۸', invoiceTypeKeys: ['FUEL'], sortOrder: 5 },
  ];

  for (const chapter of chapters) {
    const category = await prisma.budgetCategory.findUnique({ where: { key: chapter.categoryKey } });
    if (!category) continue;

    const record = await prisma.budgetChapter.upsert({
      where: { categoryId_title: { categoryId: category.id, title: chapter.title } },
      update: { code: chapter.code, sortOrder: chapter.sortOrder },
      create: {
        categoryId: category.id,
        title: chapter.title,
        code: chapter.code,
        sortOrder: chapter.sortOrder,
      },
    });

    // اتصال فصل به انواع فاکتور مجاز — همان چیزی که فرم فاکتور را انتخاب می‌کند.
    for (const [index, key] of chapter.invoiceTypeKeys.entries()) {
      const invoiceType = await prisma.invoiceType.findUnique({ where: { key } });
      if (!invoiceType) continue;

      await prisma.chapterInvoiceType.upsert({
        where: {
          chapterId_invoiceTypeId: { chapterId: record.id, invoiceTypeId: invoiceType.id },
        },
        update: { isDefault: index === 0, sortOrder: index },
        create: {
          chapterId: record.id,
          invoiceTypeId: invoiceType.id,
          isDefault: index === 0,
          sortOrder: index,
        },
      });
    }
  }

  console.log(`✓ ${categories.length} گروه بودجه و ${chapters.length} فصل ثبت شد`);
}

export async function seedLookups(prisma: PrismaClient): Promise<void> {
  const utilityTypes = ['آب', 'برق', 'گاز', 'تلفن'];
  for (const [index, title] of utilityTypes.entries()) {
    await prisma.utilityType.upsert({
      where: { title },
      update: {},
      create: { title, sortOrder: index },
    });
  }

  const fuelTypes = ['بنزین', 'گازوئیل', 'گاز CNG'];
  for (const [index, title] of fuelTypes.entries()) {
    await prisma.fuelType.upsert({
      where: { title },
      update: {},
      create: { title, sortOrder: index },
    });
  }

  // §۸.۸ — گزینه‌های اولیه انواع درخواست سامانه ستاد
  const requestTypes = ['استعلام عمومی', 'خرید مستقیم', 'سفارش مستقیم'];
  for (const [index, title] of requestTypes.entries()) {
    await prisma.stadRequestType.upsert({
      where: { title },
      update: {},
      create: { title, sortOrder: index },
    });
  }

  const units = ['عدد', 'کیلوگرم', 'لیتر', 'متر', 'بسته', 'سرویس'];
  for (const [index, title] of units.entries()) {
    await prisma.measurementUnit.upsert({
      where: { title },
      update: {},
      create: { title, sortOrder: index },
    });
  }

  console.log(
    `✓ فهرست‌های پایه: ${utilityTypes.length} انشعاب، ${fuelTypes.length} سوخت، ` +
      `${requestTypes.length} نوع درخواست، ${units.length} واحد`,
  );
}

/**
 * سال مالی و نرخ مالیات.
 * نرخ ۱۰٪ (تصمیم Q4) به‌صورت **داده** ثبت می‌شود؛ هیچ نرخ قانونی در کد نیست.
 */
export async function seedFiscalYearsAndTaxRates(prisma: PrismaClient): Promise<void> {
  const currentJalaliYear = 1405;
  const years = [currentJalaliYear - 1, currentJalaliYear, currentJalaliYear + 1];

  for (const year of years) {
    await prisma.fiscalYear.upsert({
      where: { year },
      update: {},
      create: { year },
    });

    // upsert روی ایندکس جزئی ممکن نیست (Prisma مقدار null را در where مرکب
    // نمی‌پذیرد)، پس وجود رکورد صریحاً بررسی می‌شود.
    const existing = await prisma.taxRate.findFirst({
      where: { fiscalYear: year, invoiceTypeId: null },
    });
    if (!existing) {
      await prisma.taxRate.create({
        data: { fiscalYear: year, rateBp: 1000, notes: 'نرخ پیش‌فرض سازمان: ۱۰ درصد' },
      });
    }
  }

  console.log(`✓ ${years.length} سال مالی با نرخ مالیات ۱۰ درصد`);
}

export async function seedOrganization(prisma: PrismaClient): Promise<void> {
  await prisma.organizationSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'سازمان' },
  });
  console.log('✓ تنظیمات سازمان ایجاد شد (نام و مشخصات را از رابط تکمیل کنید)');
}
