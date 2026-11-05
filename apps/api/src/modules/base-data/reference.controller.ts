import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  invoiceDefaultsSchema,
  parseInvoiceDefaults,
  type InvoiceDefaults,
} from '@dm/shared';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { ZodBody } from '../../common/validation/zod.pipe';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/** کلید تنظیمِ پیش‌فرض‌های فاکتور در `system_settings`. */
const INVOICE_DEFAULTS_KEY = 'invoice_defaults';

/**
 * داده‌های مرجع که فرم‌ها برای پر کردن فهرست‌هایشان لازم دارند.
 *
 * یک درخواست به‌جای چند درخواست جدا، چون این داده‌ها کم‌حجم و کم‌تغییرند و کلاینت
 * می‌تواند مدت معقولی کششان کند (الزام بهینگی).
 */
@ApiTags('base-data')
@Controller('base-data')
export class ReferenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
      districts,
      vehicleTypes,
      invoiceDefaultsRow,
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
      // ناحیه و نوع خودرو: والدِ فهرست‌های فرم‌های اختصاصی فاز ۴. خود مدرسه‌ها و
      // پلاک‌ها اینجا نمی‌آیند؛ تعدادشان زیاد است و با جست‌وجوی سمت سرور گرفته می‌شوند.
      this.prisma.district.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.vehicleType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.systemSetting.findUnique({ where: { key: INVOICE_DEFAULTS_KEY } }),
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
      districts,
      vehicleTypes,
      /*
        پیش‌فرض‌های فاکتور، در همین پاسخ.

        فرم فاکتور همین حالا این پاسخ را می‌گیرد؛ یک درخواست جدا فقط برای سه عدد،
        یک رفت‌وبرگشت اضافه در مسیری بود که کاربر منتظرش می‌ماند.
      */
      invoiceDefaults: parseInvoiceDefaults(invoiceDefaultsRow?.value),
    };
  }

  /**
   * پیش‌فرض‌های فاکتور.
   *
   * مجوزش `financial_settings:write` است و نه `base_data:write`: این عدد به
   * محاسبهٔ مالیات می‌رسد، و کسی که اطلاعات پایه را نگه می‌دارد لزوماً اختیار
   * تصمیم مالی ندارد.
   */
  @RequirePermission('financial_settings:write')
  @Put('invoice-defaults')
  @ApiOperation({ summary: 'ذخیرهٔ پیش‌فرض‌های فرم فاکتور' })
  async setInvoiceDefaults(
    @Body(new ZodBody(invoiceDefaultsSchema)) body: InvoiceDefaults,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InvoiceDefaults> {
    const before = await this.prisma.systemSetting.findUnique({
      where: { key: INVOICE_DEFAULTS_KEY },
    });

    await this.prisma.systemSetting.upsert({
      where: { key: INVOICE_DEFAULTS_KEY },
      create: { key: INVOICE_DEFAULTS_KEY, value: body, updatedBy: user.id },
      update: { value: body, updatedBy: user.id },
      select: { key: true },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'INVOICE_DEFAULTS_SET',
      /*
        کلید تنظیم در `entityType` می‌نشیند، نه در `entityId`.

        `audit_logs.entity_id` ستونی از نوع UUID است و کلید این تنظیم یک رشته
        («invoice_defaults»). فرستادنش به آن ستون، نوشتن در رد حسابرسی را
        **خاموشانه** شکست می‌داد: خطا بیرون از تراکنش فقط لاگ می‌شد و درخواست
        ۲۰۰ برمی‌گرداند — یعنی نرخ مالیاتِ سازمان عوض می‌شد و هیچ ردی نمی‌ماند.
      */
      entityType: `systemSetting.${INVOICE_DEFAULTS_KEY}`,
      entityId: null,
      before: parseInvoiceDefaults(before?.value),
      after: body,
    });

    return body;
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
