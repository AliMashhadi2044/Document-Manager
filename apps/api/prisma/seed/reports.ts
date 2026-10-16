import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { templateV1Schema, validateTemplate } from '@dm/report-engine';

import { allowedValuePaths, collectionFields } from '../../src/modules/reporting/data-dictionary';

/**
 * گزارش مالیات به‌صورت **داده**، نه کد (docs/09 §۹).
 *
 * قالب یک فایل JSON در مخزن است تا در بازبینی کد دیده شود و در فاز ۷ همان را بشود در
 * طراح بصری باز کرد. اگر این گزارش کد اختصاصی داشت، «افزودن گزارش تازه بدون تغییر
 * کد» — که کل هدف این زیرسیستم است — از همان اولین گزارش نقض می‌شد.
 *
 * قالب پیش از نوشتن در دیتابیس با همان schema موتور اعتبارسنجی می‌شود: قالب خرابِ
 * seed‌شده یعنی خطایی که تازه موقع اجرای گزارش توسط کاربر پیدا می‌شود.
 */

const here = dirname(fileURLToPath(import.meta.url));

export async function seedReports(prisma: PrismaClient): Promise<void> {
  const raw: unknown = JSON.parse(
    readFileSync(join(here, 'templates', 'tax-report.json'), 'utf8'),
  );

  const parsed = templateV1Schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `قالب گزارش مالیات معتبر نیست: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(' | ')}`,
    );
  }
  const template = parsed.data;

  /**
   * اعتبارسنجی در برابر Data Dictionary، نه فقط schema.
   *
   * schema می‌گوید «ساختار درست است»؛ این بررسی می‌گوید «به داده‌ای اشاره می‌کند که
   * وجود دارد». قالب seed‌شده‌ای که به ستون ناموجود اشاره کند، باید همین‌جا خطا بدهد،
   * نه وقتی کاربر گزارش می‌گیرد و سلول خالی می‌بیند.
   */
  const problems = validateTemplate(template, {
    allowedValuePaths: allowedValuePaths(),
    collections: collectionFields(),
  });
  if (problems.length > 0) {
    throw new Error(
      `قالب گزارش مالیات با فهرست داده نمی‌خواند: ${problems
        .map((problem) => `${problem.path}: ${problem.message}`)
        .join(' | ')}`,
    );
  }

  const reportType = await prisma.reportType.upsert({
    where: { key: 'TAX_REPORT' },
    update: { titleFa: 'گزارش مالیات بر ارزش افزوده', dataScopeKey: 'document', isSystem: true },
    create: {
      key: 'TAX_REPORT',
      titleFa: 'گزارش مالیات بر ارزش افزوده',
      dataScopeKey: 'document',
      isSystem: true,
    },
  });

  const existing = await prisma.reportDefinition.findFirst({
    where: { reportTypeId: reportType.id, isSystem: true },
    include: { currentVersion: true },
  });

  if (existing?.currentVersion) {
    // نسخه منتشرشده **ویرایش نمی‌شود**. اگر فایل قالب عوض شده باشد، نسخه تازه‌ای
    // ساخته می‌شود تا خروجی‌های تاریخی به نسخه خودشان بسته بمانند.
    const unchanged =
      JSON.stringify(existing.currentVersion.template) === JSON.stringify(template);
    if (unchanged) {
      if (reportType.activeDefinitionId === null) {
        await prisma.reportType.update({
          where: { id: reportType.id },
          data: { activeDefinitionId: existing.id },
        });
        console.log('✓ قالب سیستمی گزارش مالیات به‌عنوان قالب فعال انتخاب شد');
        return;
      }
      console.log('• قالب گزارش مالیات بدون تغییر است');
      return;
    }

    const highest = await prisma.reportVersion.aggregate({
      where: { definitionId: existing.id },
      _max: { versionNo: true },
    });
    const nextNo = (highest._max.versionNo ?? 0) + 1;

    const version = await prisma.reportVersion.create({
      data: {
        definitionId: existing.id,
        versionNo: nextNo,
        status: 'PUBLISHED',
        templateSchemaVersion: template.schemaVersion,
        template,
        publishedAt: new Date(),
      },
    });
    await prisma.reportDefinition.update({
      where: { id: existing.id },
      data: { currentVersionId: version.id },
    });

    if (reportType.activeDefinitionId === null) {
      await prisma.reportType.update({
        where: { id: reportType.id },
        data: { activeDefinitionId: existing.id },
      });
    }

    console.log(`✓ نسخه ${nextNo} قالب گزارش مالیات منتشر شد`);
    return;
  }

  const definition =
    existing ??
    (await prisma.reportDefinition.create({
      data: {
        reportTypeId: reportType.id,
        name: 'گزارش مالیات بر ارزش افزوده (سیستمی)',
        status: 'PUBLISHED',
        isSystem: true,
      },
    }));

  const version = await prisma.reportVersion.create({
    data: {
      definitionId: definition.id,
      versionNo: 1,
      status: 'PUBLISHED',
      templateSchemaVersion: template.schemaVersion,
      template,
      publishedAt: new Date(),
    },
  });

  await prisma.reportDefinition.update({
    where: { id: definition.id },
    data: { currentVersionId: version.id, status: 'PUBLISHED' },
  });

  // قالب فعال این نوع گزارش: تا وقتی کاربر قالب دیگری را فعال نکند، همین اجرا می‌شود.
  await prisma.reportType.update({
    where: { id: reportType.id },
    data: { activeDefinitionId: definition.id },
  });

  console.log('✓ قالب گزارش مالیات (نسخه ۱) ثبت و منتشر شد');
}

/**
 * انواع کالا و امضاکنندگان نمونه.
 *
 * نام امضاکنندگان از سند مرجع (docs/15 §۵) می‌آید و با `upsert` روی ترکیب نقش ثبت
 * می‌شود تا تغییر بعدی کاربر از بین نرود.
 */
export async function seedProductTypesAndSignatories(prisma: PrismaClient): Promise<void> {
  const productTypes = [
    'انشعاب برق',
    'انشعاب آب',
    'انشعاب گاز',
    'چاه ارت',
    'لوازم مصرفی',
    'خدمات',
    'سوخت خودرو',
  ];
  for (const [index, title] of productTypes.entries()) {
    await prisma.productType.upsert({
      where: { title },
      update: {},
      create: { title, sortOrder: index },
    });
  }

  const signatories = [
    { roleKey: 'PROCUREMENT_LEAD', fullName: 'محمدصادق محمدی', positionTitle: 'مسئول کارپردازی' },
    { roleKey: 'GENERAL_MANAGER', fullName: 'احمدرضا اجتهادی', positionTitle: 'مدیرکل' },
  ];
  for (const [index, signatory] of signatories.entries()) {
    const existing = await prisma.signatory.findFirst({ where: { roleKey: signatory.roleKey } });
    if (!existing) {
      await prisma.signatory.create({ data: { ...signatory, sortOrder: index } });
    }
  }

  console.log(`✓ ${productTypes.length} نوع کالا و ${signatories.length} امضاکننده`);
}
