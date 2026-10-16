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
import { PlateError, normalizePlate } from '@dm/shared';
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
 * خودروها — اطلاعات پایه فاکتور سوخت.
 *
 * فرم سوخت ابتدا **نوع خودرو** را جست‌وجو می‌کند و سپس پلاک‌های همان نوع را نشان
 * می‌دهد؛ پس فیلتر بر اساس `vehicleTypeId` یک نیاز واقعی فرم است، نه تزئینی.
 *
 * یکتایی روی صورت نرمال‌شده پلاک است (`plate_normalized`)، نه متن واردشده.
 */

const vehicleInputSchema = z.object({
  vehicleTypeId: z.string().uuid('نوع خودرو را انتخاب کنید'),
  plateNumber: z.string().trim().min(1, 'پلاک الزامی است').max(50),
  isActive: z.boolean().default(true),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : null)),
});

const filterSchema = listQuerySchema.extend({
  vehicleTypeId: z.string().uuid().optional(),
});

const SORTABLE = ['plateNumber', 'createdAt', 'updatedAt'] as const;

@ApiTags('base-data')
@Controller('base-data/vehicles')
export class VehiclesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('base_data:read')
  @Get()
  @ApiOperation({ summary: 'فهرست خودروها، قابل فیلتر بر اساس نوع خودرو' })
  async list(
    @Query(new ZodBody(filterSchema)) query: z.infer<typeof filterSchema>,
  ): Promise<PageResult<unknown>> {
    const where: Record<string, unknown> = {};
    if (query.vehicleTypeId) where['vehicleTypeId'] = query.vehicleTypeId;
    if (query.isActive !== undefined) where['isActive'] = query.isActive;
    if (query.search) {
      // جست‌وجو روی **هر دو** صورت: کاربر ممکن است با فاصله یا با ارقام فارسی بنویسد.
      const normalized = safeNormalize(query.search);
      where['OR'] = [
        { plateNumber: { contains: query.search } },
        ...(normalized ? [{ plateNormalized: { contains: normalized } }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: orderByArg(query, SORTABLE, [{ plateNumber: 'asc' }]),
        ...paginationArgs(query),
        include: { vehicleType: { select: { id: true, title: true, isActive: true } } },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  @RequirePermission('base_data:write')
  @Post()
  async create(
    @Body(new ZodBody(vehicleInputSchema)) body: z.infer<typeof vehicleInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.assertVehicleType(body.vehicleTypeId);

    const created = await this.run(() =>
      this.prisma.vehicle.create({
        data: { ...body, plateNormalized: this.normalize(body.plateNumber) },
        include: { vehicleType: { select: { id: true, title: true } } },
      }),
    );

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_CREATE',
      entityType: 'vehicle',
      entityId: created.id,
      after: created,
    });

    return created;
  }

  @RequirePermission('base_data:write')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodBody(vehicleInputSchema.partial()))
    body: Partial<z.infer<typeof vehicleInputSchema>>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('خودرو یافت نشد');
    if (body.vehicleTypeId) await this.assertVehicleType(body.vehicleTypeId);

    const updated = await this.run(() =>
      this.prisma.vehicle.update({
        where: { id },
        data: {
          ...body,
          // صورت نرمال همیشه با متن نمایشی هم‌گام می‌ماند.
          ...(body.plateNumber ? { plateNormalized: this.normalize(body.plateNumber) } : {}),
        },
        include: { vehicleType: { select: { id: true, title: true } } },
      }),
    );

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_UPDATE',
      entityType: 'vehicle',
      entityId: id,
      before,
      after: updated,
    });

    return updated;
  }

  @RequirePermission('base_data:write')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const before = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('خودرو یافت نشد');

    const usage = await this.prisma.invoiceFuelDetail.count({ where: { vehicleId: id } });
    if (usage > 0) {
      throw AppError.conflict(
        'BASE_DATA_IN_USE',
        `این خودرو در ${usage} فاکتور سوخت استفاده شده است و حذف نمی‌شود. برای کنار گذاشتن آن، غیرفعالش کنید.`,
      );
    }

    await this.prisma.vehicle.delete({ where: { id } });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_DELETE',
      entityType: 'vehicle',
      entityId: id,
      before,
    });
  }

  private normalize(plate: string): string {
    try {
      return normalizePlate(plate);
    } catch (error) {
      if (error instanceof PlateError) {
        throw AppError.validation(error.message, [{ path: 'plateNumber', message: error.message }]);
      }
      throw error;
    }
  }

  private async assertVehicleType(vehicleTypeId: string): Promise<void> {
    const type = await this.prisma.vehicleType.findUnique({ where: { id: vehicleTypeId } });
    if (!type || !type.isActive) {
      throw AppError.validation('نوع خودرو انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'vehicleTypeId', message: 'نوع خودرو معتبر نیست' },
      ]);
    }
  }

  /** قید یکتایی پلاک مرجع است؛ این فقط خطای خام را قابل فهم می‌کند. */
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict(
          'VEHICLE_PLATE_DUPLICATE',
          'خودرویی با همین پلاک از قبل ثبت شده است',
        );
      }
      throw error;
    }
  }
}

function safeNormalize(value: string): string | null {
  try {
    return normalizePlate(value);
  } catch {
    // جست‌وجوی ناقص («۱۲ب») هنوز رقم دارد، ولی ورودی بی‌رقم نباید جست‌وجو را بشکند.
    return null;
  }
}
