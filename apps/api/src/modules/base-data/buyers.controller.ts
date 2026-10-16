import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
});

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
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        ...paginationArgs(query),
      }),
      this.prisma.buyerEntity.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  @RequirePermission('buyer:read')
  @Get(':id')
  async get(@Param('id') id: string) {
    const buyer = await this.prisma.buyerEntity.findUnique({ where: { id } });
    if (!buyer) throw AppError.notFound('مجموعه خریدار یافت نشد');
    return buyer;
  }

  @RequirePermission('buyer:write')
  @Post()
  async create(
    @Body(new ZodBody(buyerSchema)) body: z.infer<typeof buyerSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const created = await this.prisma.buyerEntity.create({ data: body });

    await this.audit.record({
      actorId: user.id,
      action: 'BUYER_CREATE',
      entityType: 'buyerEntity',
      entityId: created.id,
      after: created,
    });

    return created;
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

    const updated = await this.prisma.buyerEntity.update({ where: { id }, data: body });

    await this.audit.record({
      actorId: user.id,
      action: 'BUYER_UPDATE',
      entityType: 'buyerEntity',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }
}
