import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
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
import {
  listQuerySchema,
  paginationArgs,
  toPageResult,
} from '../../common/query/list-query';

const emptyToNull = (value: string | undefined): string | null =>
  value === undefined || value.trim() === '' ? null : value.trim();

const buyerSchema = z.object({
  personType: z.enum(['NATURAL', 'LEGAL']),
  name: z.string().trim().min(1, 'نام یا عنوان الزامی است').max(300),
  economicCode: z.string().trim().max(30).optional().transform(emptyToNull),
  registrationNumber: z.string().trim().max(30).optional().transform(emptyToNull),
  nationalId: z.string().trim().max(20).optional().transform(emptyToNull),
  addressLine: z.string().trim().max(2000).optional().transform(emptyToNull),
  postalCode: z.string().trim().max(10).optional().transform(emptyToNull),
  phone: z.string().trim().max(30).optional().transform(emptyToNull),
  fax: z.string().trim().max(30).optional().transform(emptyToNull),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isDefault: z.boolean().default(false),
});

/** شکل پاسخ: شمارش اسناد به‌صورت یک عدد ساده، نه شیء `_count` پریزما. */
interface BuyerRow {
  documentCount: number;
}

/**
 * مجموعه‌های خریدار (§۸.۳).
 *
 * در هر سند یک مجموعه انتخاب می‌شود و اطلاعاتش در لحظه ایجاد سند snapshot می‌گردد،
 * پس ویرایش بعدی این رکوردها اسناد گذشته را تغییر نمی‌دهد.
 */
@ApiTags('base-data')
@Controller('buyers')
export class BuyersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('buyer:read')
  @Get()
  @ApiOperation({ summary: 'فهرست مجموعه‌های خریدار' })
  async list(@Query(new ZodBody(listQuerySchema)) query: ReturnType<typeof listQuerySchema.parse>) {
    const where = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.buyerEntity.findMany({
        where,
        // پیش‌فرض همیشه اول فهرست — همان چیزی که کاربر در فرم سند هم اول می‌بیند.
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { documents: true } } },
        ...paginationArgs(query),
      }),
      this.prisma.buyerEntity.count({ where }),
    ]);

    return toPageResult(items.map((item) => this.withCount(item)), total, query);
  }

  @RequirePermission('buyer:read')
  @Get(':id')
  async get(@Param('id') id: string) {
    const buyer = await this.prisma.buyerEntity.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!buyer) throw AppError.notFound('مجموعه خریدار یافت نشد');
    return this.withCount(buyer);
  }

  @RequirePermission('buyer:write')
  @Post()
  async create(
    @Body(new ZodBody(buyerSchema)) body: z.infer<typeof buyerSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      if (body.isDefault) await this.clearDefault(tx, null);
      return tx.buyerEntity.create({ data: body });
    });

    await this.audit.record({
      actorId: user.id,
      action: 'BUYER_CREATE',
      entityType: 'buyerEntity',
      entityId: created.id,
      after: created,
    });

    return { ...created, documentCount: 0 };
  }

  @RequirePermission('buyer:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(buyerSchema.partial())) body: Partial<z.infer<typeof buyerSchema>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.prisma.buyerEntity.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('مجموعه خریدار یافت نشد');

    /*
     * یک مجموعه غیرفعال نمی‌تواند پیش‌فرض بماند.
     *
     * وگرنه فرم ایجاد سند مقداری را از پیش انتخاب می‌کند که در فهرست گزینه‌هایش
     * (فقط فعال‌ها) نیست — و کاربر دکمه ثبت را می‌زند و خطای نامفهوم می‌گیرد.
     */
    const willBeActive = body.isActive ?? before.isActive;
    const wantsDefault = (body.isDefault ?? before.isDefault) && willBeActive;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (wantsDefault) await this.clearDefault(tx, id);
      return tx.buyerEntity.update({
        where: { id },
        data: { ...body, isDefault: wantsDefault },
        include: { _count: { select: { documents: true } } },
      });
    });

    await this.audit.record({
      actorId: user.id,
      action: 'BUYER_UPDATE',
      entityType: 'buyerEntity',
      entityId: id,
      before,
      after: updated,
    });

    return this.withCount(updated);
  }

  /**
   * حذف یک مجموعه خریدار.
   *
   * فقط وقتی ممکن است که **هیچ سندی** به آن وصل نباشد. سندهای گذشته داده خریدار را
   * به‌صورت snapshot دارند، ولی ستون `buyer_entity_id` هم نگه داشته می‌شود تا بشود
   * «همه اسناد این مجموعه» را پرسید؛ حذف رکورد، آن ارتباط را پاک می‌کند.
   *
   * راه درستِ «از کار انداختن» یک مجموعه، غیرفعال کردن آن است نه حذف.
   */
  @RequirePermission('buyer:write')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const buyer = await this.prisma.buyerEntity.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });
    if (!buyer) throw AppError.notFound('مجموعه خریدار یافت نشد');

    if (buyer._count.documents > 0) {
      throw AppError.conflict(
        'BUYER_IN_USE',
        'این مجموعه در اسناد ثبت‌شده به کار رفته است و حذف نمی‌شود؛ آن را غیرفعال کنید.',
      );
    }

    await this.prisma.buyerEntity.delete({ where: { id } });

    await this.audit.record({
      actorId: user.id,
      action: 'BUYER_DELETE',
      entityType: 'buyerEntity',
      entityId: id,
      before: buyer,
    });
  }

  /** برداشتن علامت پیش‌فرض از بقیه — پیش از نشاندن آن روی یک ردیف تازه. */
  private async clearDefault(
    tx: Prisma.TransactionClient,
    keepId: string | null,
  ): Promise<void> {
    await tx.buyerEntity.updateMany({
      where: { isDefault: true, ...(keepId === null ? {} : { id: { not: keepId } }) },
      data: { isDefault: false },
    });
  }

  private withCount<T extends { _count: { documents: number } }>(
    row: T,
  ): Omit<T, '_count'> & BuyerRow {
    const { _count, ...rest } = row;
    return { ...rest, documentCount: _count.documents };
  }
}
