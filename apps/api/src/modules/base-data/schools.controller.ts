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
  orderByArg,
  paginationArgs,
  toPageResult,
  type PageResult,
} from '../../common/query/list-query';

/**
 * مدارس — اطلاعات پایه فاکتور انشعابات.
 *
 * مدرسه برعکس فهرست‌های ساده یک **والد** دارد (ناحیه)، و همین والد است که در فرم
 * انشعابات به‌صورت خودکار پر می‌شود. پس فهرست همیشه ناحیه را هم برمی‌گرداند و
 * کلاینت لازم نیست ناحیه را جداگانه بپرسد یا حدس بزند.
 */

const schoolInputSchema = z.object({
  districtId: z.string().uuid('ناحیه را انتخاب کنید'),
  title: z.string().trim().min(1, 'نام مدرسه الزامی است').max(200),
  code: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => (value ? value : null)),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

const filterSchema = listQuerySchema.extend({
  districtId: z.string().uuid().optional(),
});

const SORTABLE = ['title', 'sortOrder', 'createdAt', 'updatedAt'] as const;

@ApiTags('base-data')
@Controller('base-data/schools')
export class SchoolsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('base_data:read')
  @Get()
  @ApiOperation({ summary: 'فهرست مدارس با ناحیه، قابل فیلتر بر اساس ناحیه' })
  async list(
    @Query(new ZodBody(filterSchema)) query: z.infer<typeof filterSchema>,
  ): Promise<PageResult<unknown>> {
    const where: Record<string, unknown> = {};
    if (query.districtId) where['districtId'] = query.districtId;
    if (query.isActive !== undefined) where['isActive'] = query.isActive;
    if (query.search) {
      where['OR'] = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        orderBy: orderByArg(query, SORTABLE, [{ sortOrder: 'asc' }, { title: 'asc' }]),
        ...paginationArgs(query),
        include: { district: { select: { id: true, title: true, isActive: true } } },
      }),
      this.prisma.school.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  @RequirePermission('base_data:write')
  @Post()
  async create(
    @Body(new ZodBody(schoolInputSchema)) body: z.infer<typeof schoolInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertDistrict(body.districtId);

    const created = await this.prisma.school.create({
      data: body,
      include: { district: { select: { id: true, title: true } } },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_CREATE',
      entityType: 'school',
      entityId: created.id,
      after: created,
    });

    return created;
  }

  @RequirePermission('base_data:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(schoolInputSchema.partial())) body: Partial<z.infer<typeof schoolInputSchema>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.prisma.school.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('مدرسه یافت نشد');
    if (body.districtId) await this.assertDistrict(body.districtId);

    const updated = await this.prisma.school.update({
      where: { id },
      data: body,
      include: { district: { select: { id: true, title: true } } },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_UPDATE',
      entityType: 'school',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  /** حذف فقط وقتی در هیچ فاکتوری استفاده نشده باشد (§۸.۱۰). */
  @RequirePermission('base_data:write')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const before = await this.prisma.school.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('مدرسه یافت نشد');

    const usage = await this.prisma.invoiceUtilityDetail.count({ where: { schoolId: id } });
    if (usage > 0) {
      throw AppError.conflict(
        'BASE_DATA_IN_USE',
        `این مدرسه در ${usage} فاکتور انشعابات استفاده شده است و حذف نمی‌شود. برای کنار گذاشتن آن، غیرفعالش کنید.`,
      );
    }

    await this.prisma.school.delete({ where: { id } });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_DELETE',
      entityType: 'school',
      entityId: id,
      before,
    });
  }

  private async assertDistrict(districtId: string): Promise<void> {
    const district = await this.prisma.district.findUnique({ where: { id: districtId } });
    if (!district || !district.isActive) {
      throw AppError.validation('ناحیه انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'districtId', message: 'ناحیه معتبر نیست' },
      ]);
    }
  }
}
