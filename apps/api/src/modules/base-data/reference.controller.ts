import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * داده‌های مرجع که فرم‌ها برای پر کردن فهرست‌هایشان لازم دارند.
 *
 * یک درخواست به‌جای چند درخواست جدا، چون این داده‌ها کم‌حجم و کم‌تغییرند و کلاینت
 * می‌تواند مدت معقولی کششان کند (الزام بهینگی).
 */
@ApiTags('base-data')
@Controller('base-data')
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('base_data:read')
  @Get('bootstrap')
  @ApiOperation({ summary: 'داده‌های مرجع لازم برای فرم‌ها در یک درخواست' })
  async bootstrap() {
    const [
      organization,
      paymentMethods,
      invoiceTypes,
      fiscalYears,
      utilityTypes,
      fuelTypes,
      stadRequestTypes,
      measurementUnits,
    ] = await Promise.all([
      this.prisma.organizationSettings.findUnique({ where: { id: 1 } }),
      this.prisma.paymentMethod.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.invoiceType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.fiscalYear.findMany({ orderBy: { year: 'desc' } }),
      this.prisma.utilityType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.fuelType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.stadRequestType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.measurementUnit.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return {
      organization,
      paymentMethods,
      invoiceTypes,
      // سال بسته برای سند جدید قابل انتخاب نیست، ولی در فهرست می‌آید تا فیلترها کار کنند.
      fiscalYears,
      utilityTypes,
      fuelTypes,
      stadRequestTypes,
      measurementUnits,
    };
  }

  @RequirePermission('base_data:read')
  @Get('banks')
  @ApiOperation({ summary: 'فهرست بانک‌ها برای تشخیص شبا' })
  async banks() {
    return this.prisma.bank.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }
}
