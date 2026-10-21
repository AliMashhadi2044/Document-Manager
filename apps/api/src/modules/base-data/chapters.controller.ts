import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
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
          include: { invoiceType: { include: { defaultPaymentMethod: true } } },
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
