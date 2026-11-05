import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

const chapterInputSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(1, 'عنوان فصل الزامی است').max(200),
  code: z.string().trim().max(50).optional().transform((v) => (v ? v : null)),
  description: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

/** فهرست مجاز؛ خالی یعنی «محدودیتی نیست». */
const allowedMethodsSchema = z.object({
  paymentMethodIds: z.array(z.string().uuid()).max(50),
  /**
   * روش پیش‌فرض همین نوع فاکتور — `null` یعنی پیش‌فرضی نیست.
   *
   * در همین بدنه می‌آید و نه در مسیری جدا: پیش‌فرض باید میان مجازها باشد و دو
   * درخواست جدا یعنی لحظه‌ای که پیش‌فرض از فهرست افتاده و جایگزینش نیامده.
   */
  defaultPaymentMethodId: z.string().uuid().nullable().optional(),
});

const linkInputSchema = z.object({
  invoiceTypeId: z.string().uuid(),
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

/**
 * فصل‌های بودجه و اتصال پویای آن‌ها به انواع فاکتور.
 *
 * این اتصال همان چیزی است که تعیین می‌کند با انتخاب یک فصل، کدام فرم فاکتور باز شود —
 * و عمداً **داده** است نه شرط در کد (docs/05-invoice-types.md §۴).
 */
@ApiTags('base-data')
@Controller('base-data/chapters')
export class ChaptersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('base_data:read')
  @Get('categories')
  @ApiOperation({ summary: 'گروه‌های بودجه (جاری و عمرانی) با فصل‌هایشان' })
  async categories() {
    const categories = await this.prisma.budgetCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        chapters: {
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          include: {
            invoiceTypes: { include: { invoiceType: true }, orderBy: { sortOrder: 'asc' } },
            // شمارش فاکتورها: رابط باید پیش از نشان دادن دکمه حذف، بداند کدام فصل در
            // داده واقعی به کار رفته است — وگرنه کاربر دکمه‌ای را می‌زند که همیشه خطا می‌دهد.
            _count: { select: { invoices: true } },
          },
        },
      },
    });

    return categories.map((category) => ({
      ...category,
      chapters: category.chapters.map(({ _count, ...chapter }) => ({
        ...chapter,
        invoiceCount: _count.invoices,
      })),
    }));
  }

  /**
   * انواع فاکتور مجاز یک فصل.
   *
   * UI با این پاسخ تصمیم می‌گیرد: صفر ⇒ خطای پیکربندی، یک ⇒ انتخاب خودکار،
   * چند ⇒ کاربر انتخاب می‌کند (§۱۰ پرامپت).
   */
  @RequirePermission('base_data:read')
  @Get(':id/invoice-types')
  @ApiOperation({ summary: 'انواع فاکتور مجاز برای یک فصل' })
  async invoiceTypes(@Param('id') chapterId: string) {
    const chapter = await this.prisma.budgetChapter.findUnique({
      where: { id: chapterId },
      include: {
        invoiceTypes: {
          where: { invoiceType: { isActive: true } },
          include: {
            invoiceType: {
              include: {
                defaultPaymentMethod: true,
                // فهرست مجاز در همین رفت‌وبرگشت می‌آید؛ یک درخواست دیگر برای فرم
                // فاکتور یعنی یک حالت میانی که در آن همهٔ روش‌ها دیده می‌شوند.
                paymentMethods: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
        },
      },
    });

    if (!chapter) throw AppError.notFound('فصل یافت نشد');

    return {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      options: chapter.invoiceTypes.map((link) => ({
        invoiceTypeId: link.invoiceType.id,
        key: link.invoiceType.key,
        kind: link.invoiceType.kind,
        titleFa: link.invoiceType.titleFa,
        isDefault: link.isDefault,
        defaultPaymentMethod: link.invoiceType.defaultPaymentMethod
          ? {
              id: link.invoiceType.defaultPaymentMethod.id,
              kind: link.invoiceType.defaultPaymentMethod.kind,
              titleFa: link.invoiceType.defaultPaymentMethod.titleFa,
            }
          : null,
        /*
          فهرست روش‌های پرداخت مجاز.

          `null` یعنی «محدودیتی تعریف نشده، همهٔ روش‌های فعال مجازند» — که با فهرست
          خالی یکی نیست. اگر هر دو را خالی می‌فرستادیم، فرم نمی‌توانست بین «محدود
          نشده» و «هیچ روشی مجاز نیست» فرق بگذارد.
        */
        allowedPaymentMethodIds:
          link.invoiceType.paymentMethods.length === 0
            ? null
            : link.invoiceType.paymentMethods.map((row) => row.paymentMethodId),
      })),
    };
  }

  /** همه انواع فاکتور فعال — برای فهرست انتخاب در صفحه اتصال. */
  @RequirePermission('base_data:read')
  @Get('invoice-types')
  @ApiOperation({ summary: 'انواع فاکتور قابل اتصال به فصل' })
  async allInvoiceTypes() {
    return this.prisma.invoiceType.findMany({
      where: { isActive: true },
      orderBy: { titleFa: 'asc' },
      select: { id: true, key: true, kind: true, titleFa: true },
    });
  }

  /**
   * روش‌های پرداخت یک نوع فاکتور: فهرست کامل، با علامتِ مجاز بودن.
   *
   * پاسخ همهٔ روش‌های فعال را می‌دهد و نه فقط مجازها، چون صفحهٔ مدیریت باید
   * تیک‌نخورده‌ها را هم نشان بدهد.
   */
  @RequirePermission('base_data:read')
  @Get('invoice-types/:invoiceTypeId/payment-methods')
  @ApiOperation({ summary: 'روش‌های پرداخت مجاز یک نوع فاکتور' })
  async paymentMethods(@Param('invoiceTypeId') invoiceTypeId: string) {
    const invoiceType = await this.prisma.invoiceType.findUnique({
      where: { id: invoiceTypeId },
      include: { paymentMethods: true },
    });
    if (!invoiceType) throw AppError.notFound('نوع فاکتور یافت نشد');

    const methods = await this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, key: true, kind: true, titleFa: true },
    });

    const allowed = new Set(invoiceType.paymentMethods.map((row) => row.paymentMethodId));

    return {
      invoiceTypeId: invoiceType.id,
      titleFa: invoiceType.titleFa,
      defaultPaymentMethodId: invoiceType.defaultPaymentMethodId,
      /** هیچ محدودیتی تعریف نشده: همهٔ روش‌های فعال مجازند. */
      unrestricted: allowed.size === 0,
      methods: methods.map((method) => ({ ...method, allowed: allowed.size === 0 || allowed.has(method.id) })),
    };
  }

  /**
   * جایگزینی کامل فهرست مجاز.
   *
   * چرا PUT و جایگزینی کامل و نه افزودن/حذف تک‌تک: کاربر در یک گفت‌وگو چند تیک را
   * با هم عوض می‌کند و ارسال تک‌تک، حالت‌های میانی می‌ساخت — مثلاً لحظه‌ای که روش
   * پیش‌فرض از فهرست افتاده ولی جایگزینش هنوز نیامده.
   *
   * فهرست خالی یعنی «محدودیت را بردار»، نه «هیچ روشی مجاز نیست»؛ اگر دومی را
   * می‌خواستیم، ثبت فاکتور آن نوع برای همیشه غیرممکن می‌شد.
   */
  @RequirePermission('base_data:write')
  @Put('invoice-types/:invoiceTypeId/payment-methods')
  @ApiOperation({ summary: 'تعیین روش‌های پرداخت مجاز یک نوع فاکتور' })
  async setPaymentMethods(
    @Param('invoiceTypeId') invoiceTypeId: string,
    @Body(new ZodBody(allowedMethodsSchema)) body: z.infer<typeof allowedMethodsSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const invoiceType = await this.prisma.invoiceType.findUnique({
      where: { id: invoiceTypeId },
      include: { paymentMethods: true },
    });
    if (!invoiceType) throw AppError.notFound('نوع فاکتور یافت نشد');

    const ids = [...new Set(body.paymentMethodIds)];

    /*
      پیش‌فرضِ تازه، یا همان قبلی اگر بدنه چیزی نگفته باشد.

      `undefined` و `null` اینجا دو چیزند: اولی یعنی «دست نزن» و دومی یعنی
      «پیش‌فرض را بردار».
    */
    const nextDefault =
      body.defaultPaymentMethodId === undefined
        ? invoiceType.defaultPaymentMethodId
        : body.defaultPaymentMethodId;

    if (nextDefault !== null) {
      const exists = await this.prisma.paymentMethod.count({
        where: { id: nextDefault, isActive: true },
      });
      if (exists === 0) {
        throw AppError.validation('روش پرداخت پیش‌فرض یافت نشد یا غیرفعال است');
      }
    }

    if (ids.length > 0) {
      const found = await this.prisma.paymentMethod.count({
        where: { id: { in: ids }, isActive: true },
      });
      if (found !== ids.length) {
        throw AppError.validation('یکی از روش‌های پرداخت یافت نشد یا غیرفعال است');
      }

      /*
        روش پیش‌فرضِ همین نوع فاکتور باید در فهرست بماند.

        وگرنه فرم فاکتور روشی را از پیش انتخاب می‌کرد که در فهرست گزینه‌هایش نیست —
        همان دسته باگی که یک‌بار با «روش پیش‌فرض نوع قبلی» دیده شد.
      */
      if (nextDefault !== null && !ids.includes(nextDefault)) {
        throw AppError.conflict(
          'DEFAULT_METHOD_NOT_ALLOWED',
          'روش پیش‌فرض این نوع فاکتور باید در فهرست مجاز بماند',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (nextDefault !== invoiceType.defaultPaymentMethodId) {
        await tx.invoiceType.update({
          where: { id: invoiceTypeId },
          data: { defaultPaymentMethodId: nextDefault },
        });
      }

      await tx.invoiceTypePaymentMethod.deleteMany({ where: { invoiceTypeId } });
      if (ids.length > 0) {
        await tx.invoiceTypePaymentMethod.createMany({
          data: ids.map((paymentMethodId, index) => ({
            invoiceTypeId,
            paymentMethodId,
            sortOrder: index,
          })),
        });
      }
    });

    await this.audit.record({
      actorId: user.id,
      action: 'INVOICE_TYPE_PAYMENT_METHODS_SET',
      entityType: 'invoiceType',
      entityId: invoiceTypeId,
      before: {
        paymentMethodIds: invoiceType.paymentMethods.map((row) => row.paymentMethodId),
        defaultPaymentMethodId: invoiceType.defaultPaymentMethodId,
      },
      after: { paymentMethodIds: ids, defaultPaymentMethodId: nextDefault },
    });

    return this.paymentMethods(invoiceTypeId);
  }

  @RequirePermission('base_data:write')
  @Post()
  async create(
    @Body(new ZodBody(chapterInputSchema)) body: z.infer<typeof chapterInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const created = await this.prisma.budgetChapter.create({ data: body });
    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_CREATE',
      entityType: 'budgetChapter',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @RequirePermission('base_data:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(chapterInputSchema.partial())) body: Partial<z.infer<typeof chapterInputSchema>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.prisma.budgetChapter.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('فصل یافت نشد');

    const updated = await this.prisma.budgetChapter.update({ where: { id }, data: body });
    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_UPDATE',
      entityType: 'budgetChapter',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }

  /**
   * حذف یک فصل.
   *
   * فقط وقتی ممکن است که هیچ فاکتوری به آن ارجاع ندهد. فاکتورهای گذشته عنوان فصل
   * را snapshot دارند، ولی `chapter_id` هم نگه داشته می‌شود؛ حذف رکورد، آن ارتباط را
   * می‌شکند. راه درستِ «کم کردن» یک فصلِ به‌کاررفته، غیرفعال کردن آن است.
   */
  @RequirePermission('base_data:write')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const chapter = await this.prisma.budgetChapter.findUnique({
      where: { id },
      include: { _count: { select: { invoices: true } } },
    });
    if (!chapter) throw AppError.notFound('فصل یافت نشد');

    if (chapter._count.invoices > 0) {
      throw AppError.conflict(
        'CHAPTER_IN_USE',
        'این فصل در فاکتورهای ثبت‌شده به کار رفته است و حذف نمی‌شود؛ آن را غیرفعال کنید.',
      );
    }

    // اتصال‌های نوع فاکتور فقط پیکربندی‌اند و همراه فصل می‌روند.
    await this.prisma.$transaction(async (tx) => {
      await tx.chapterInvoiceType.deleteMany({ where: { chapterId: id } });
      await tx.budgetChapter.delete({ where: { id } });
    });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_DELETE',
      entityType: 'budgetChapter',
      entityId: id,
      before: chapter,
    });
  }

  @RequirePermission('base_data:write')
  @Post(':id/invoice-types')
  @ApiOperation({ summary: 'اتصال یک نوع فاکتور به فصل' })
  async link(
    @Param('id') chapterId: string,
    @Body(new ZodBody(linkInputSchema)) body: z.infer<typeof linkInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const chapter = await this.prisma.budgetChapter.findUnique({ where: { id: chapterId } });
    if (!chapter) throw AppError.notFound('فصل یافت نشد');

    const created = await this.prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        // ایندکس جزئی هم همین را تضمین می‌کند؛ این کار برای جابه‌جایی نرم پیش‌فرض است.
        await tx.chapterInvoiceType.updateMany({
          where: { chapterId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.chapterInvoiceType.create({
        data: { chapterId, ...body },
        include: { invoiceType: true },
      });
    });

    await this.audit.record({
      actorId: user.id,
      action: 'CHAPTER_INVOICE_TYPE_LINK',
      entityType: 'chapterInvoiceType',
      entityId: chapterId,
      after: { chapterId, invoiceTypeId: body.invoiceTypeId, isDefault: body.isDefault },
    });

    return created;
  }

  /**
   * حذف اتصال.
   *
   * این کار فاکتورهای ثبت‌شده را خراب نمی‌کند: فاکتور `invoiceTypeId`، `chapterId` و
   * `invoiceKind` را مستقل نگه می‌دارد و عنوان فصل را snapshot کرده است. اتصال فقط بر
   * **ایجاد فاکتور جدید** اثر دارد.
   */
  @RequirePermission('base_data:write')
  @Delete(':id/invoice-types/:invoiceTypeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(
    @Param('id') chapterId: string,
    @Param('invoiceTypeId') invoiceTypeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const existing = await this.prisma.chapterInvoiceType.findUnique({
      where: { chapterId_invoiceTypeId: { chapterId, invoiceTypeId } },
    });
    if (!existing) throw AppError.notFound('این اتصال وجود ندارد');

    await this.prisma.chapterInvoiceType.delete({
      where: { chapterId_invoiceTypeId: { chapterId, invoiceTypeId } },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'CHAPTER_INVOICE_TYPE_UNLINK',
      entityType: 'chapterInvoiceType',
      entityId: chapterId,
      before: existing,
    });
  }
}
