import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { templateV1Schema, validateTemplate, type TemplateV1 } from '@dm/report-engine';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { allowedValuePaths, collectionFields } from './data-dictionary';

/**
 * مدیریت قالب‌های گزارش — لایه‌ای که طراح بصری فاز ۷ روی آن می‌نشیند.
 *
 * دو قاعده‌ای که کل این سرویس حولشان ساخته شده (docs/09 §۵):
 *
 *  ۱. **نسخه منتشرشده هرگز ویرایش نمی‌شود.** هر ویرایش روی نسخه `DRAFT` انجام می‌شود و
 *     انتشار، نسخه تازه‌ای می‌سازد. بدون این قاعده، ویرایش یک قالب، خروجی‌های تاریخیِ
 *     بسته به آن را بی‌صدا عوض می‌کرد — و یک گزارش مالی که دیروز با امروز فرق دارد،
 *     قابل دفاع نیست.
 *
 *  ۲. **قالب پیش از ذخیره اعتبارسنجی می‌شود**، هم با schema و هم در برابر Data
 *     Dictionary. قالبی که به مسیر غیرمجاز اشاره کند اصلاً ذخیره نمی‌شود، نه اینکه
 *     موقع اجرا شکست بخورد (معیار پذیرش ۲ فاز ۷).
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * فهرست قالب‌ها.
   *
   * قالب بایگانی‌شده به‌صورت پیش‌فرض نمایش داده نمی‌شود: طراح با گذر زمان پیش‌نویس و
   * نسخه آزمایشی جمع می‌کند و فهرستی که همه‌شان را نشان دهد، قالب‌های واقعی را گم
   * می‌کند. بایگانی **حذف نیست** — خروجی‌های تاریخیِ بسته به آن قالب باید بمانند.
   */
  async list(includeArchived = false) {
    const definitions = await this.prisma.reportDefinition.findMany({
      where: includeArchived ? {} : { status: { not: 'ARCHIVED' } },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
      include: {
        reportType: { select: { key: true, titleFa: true, activeDefinitionId: true } },
        currentVersion: { select: { id: true, versionNo: true, publishedAt: true } },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { versions: true, runs: true } },
      },
    });

    return definitions.map((definition) => ({
      id: definition.id,
      name: definition.name,
      status: definition.status,
      isSystem: definition.isSystem,
      reportType: {
        key: definition.reportType.key,
        titleFa: definition.reportType.titleFa,
      },
      /** همین قالب است که با کلید نوع گزارش اجرا می‌شود؟ */
      isActive: definition.reportType.activeDefinitionId === definition.id,
      currentVersion: definition.currentVersion,
      createdBy: definition.createdBy,
      versionCount: definition._count.versions,
      runCount: definition._count.runs,
      updatedAt: definition.updatedAt,
    }));
  }

  async detail(definitionId: string) {
    const definition = await this.prisma.reportDefinition.findUnique({
      where: { id: definitionId },
      include: {
        reportType: {
          select: { key: true, titleFa: true, dataScopeKey: true, activeDefinitionId: true },
        },
        versions: {
          orderBy: { versionNo: 'desc' },
          select: {
            id: true,
            versionNo: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            createdBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!definition) throw AppError.notFound('قالب گزارش یافت نشد');

    return {
      id: definition.id,
      name: definition.name,
      status: definition.status,
      isSystem: definition.isSystem,
      reportType: {
        key: definition.reportType.key,
        titleFa: definition.reportType.titleFa,
        dataScopeKey: definition.reportType.dataScopeKey,
      },
      isActive: definition.reportType.activeDefinitionId === definition.id,
      currentVersionId: definition.currentVersionId,
      versions: definition.versions,
    };
  }

  /**
   * امضاکنندگان فعال — برای تنظیم بلوک امضا در طراح.
   *
   * نام و سمت در **لحظه تولید خروجی** snapshot می‌شوند؛ قالب فقط `roleKey` را نگه
   * می‌دارد. پس تغییر بعدی اطلاعات پایه، قالب را دست‌نخورده می‌گذارد و خروجی تازه،
   * نام تازه را می‌گیرد. این فهرست صرفاً برای انتخاب نقش است، نه برای ذخیره نام.
   */
  async signatories() {
    const rows = await this.prisma.signatory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { roleKey: true, fullName: true, positionTitle: true },
    });

    // یک نقش می‌تواند چند ردیف داشته باشد؛ طراح نقش را انتخاب می‌کند، نه شخص را.
    const byRole = new Map<string, { roleKey: string; fullName: string; positionTitle: string }>();
    for (const row of rows) if (!byRole.has(row.roleKey)) byRole.set(row.roleKey, row);
    return [...byRole.values()];
  }

  /** محتوای یک نسخه — همان JSON قالب که طراح بازش می‌کند. */
  async version(versionId: string): Promise<{
    id: string;
    versionNo: number;
    status: 'DRAFT' | 'PUBLISHED';
    definitionId: string;
    template: TemplateV1;
  }> {
    const version = await this.prisma.reportVersion.findUnique({ where: { id: versionId } });
    if (!version) throw AppError.notFound('نسخه قالب یافت نشد');

    const parsed = templateV1Schema.safeParse(version.template);
    if (!parsed.success) {
      throw new AppError(
        'REPORT_TEMPLATE_INVALID',
        'قالب ذخیره‌شده معتبر نیست',
        500,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    return {
      id: version.id,
      versionNo: version.versionNo,
      status: version.status,
      definitionId: version.definitionId,
      template: parsed.data,
    };
  }

  /**
   * قالبی که کاربر می‌تواند همین حالا ویرایشش کند.
   *
   * قاعدهٔ «قالب سیستمی ویرایش نمی‌شود» سر جایش است — همان است که همیشه یک مرجع
   * بازگشت سالم نگه می‌دارد. ولی تا امروز اجرایش به عهدهٔ **کاربر** بود: باید
   * می‌فهمید کپی لازم است، از فهرست کپی می‌گرفت، اسم می‌گذاشت، کپی را پیدا
   * می‌کرد و بعد ویرایش می‌کرد. چهار گام پیش از اینکه حتی یک حاشیه را عوض کند.
   *
   * حالا همین‌جا انجام می‌شود:
   *  - قالب غیرسیستمی ⇒ خودش.
   *  - قالب سیستمی ⇒ اگر قالبِ **فعالِ** این نوع گزارش غیرسیستمی است، همان
   *    (چون همان است که خروجی را می‌سازد و کاربر واقعاً می‌خواهد عوضش کند)؛
   *    وگرنه یک کپی با نام قراردادی.
   *
   * و کپی **دوباره ساخته نمی‌شود**: اگر کپیِ هم‌نام از قبل هست، همان برمی‌گردد.
   * زدن دوبارهٔ «ویرایش» نباید فهرست قالب‌ها را از کپی‌های تکراری پر کند.
   */
  async editable(definitionId: string, user: AuthenticatedUser) {
    const source = await this.prisma.reportDefinition.findUnique({
      where: { id: definitionId },
      include: { reportType: { select: { id: true, activeDefinitionId: true } } },
    });
    if (!source) throw AppError.notFound('قالب گزارش یافت نشد');

    if (!source.isSystem) return { definitionId: source.id, created: false };

    if (source.reportType.activeDefinitionId !== null) {
      const active = await this.prisma.reportDefinition.findUnique({
        where: { id: source.reportType.activeDefinitionId },
        select: { id: true, isSystem: true, status: true },
      });
      if (active && !active.isSystem && active.status !== 'ARCHIVED') {
        return { definitionId: active.id, created: false };
      }
    }

    const name = `${source.name} — نسخهٔ سازمانی`;
    const existing = await this.prisma.reportDefinition.findFirst({
      where: {
        reportTypeId: source.reportTypeId,
        name,
        isSystem: false,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });
    if (existing) return { definitionId: existing.id, created: false };

    const copy = await this.copy(definitionId, name, user);
    return { definitionId: copy.id, created: true };
  }

  /**
   * کپی یک قالب.
   *
   * قالب سیستمی (گزارش مالیات) **ویرایش مستقیم نمی‌شود**؛ کپی می‌شود و کپی ویرایش
   * می‌شود. پس همیشه یک مرجع بازگشت سالم باقی می‌ماند (docs/09 §۵).
   */
  async copy(definitionId: string, name: string, user: AuthenticatedUser) {
    const source = await this.prisma.reportDefinition.findUnique({
      where: { id: definitionId },
      include: { currentVersion: true, versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
    });
    if (!source) throw AppError.notFound('قالب گزارش یافت نشد');

    const sourceVersion = source.currentVersion ?? source.versions[0];
    if (!sourceVersion) throw AppError.notFound('این قالب هیچ نسخه‌ای ندارد');

    const created = await this.prisma.$transaction(async (tx) => {
      const definition = await tx.reportDefinition.create({
        data: {
          reportTypeId: source.reportTypeId,
          name,
          status: 'DRAFT',
          isSystem: false,
          createdById: user.id,
        },
      });

      await tx.reportVersion.create({
        data: {
          definitionId: definition.id,
          versionNo: 1,
          status: 'DRAFT',
          templateSchemaVersion: sourceVersion.templateSchemaVersion,
          template: sourceVersion.template as Prisma.InputJsonValue,
          createdById: user.id,
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'REPORT_TEMPLATE_COPY',
          entityType: 'reportDefinition',
          entityId: definition.id,
          after: { name, copiedFrom: definitionId },
        },
        tx,
      );

      return definition;
    });

    return { id: created.id, name: created.name };
  }

  /**
   * ذخیره پیش‌نویس.
   *
   * اگر آخرین نسخه `DRAFT` باشد، همان به‌روز می‌شود؛ وگرنه نسخه `DRAFT` تازه‌ای ساخته
   * می‌شود. پس «ذخیره» هیچ‌وقت نسخه منتشرشده را لمس نمی‌کند.
   */
  async saveDraft(definitionId: string, rawTemplate: unknown, user: AuthenticatedUser) {
    const definition = await this.prisma.reportDefinition.findUnique({
      where: { id: definitionId },
    });
    if (!definition) throw AppError.notFound('قالب گزارش یافت نشد');

    if (definition.isSystem) {
      throw AppError.conflict(
        'REPORT_TEMPLATE_SYSTEM',
        'قالب سیستمی ویرایش نمی‌شود؛ ابتدا یک کپی از آن بسازید.',
      );
    }

    const template = this.parseAndValidate(rawTemplate);

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.reportVersion.findFirst({
        where: { definitionId },
        orderBy: { versionNo: 'desc' },
      });

      const saved =
        latest?.status === 'DRAFT'
          ? await tx.reportVersion.update({
              where: { id: latest.id },
              data: {
                template: template as unknown as Prisma.InputJsonValue,
                templateSchemaVersion: template.schemaVersion,
                createdById: user.id,
              },
            })
          : await tx.reportVersion.create({
              data: {
                definitionId,
                versionNo: (latest?.versionNo ?? 0) + 1,
                status: 'DRAFT',
                templateSchemaVersion: template.schemaVersion,
                template: template as unknown as Prisma.InputJsonValue,
                createdById: user.id,
              },
            });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'REPORT_TEMPLATE_SAVE_DRAFT',
          entityType: 'reportVersion',
          entityId: saved.id,
          after: { definitionId, versionNo: saved.versionNo },
        },
        tx,
      );

      return { id: saved.id, versionNo: saved.versionNo, status: saved.status };
    });
  }

  /**
   * انتشار یک نسخه پیش‌نویس.
   *
   * پس از انتشار، نسخه **تغییرناپذیر** است و `current_version_id` قالب به آن اشاره
   * می‌کند. خروجی‌های قبلی به نسخه خودشان بسته می‌مانند (معیار پذیرش ۵ فاز ۷).
   */
  async publish(versionId: string, user: AuthenticatedUser, alsoActivate = false) {
    const version = await this.prisma.reportVersion.findUnique({
      where: { id: versionId },
      include: { definition: true },
    });
    if (!version) throw AppError.notFound('نسخه قالب یافت نشد');

    if (version.status === 'PUBLISHED') {
      throw AppError.conflict('REPORT_VERSION_PUBLISHED', 'این نسخه قبلاً منتشر شده است');
    }

    // اعتبارسنجی دوباره پیش از انتشار: Data Dictionary ممکن است از زمان ذخیره عوض شده باشد.
    this.parseAndValidate(version.template);

    const reportType = await this.prisma.reportType.findUniqueOrThrow({
      where: { id: version.definition.reportTypeId },
      select: { id: true, activeDefinitionId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.reportVersion.update({
        where: { id: versionId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });

      await tx.reportDefinition.update({
        where: { id: version.definitionId },
        data: { currentVersionId: versionId, status: 'PUBLISHED' },
      });

      /**
       * اگر این نوع گزارش هیچ قالب فعالی ندارد، همین قالب فعال می‌شود.
       *
       * جایی که انتخابی وجود ندارد، نگه داشتن «هیچ» کمکی نمی‌کند — گزارش اجرا نمی‌شد.
       * ولی اگر قالب فعالی **هست**، انتشار آن را عوض نمی‌کند: جایگزینی قالبی که امروز
       * خروجی رسمی سازمان را می‌سازد، باید یک تصمیم آگاهانه و جداگانه باشد.
       */
      /*
        انتشار، وقتی خواسته شود، همان‌جا **اعمال** هم می‌کند.

        دو مفهوم جدا بودند — «نسخه منتشر شده» و «قالب فعال است» — و کاربر
        فرقشان را نمی‌دانست: نسخه را منتشر می‌کرد، پیام موفقیت می‌گرفت، و خروجی
        همان قبلی می‌ماند. جدایی‌شان در داده لازم است (چند قالب برای یک نوع
        گزارش)؛ جدایی‌شان در **کارِ روزمره** لازم نیست.
      */
      const becameActive = reportType.activeDefinitionId === null || alsoActivate;
      if (becameActive) {
        await tx.reportType.update({
          where: { id: reportType.id },
          data: { activeDefinitionId: version.definitionId },
        });
      }

      await this.audit.record(
        {
          actorId: user.id,
          action: 'REPORT_TEMPLATE_PUBLISH',
          entityType: 'reportVersion',
          entityId: versionId,
          before: { status: 'DRAFT' },
          after: {
            status: 'PUBLISHED',
            versionNo: published.versionNo,
            definitionId: version.definitionId,
            becameActive,
          },
        },
        tx,
      );

      return {
        id: published.id,
        versionNo: published.versionNo,
        status: published.status,
        becameActive,
      };
    });
  }

  /**
   * انتخاب قالب فعال یک نوع گزارش.
   *
   * این همان نقطه‌ای است که کار طراح را **اثرگذار** می‌کند: تا وقتی قالب تازه فعال
   * نشود، اجرای گزارش با کلید نوع گزارش همان قالب قبلی را می‌دهد.
   *
   * سه شرط، همه fail-closed: قالب باید وجود داشته باشد، منتشرشده باشد، و نسخه جاری
   * داشته باشد. قالبِ بی‌نسخه را فعال کردن یعنی خراب کردن گزارش برای همه کاربران.
   */
  async activate(definitionId: string, user: AuthenticatedUser) {
    const definition = await this.prisma.reportDefinition.findUnique({
      where: { id: definitionId },
      include: { reportType: { select: { id: true, key: true, activeDefinitionId: true } } },
    });
    if (!definition) throw AppError.notFound('قالب گزارش یافت نشد');

    if (definition.status !== 'PUBLISHED' || definition.currentVersionId === null) {
      throw AppError.conflict(
        'REPORT_TEMPLATE_NOT_PUBLISHED',
        'تنها قالبی که نسخه منتشرشده دارد می‌تواند فعال شود',
      );
    }

    // اعتبارسنجی دوباره پیش از فعال‌سازی: قالبی که به مسیر حذف‌شده اشاره می‌کند نباید
    // قالب رسمی یک نوع گزارش شود.
    const current = await this.prisma.reportVersion.findUniqueOrThrow({
      where: { id: definition.currentVersionId },
      select: { template: true },
    });
    this.parseAndValidate(current.template);

    const previousId = definition.reportType.activeDefinitionId;

    await this.prisma.$transaction(async (tx) => {
      await tx.reportType.update({
        where: { id: definition.reportType.id },
        data: { activeDefinitionId: definitionId },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'REPORT_TEMPLATE_ACTIVATE',
          entityType: 'reportType',
          entityId: definition.reportType.id,
          before: { activeDefinitionId: previousId },
          after: { activeDefinitionId: definitionId, reportTypeKey: definition.reportType.key },
        },
        tx,
      );
    });

    return { definitionId, reportTypeKey: definition.reportType.key, isActive: true };
  }

  /**
   * بایگانی یک قالب.
   *
   * سه چیز بایگانی نمی‌شوند و هر سه دلیل روشنی دارند: قالب سیستمی (مرجع بازگشت)،
   * قالب فعال (خروجی رسمی سازمان از آن ساخته می‌شود) و... خب، همین دو. قالب بایگانی‌شده
   * پاک نمی‌شود، چون `report_runs` به نسخه‌هایش ارجاع دارد و تاریخچه خروجی‌ها باید
   * بماند.
   */
  async archive(definitionId: string, user: AuthenticatedUser) {
    const definition = await this.prisma.reportDefinition.findUnique({
      where: { id: definitionId },
      include: { reportType: { select: { activeDefinitionId: true } } },
    });
    if (!definition) throw AppError.notFound('قالب گزارش یافت نشد');

    if (definition.isSystem) {
      throw AppError.conflict('REPORT_TEMPLATE_SYSTEM', 'قالب سیستمی بایگانی نمی‌شود');
    }
    if (definition.reportType.activeDefinitionId === definitionId) {
      throw AppError.conflict(
        'REPORT_TEMPLATE_ACTIVE',
        'این قالب، قالب فعال نوع گزارش است؛ ابتدا قالب دیگری را فعال کنید.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reportDefinition.update({
        where: { id: definitionId },
        data: { status: 'ARCHIVED' },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'REPORT_TEMPLATE_ARCHIVE',
          entityType: 'reportDefinition',
          entityId: definitionId,
          before: { status: definition.status },
          after: { status: 'ARCHIVED' },
        },
        tx,
      );
    });

    return { id: definitionId, status: 'ARCHIVED' as const };
  }

  /** تغییر نام قالب. قالب سیستمی نام ثابت دارد تا مرجع بازگشت گم نشود. */
  async rename(definitionId: string, name: string, user: AuthenticatedUser) {
    const definition = await this.prisma.reportDefinition.findUnique({
      where: { id: definitionId },
    });
    if (!definition) throw AppError.notFound('قالب گزارش یافت نشد');

    if (definition.isSystem) {
      throw AppError.conflict(
        'REPORT_TEMPLATE_SYSTEM',
        'نام قالب سیستمی تغییر نمی‌کند؛ ابتدا یک کپی از آن بسازید.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reportDefinition.update({ where: { id: definitionId }, data: { name } });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'REPORT_TEMPLATE_RENAME',
          entityType: 'reportDefinition',
          entityId: definitionId,
          before: { name: definition.name },
          after: { name },
        },
        tx,
      );
    });

    return { id: definitionId, name };
  }

  /**
   * اعتبارسنجی بدون ذخیره — برای نمایش خطا در طراح، همان لحظه.
   *
   * همان بررسی‌هایی که `saveDraft` انجام می‌دهد، ولی بدون نوشتن؛ پس طراح می‌تواند
   * پیش از ذخیره بگوید «این ستون به مسیر غیرمجاز اشاره می‌کند».
   */
  check(rawTemplate: unknown): { ok: true } {
    this.parseAndValidate(rawTemplate);
    return { ok: true };
  }

  private parseAndValidate(rawTemplate: unknown): TemplateV1 {
    const parsed = templateV1Schema.safeParse(rawTemplate);
    if (!parsed.success) {
      throw AppError.validation(
        'ساختار قالب معتبر نیست',
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    const problems = validateTemplate(parsed.data, {
      allowedValuePaths: allowedValuePaths(),
      collections: collectionFields(),
    });

    if (problems.length > 0) {
      throw AppError.validation('قالب به داده یا ساختار نامعتبر اشاره می‌کند', [...problems]);
    }

    return parsed.data;
  }
}
