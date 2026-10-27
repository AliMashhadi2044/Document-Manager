import type { PrismaClient } from '@prisma/client';
import { templateV1Schema, validateTemplate } from '@dm/report-engine';

import { allowedValuePaths, collectionFields } from '../../src/modules/reporting/data-dictionary';
// قالب به‌صورت import خوانده می‌شود، نه با خواندن فایل از روی مسیر.
//
// دلیلش دو شکل اجراست: همین فایل هم با tsx (ماژول ESM) اجرا می‌شود و هم به CommonJS
// کامپایل می‌شود تا در تصویر production بدون tsx قابل اجرا باشد. `import.meta.url`
// در حالت دوم اصلاً مجاز نیست، و مسیر نسبی به cwd هم در دو حالت یکی نمی‌ماند.
import taxReportTemplate from './templates/tax-report.json';
import beneficiaryIbanTemplate from './templates/beneficiary-iban-report.json';
import capitalExpenseTemplate from './templates/capital-expense-report.json';
import currentExpenseTemplate from './templates/current-expense-report.json';

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

/**
 * مقایسهٔ دو قالب، مستقل از **ترتیب کلیدها**.
 *
 * PostgreSQL ستون `jsonb` را با ترتیب کلیدِ خودش برمی‌گرداند، نه ترتیبی که نوشته
 * شده. پس `JSON.stringify` دو طرف هیچ‌وقت برابر درنمی‌آمد و هر بار اجرای seed یک
 * نسخهٔ تازه منتشر می‌کرد — قالب دست‌نخورده، ولی شمارهٔ نسخه هر بار یکی بالاتر.
 *
 * اینجا هر دو طرف با کلیدهای مرتب‌شده سریال می‌شوند تا مقایسه دربارهٔ **محتوا**
 * باشد و نه دربارهٔ شکلِ ذخیره‌سازی.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      // مقدار `undefined` در JSON وجود ندارد؛ نگه داشتنش دو طرف را ناهم‌شکل می‌کرد.
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** قالب‌های سیستمی، به ترتیبی که منتشر می‌شوند. */
const SYSTEM_TEMPLATES: readonly {
  readonly key: string;
  readonly titleFa: string;
  readonly definitionName: string;
  readonly raw: unknown;
}[] = [
  {
    key: 'TAX_REPORT',
    titleFa: 'گزارش مالیات بر ارزش افزوده',
    definitionName: 'گزارش مالیات بر ارزش افزوده (سیستمی)',
    raw: taxReportTemplate,
  },
  {
    key: 'BENEFICIARY_IBAN',
    titleFa: 'شماره شبا ذینفعان سند',
    definitionName: 'شماره شبا ذینفعان سند (سیستمی)',
    raw: beneficiaryIbanTemplate,
  },
  {
    key: 'EXPENSE_BREAKDOWN_CAPITAL',
    titleFa: 'صورت ریز هزینه‌های عمرانی انجام شده',
    definitionName: 'صورت ریز هزینه‌های عمرانی انجام شده (سیستمی)',
    raw: capitalExpenseTemplate,
  },
  {
    key: 'EXPENSE_BREAKDOWN_CURRENT',
    titleFa: 'صورت ریز هزینه‌های جاری انجام شده',
    definitionName: 'صورت ریز هزینه‌های جاری انجام شده (سیستمی)',
    raw: currentExpenseTemplate,
  },
];

export async function seedReports(prisma: PrismaClient): Promise<void> {
  for (const entry of SYSTEM_TEMPLATES) {
    await seedSystemTemplate(prisma, entry);
  }
}

/**
 * یک قالب سیستمی.
 *
 * تابع عمداً **عمومی** است و نه یکی به‌ازای هر گزارش: قاعدهٔ «نسخهٔ منتشرشده ویرایش
 * نمی‌شود» و «قالب فعال یک انتخاب صریح است» برای همهٔ گزارش‌ها یکی است، و دو نسخهٔ
 * کپی‌شده‌اش دیر یا زود واگرا می‌شدند.
 */
async function seedSystemTemplate(
  prisma: PrismaClient,
  entry: { key: string; titleFa: string; definitionName: string; raw: unknown },
): Promise<void> {
  const parsed = templateV1Schema.safeParse(entry.raw);
  if (!parsed.success) {
    throw new Error(
      `قالب «${entry.titleFa}» معتبر نیست: ${parsed.error.issues
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
      `قالب «${entry.titleFa}» با فهرست داده نمی‌خواند: ${problems
        .map((problem) => `${problem.path}: ${problem.message}`)
        .join(' | ')}`,
    );
  }

  const reportType = await prisma.reportType.upsert({
    where: { key: entry.key },
    update: { titleFa: entry.titleFa, dataScopeKey: 'document', isSystem: true },
    create: {
      key: entry.key,
      titleFa: entry.titleFa,
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
    const unchanged = canonical(existing.currentVersion.template) === canonical(template);
    if (unchanged) {
      if (reportType.activeDefinitionId === null) {
        await prisma.reportType.update({
          where: { id: reportType.id },
          data: { activeDefinitionId: existing.id },
        });
        console.log(`✓ قالب سیستمی «${entry.titleFa}» به‌عنوان قالب فعال انتخاب شد`);
        return;
      }
      console.log(`• قالب «${entry.titleFa}» بدون تغییر است`);
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

    console.log(`✓ نسخه ${nextNo} قالب «${entry.titleFa}» منتشر شد`);
    return;
  }

  const definition =
    existing ??
    (await prisma.reportDefinition.create({
      data: {
        reportTypeId: reportType.id,
        name: entry.definitionName,
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

  console.log(`✓ قالب «${entry.titleFa}» (نسخه ۱) ثبت و منتشر شد`);
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
    // «مسئول رسیدگی» پای فرم شبای ذینفعان را امضا می‌کند.
    { roleKey: 'REVIEW_LEAD', fullName: 'علی مهدوی', positionTitle: 'مسئول رسیدگی' },
    // فرم ریزهزینه‌های **جاری** سه امضا دارد؛ عمرانی دو تا.
    {
      roleKey: 'ADMIN_AFFAIRS_LEAD',
      fullName: 'علیرضا سیروسیان',
      positionTitle: 'مسئول امور اداری و رفاه',
    },
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
