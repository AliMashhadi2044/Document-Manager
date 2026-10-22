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
import { SIGNATORY_ROLE_KEYS } from '@dm/shared';
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
 * امضاکنندگان — نام و سمتی که پای خروجی‌ها می‌نشیند.
 *
 * قالب گزارش فقط **نقش** را نگه می‌دارد (`roleKey`)؛ نام و سمت در لحظهٔ تولید خروجی
 * از همین جدول خوانده می‌شوند. پس عوض شدن مسئول کارپردازی یک اصلاح در همین صفحه
 * است، نه بازطراحی قالب‌ها — و خروجی‌های قبلی هم دست‌نخورده می‌مانند، چون آن‌ها
 * نسخهٔ snapshot‌شدهٔ خودشان را دارند.
 *
 * چند نفر می‌توانند یک نقش داشته باشند (تغییر مسئول، جانشین)؛ بلوک امضا **اولین
 * فعالِ** آن نقش را می‌گیرد، و ترتیب با `sortOrder` دست کاربر است.
 */

const signatoryInputSchema = z.object({
  fullName: z.string().trim().min(1, 'نام و نام خانوادگی الزامی است').max(200),
  positionTitle: z.string().trim().min(1, 'سمت الزامی است').max(200),
  roleKey: z.enum(SIGNATORY_ROLE_KEYS, {
    errorMap: () => ({ message: 'نقش انتخاب‌شده معتبر نیست' }),
  }),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

const SORTABLE = ['fullName', 'sortOrder', 'createdAt', 'updatedAt'] as const;

@ApiTags('base-data')
@Controller('base-data/signatories')
export class SignatoriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('base_data:read')
  @Get()
  @ApiOperation({ summary: 'فهرست امضاکنندگان' })
  async list(
    @Query(new ZodBody(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<PageResult<unknown>> {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where['isActive'] = query.isActive;
    if (query.search) {
      where['OR'] = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { positionTitle: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.signatory.findMany({
        where,
        orderBy: orderByArg(query, SORTABLE, [{ sortOrder: 'asc' }, { fullName: 'asc' }]),
        ...paginationArgs(query),
      }),
      this.prisma.signatory.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  @RequirePermission('base_data:write')
  @Post()
  async create(
    @Body(new ZodBody(signatoryInputSchema)) body: z.infer<typeof signatoryInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const created = await this.prisma.signatory.create({ data: body });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_CREATE',
      entityType: 'signatory',
      entityId: created.id,
      after: created,
    });

    return created;
  }

  @RequirePermission('base_data:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(signatoryInputSchema.partial()))
    body: Partial<z.infer<typeof signatoryInputSchema>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.prisma.signatory.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('امضاکننده یافت نشد');

    const updated = await this.prisma.signatory.update({ where: { id }, data: body });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_UPDATE',
      entityType: 'signatory',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  /**
   * حذف، برخلاف بقیهٔ اطلاعات پایه، هیچ ارجاع تاریخی را نمی‌شکند: خروجی‌ها نام را
   * snapshot کرده‌اند. ولی اگر آخرین امضاکنندهٔ یک نقشِ در حال استفاده برود، بلوک
   * امضای آن نقش خالی می‌شود — پس همان‌جا جلویش گرفته می‌شود.
   */
  @RequirePermission('base_data:write')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const before = await this.prisma.signatory.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('امضاکننده یافت نشد');

    const siblings = await this.prisma.signatory.count({
      where: { roleKey: before.roleKey, isActive: true, id: { not: id } },
    });
    if (before.isActive && siblings === 0) {
      throw AppError.conflict(
        'LAST_SIGNATORY_OF_ROLE',
        'این تنها امضاکنندهٔ فعال این نقش است؛ با حذفش بلوک امضای این نقش در خروجی‌ها خالی می‌ماند. ابتدا جایگزینش را ثبت کنید.',
      );
    }

    await this.prisma.signatory.delete({ where: { id } });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_DELETE',
      entityType: 'signatory',
      entityId: id,
      before,
    });
  }
}
