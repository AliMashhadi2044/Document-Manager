import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { FileValidationError, validateUpload } from '@dm/shared';
import { z } from 'zod';

import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { CurrentUser, RequirePermission } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../files/storage.service';
import { ZodBody } from '../../common/validation/zod.pipe';

/**
 * سالِ شمسی معتبر.
 *
 * دامنه همان چیزی است که CHECK در پایگاه داده هم اجبار می‌کند؛ دو جا نوشتنش عمدی
 * است: اعتبارسنجی پیام فارسی می‌دهد و CHECK ضمانت نهایی است.
 */
const jalaliYear = z.coerce
  .number()
  .int()
  .min(1300, 'سال معتبر نیست')
  .max(1500, 'سال معتبر نیست');

/** متنِ اختیاری؛ رشتهٔ خالی یعنی «ثبت‌نشده» و نه مقدارِ خالی. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

const settingsSchema = z.object({
  /**
   * نام سازمان — سربرگ هر گزارش از همین خوانده می‌شود.
   *
   * برخلاف بقیه، خالی بودنش مجاز نیست: سربرگِ بی‌نام، فرمی می‌سازد که معلوم نیست
   * از کجاست.
   */
  name: z.string().trim().min(1, 'نام سازمان الزامی است').max(300).optional(),
  addressLine: optionalText(1000),
  postalCode: optionalText(10),
  phone: optionalText(30),
  fax: optionalText(30),
  defaultFiscalYear: jalaliYear.nullable().optional(),
  defaultJalaliYear: jalaliYear.nullable().optional(),
});

interface UploadedLogo {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/** حداکثر اندازه نشان سازمان. نشان یک تصویر کوچک است، نه اسکن سند. */
const MAX_LOGO_BYTES = 1_000_000;

/** فقط تصویر راستر. SVG عمداً مجاز نیست: می‌تواند اسکریپت داشته باشد. */
const ALLOWED_LOGO_TYPES = ['PNG', 'JPEG'];

/**
 * نشان سازمان.
 *
 * نشان در **فضای ذخیره‌سازی** می‌ماند و مسیرش در `organization_settings.logo_path`
 * ثبت می‌شود؛ نه در پایگاه داده به‌صورت base64 و نه در پوشه عمومی وب. دلیلش همان
 * قاعده فایل‌هاست: هیچ فایل آپلودی از مسیر عمومی سرو نمی‌شود و خواندنش از یک
 * endpoint با بررسی مجوز می‌گذرد.
 *
 * بارگذاری مجوز نوشتن اطلاعات پایه می‌خواهد، ولی **دیدن** نشان فقط مجوز خواندن
 * می‌خواهد: نشان در سربرگ برنامه برای همه کاربران دیده می‌شود.
 */
@ApiTags('base-data')
@Controller('base-data/organization')
export class OrganizationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * تنظیمات سازمان: هویت سازمان و سال‌های پیش‌فرض.
   *
   * خواندنشان در `bootstrap` هم هست؛ این مسیر فقط برای نوشتن است.
   */
  @RequirePermission('base_data:write')
  @Patch()
  @ApiOperation({ summary: 'ذخیرهٔ نام و مشخصات سازمان و سال‌های پیش‌فرض' })
  async updateSettings(
    @Body(new ZodBody(settingsSchema)) body: z.infer<typeof settingsSchema>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const before = await this.prisma.organizationSettings.findUnique({ where: { id: 1 } });
    if (!before) throw AppError.notFound('تنظیمات سازمان ثبت نشده است');

    // فقط کلیدهایی که واقعاً آمده‌اند نوشته می‌شوند؛ `undefined` در شیء داده پریزما
    // جای `null` را نمی‌گیرد و با exactOptionalPropertyTypes اصلاً تایپ نمی‌شود.
    const data: {
      name?: string;
      addressLine?: string | null;
      postalCode?: string | null;
      phone?: string | null;
      fax?: string | null;
      defaultFiscalYear?: number | null;
      defaultJalaliYear?: number | null;
    } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.addressLine !== undefined) data.addressLine = body.addressLine;
    if (body.postalCode !== undefined) data.postalCode = body.postalCode;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.fax !== undefined) data.fax = body.fax;
    if (body.defaultFiscalYear !== undefined) data.defaultFiscalYear = body.defaultFiscalYear;
    if (body.defaultJalaliYear !== undefined) data.defaultJalaliYear = body.defaultJalaliYear;

    const updated = await this.prisma.organizationSettings.update({ where: { id: 1 }, data });

    await this.audit.record({
      actorId: user.id,
      action: 'BASE_DATA_UPDATE',
      entityType: 'organizationSettings',
      /*
        شناسهٔ موجودیت خالی می‌ماند و این عمدی است.

        `audit_logs.entity_id` ستونی از نوع UUID است و کلید این جدول یک عدد
        (همیشه ۱). فرستادن `'1'` باعث می‌شد نوشتن در رد حسابرسی **خاموشانه شکست
        بخورد** — خطا بیرون از تراکنش فقط لاگ می‌شد — یعنی تغییر مشخصات سازمان
        هیچ ردی نمی‌گذاشت. جدول تک‌ردیفی است، پس `entityType` به‌تنهایی می‌گوید
        چه چیزی عوض شده.
      */
      entityId: null,
      before,
      after: updated,
    });

    return updated;
  }

  @RequirePermission('base_data:read')
  @Get('logo')
  @ApiOperation({ summary: 'نشان سازمان؛ ۴۰۴ اگر تنظیم نشده باشد' })
  async logo(@Res() response: Response): Promise<void> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 1 } });
    if (!settings?.logoPath) {
      throw new AppError('LOGO_NOT_SET', 'نشان سازمان تنظیم نشده است', 404);
    }

    const stream = await this.storage.getStream(settings.logoPath);
    // نوع محتوا از پسوند **ذخیره‌شده سمت سرور** می‌آید، نه از ورودی کاربر.
    response.setHeader(
      'Content-Type',
      settings.logoPath.endsWith('.png') ? 'image/png' : 'image/jpeg',
    );
    // نشان کم عوض می‌شود ولی وقتی عوض شد باید دیده شود؛ اعتبارسنجی مجدد با سرور.
    response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    stream.pipe(response);
  }

  @RequirePermission('base_data:write')
  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'بارگذاری یا جایگزینی نشان سازمان' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }))
  async upload(
    @UploadedFile() file: UploadedLogo | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ hasLogo: true }> {
    if (!file) {
      throw AppError.validation('فایلی فرستاده نشده است', [
        { path: 'file', message: 'فایل نشان الزامی است' },
      ]);
    }

    let detected;
    try {
      detected = validateUpload({
        filename: file.originalname,
        declaredMime: file.mimetype,
        bytes: file.buffer.subarray(0, 16),
        sizeBytes: file.size,
      });
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw AppError.validation(error.message, [{ path: 'file', message: error.message }]);
      }
      throw error;
    }

    if (!ALLOWED_LOGO_TYPES.includes(detected.key)) {
      throw AppError.validation('نشان سازمان باید تصویر PNG یا JPEG باشد', [
        { path: 'file', message: `نوع فرستاده‌شده: ${detected.titleFa}` },
      ]);
    }

    const extension = detected.key === 'PNG' ? 'png' : 'jpg';
    // نام سمت سرور ساخته می‌شود و نام کاربر هیچ‌جا در مسیر نمی‌آید (پیمایش مسیر).
    const key = `organization/logo-${Date.now()}.${extension}`;

    const previous = await this.prisma.organizationSettings.findUnique({ where: { id: 1 } });
    await this.storage.put(key, file.buffer, detected.mime);

    await this.prisma.organizationSettings.update({
      where: { id: 1 },
      data: { logoPath: key },
    });

    // نشان قبلی پس از موفقیت پاک می‌شود، نه قبلش: اگر نوشتن فایل تازه شکست بخورد،
    // سازمان بدون نشان نمی‌ماند.
    if (previous?.logoPath && previous.logoPath !== key) {
      await this.storage.remove(previous.logoPath).catch(() => undefined);
    }

    await this.audit.record({
      actorId: user.id,
      action: 'ORGANIZATION_LOGO_SET',
      entityType: 'OrganizationSettings',
      /*
        شناسهٔ موجودیت خالی می‌ماند و این عمدی است.

        `audit_logs.entity_id` ستونی از نوع UUID است و کلید این جدول یک عدد
        (همیشه ۱). فرستادن `'1'` باعث می‌شد نوشتن در رد حسابرسی **خاموشانه شکست
        بخورد** — خطا بیرون از تراکنش فقط لاگ می‌شد — یعنی تغییر مشخصات سازمان
        هیچ ردی نمی‌گذاشت. جدول تک‌ردیفی است، پس `entityType` به‌تنهایی می‌گوید
        چه چیزی عوض شده.
      */
      entityId: null,
      before: { logoPath: previous?.logoPath ?? null },
      after: { logoPath: key },
    });

    return { hasLogo: true };
  }

  @RequirePermission('base_data:write')
  @Delete('logo')
  @ApiOperation({ summary: 'حذف نشان سازمان' })
  async remove(@CurrentUser() user: AuthenticatedUser): Promise<{ hasLogo: false }> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 1 } });
    if (!settings?.logoPath) return { hasLogo: false };

    await this.prisma.organizationSettings.update({ where: { id: 1 }, data: { logoPath: null } });
    await this.storage.remove(settings.logoPath).catch(() => undefined);

    await this.audit.record({
      actorId: user.id,
      action: 'ORGANIZATION_LOGO_REMOVED',
      entityType: 'OrganizationSettings',
      /*
        شناسهٔ موجودیت خالی می‌ماند و این عمدی است.

        `audit_logs.entity_id` ستونی از نوع UUID است و کلید این جدول یک عدد
        (همیشه ۱). فرستادن `'1'` باعث می‌شد نوشتن در رد حسابرسی **خاموشانه شکست
        بخورد** — خطا بیرون از تراکنش فقط لاگ می‌شد — یعنی تغییر مشخصات سازمان
        هیچ ردی نمی‌گذاشت. جدول تک‌ردیفی است، پس `entityType` به‌تنهایی می‌گوید
        چه چیزی عوض شده.
      */
      entityId: null,
      before: { logoPath: settings.logoPath },
      after: { logoPath: null },
    });

    return { hasLogo: false };
  }
}
