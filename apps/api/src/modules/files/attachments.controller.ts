import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DEFAULT_UPLOAD_LIMITS,
  UPLOAD_TYPES,
  decodeMultipartFilename,
  pageRotationsSchema,
  safeDownloadFilename,
  type PageRotationsInput,
  type UploadTypeKey,
} from '@dm/shared';
import type { Response } from 'express';

import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { AppError } from '../../common/errors/app-error';
import { ZodBody } from '../../common/validation/zod.pipe';
import { AttachmentsService, type UploadedFile } from './attachments.service';

/**
 * پیوست‌های سند.
 *
 * نکته‌های امنیتی این controller (docs/12 §۴):
 *  - `Content-Type` پاسخ از **نوع تشخیص‌داده‌شده سرور** می‌آید، نه از چیزی که کلاینت
 *    هنگام آپلود ادعا کرده بود.
 *  - `X-Content-Type-Options: nosniff` تا مرورگر خودش نوع را حدس نزند.
 *  - نام فایل در هدر پاک‌سازی و به‌صورت RFC 5987 کدگذاری می‌شود.
 *  - هیچ فایلی از مسیر استاتیک سرو نمی‌شود؛ تنها راه، همین مسیر مجوزدار است.
 */
@ApiTags('attachments')
@Controller()
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(private readonly attachments: AttachmentsService) {}

  @RequirePermission('attachment:read')
  @Get('documents/:documentId/attachments')
  @ApiOperation({ summary: 'فهرست پیوست‌های یک سند' })
  async list(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const items = await this.attachments.list(documentId, user);
    return {
      items: items.map((item) => ({
        ...item,
        previewable: UPLOAD_TYPES[item.typeKey as UploadTypeKey]?.previewable ?? false,
      })),
      limits: DEFAULT_UPLOAD_LIMITS,
    };
  }

  @RequirePermission('attachment:upload')
  @Post('documents/:documentId/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'آپلود چندفایلی اسکن سند با اعتبارسنجی محتوا' })
  @UseInterceptors(
    FilesInterceptor('files', DEFAULT_UPLOAD_LIMITS.maxFilesPerDocument, {
      limits: {
        fileSize: DEFAULT_UPLOAD_LIMITS.maxFileBytes,
        files: DEFAULT_UPLOAD_LIMITS.maxFilesPerDocument,
      },
    }),
  )
  async upload(
    @Param('documentId') documentId: string,
    @UploadedFiles() files: UploadedFile[] | undefined,
    @Query('kind') kind: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!files || files.length === 0) {
      throw AppError.validation('فایلی ارسال نشده است', [
        { path: 'files', message: 'حداقل یک فایل انتخاب کنید' },
      ]);
    }

    const attachmentKind = kind === 'OTHER' ? 'OTHER' : 'SCAN';

    // نام فایل را پیش از هر کاری به UTF-8 برمی‌گردانیم: multer آن را latin1 می‌خواند و
    // نام فارسی به شکل مخدوش به اینجا می‌رسد. یک‌جا اصلاح می‌شود تا هم نامِ ذخیره‌شده
    // و هم پیام خطای همان فایل درست باشند.
    const normalized = files.map((file) => ({
      ...file,
      originalname: decodeMultipartFilename(file.originalname),
    }));

    // هر فایل مستقل پردازش می‌شود: یک فایل نامعتبر، بقیه را دور نمی‌ریزد، ولی
    // نتیجه‌اش هم پنهان نمی‌ماند.
    const uploaded = [];
    const failed = [];

    for (const file of normalized) {
      try {
        const attachment = await this.attachments.upload(documentId, file, attachmentKind, user);
        uploaded.push(attachment);
      } catch (error) {
        /*
          خطای غیرمنتظره **log** می‌شود، هرچند کاربر پیام کلی می‌گیرد.

          بدون این، قطعیِ فضای ذخیره‌سازی دقیقاً شبیه «فایل نامعتبر» دیده می‌شد —
          همان پیام، و هیچ ردی در log برای فهمیدن اینکه کدام‌یک بوده است. نام فایل
          و متن خطا می‌روند و نه محتوای فایل.
        */
        if (!(error instanceof AppError)) {
          this.logger.error(
            { err: error, filename: file.originalname, documentId },
            'آپلود پیوست با خطای غیرمنتظره شکست خورد',
          );
        }

        failed.push({
          filename: file.originalname,
          message: error instanceof AppError ? error.message : 'آپلود این فایل ناموفق بود',
        });
      }
    }

    return { uploaded, failed };
  }

  @RequirePermission('attachment:read')
  @Get('attachments/:id/content')
  @ApiOperation({ summary: 'دانلود یا پیش‌نمایش محتوای فایل — فقط با مجوز و در دامنه دسترسی' })
  async content(
    @Param('id') id: string,
    @Query('disposition') disposition: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const inline = disposition === 'inline';
    const { attachment, stream, byteLength } = await this.attachments.readContent(
      id,
      user,
      inline ? 'PREVIEW' : 'DOWNLOAD',
    );

    const filename = safeDownloadFilename(attachment.originalFilename);

    response.setHeader('Content-Type', attachment.detectedMime);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Length', byteLength.toString());
    response.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    stream.pipe(response);
  }

  @RequirePermission('attachment:read')
  @Get('attachments/:id/history')
  @ApiOperation({ summary: 'تاریخچه عملیات روی فایل' })
  async history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attachments.history(id, user);
  }

  @RequirePermission('attachment:read')
  @Get('attachments/:id/rotations')
  @ApiOperation({ summary: 'چرخش ثبت‌شدهٔ برگه‌های یک فایل PDF' })
  async rotations(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { rotations: await this.attachments.readRotations(id, user) };
  }

  /*
    چرخش، مجوز `attachment:upload` می‌خواهد و نه `attachment:read`.

    آنچه کاربر می‌چرخاند، فقط دید خودش نیست: فایلی که **همه** دانلود می‌کنند عوض
    می‌شود. ناظر که سند را فقط می‌خواند، نباید بتواند آن را تغییر دهد؛ کارپردازی و
    بایگانی که اسکن در دستشان است، می‌توانند.
  */
  @RequirePermission('attachment:upload')
  @Put('attachments/:id/rotations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ثبت چرخش برگه‌ها — روی نمایش و روی فایل دانلودی' })
  async setRotations(
    @Param('id') id: string,
    @Body(new ZodBody(pageRotationsSchema)) body: PageRotationsInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { rotations: await this.attachments.saveRotations(id, user, body.rotations) };
  }

  @RequirePermission('attachment:delete')
  @Delete('attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'حذف نرم فایل — رکورد برای حسابرسی باقی می‌ماند' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.attachments.softDelete(id, user);
  }

  /**
   * فهرست فایل‌های حذف‌شدهٔ سند.
   *
   * با **هر یک** از دو مجوز باز است، چون دو نقش از دو زاویه به یک فهرست نگاه
   * می‌کنند: بایگانی می‌خواهد برگرداند، مدیر سامانه می‌خواهد پاک کند. و این فهرست
   * `attachment:read` **نمی‌خواهد**: نام و اندازه و ردپای حذف می‌دهد، نه محتوا — پس
   * مدیر سامانه که حق دیدن محتوای اسناد را ندارد، می‌تواند کارش را بکند بی‌آنکه
   * دسترسی‌اش به فایل‌ها باز شود.
   */
  @RequireAnyPermission('attachment:restore', 'attachment:purge')
  @Get('documents/:documentId/attachments/deleted')
  @ApiOperation({ summary: 'فایل‌های حذف‌شدهٔ یک سند — برای بازگرداندن یا حذف دائمی' })
  async listDeleted(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const items = await this.attachments.listDeleted(documentId, user);
    return {
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        originalFilename: item.originalFilename,
        typeKey: item.typeKey,
        sizeBytes: item.sizeBytes.toString(),
        status: item.status,
        createdAt: item.createdAt,
        deletedAt: item.deletedAt,
        uploadedBy: item.uploadedBy,
        deletedBy: item.deletedBy,
      })),
    };
  }

  @RequirePermission('attachment:restore')
  @Post('attachments/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'بازگرداندن فایل حذف‌شده به سند' })
  async restore(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const restored = await this.attachments.restore(id, user);
    return {
      id: restored.id,
      originalFilename: restored.originalFilename,
      sizeBytes: restored.sizeBytes.toString(),
    };
  }

  /**
   * حذف دائمی.
   *
   * مسیر جدا از حذف نرم و با مجوز جدا؛ `DELETE` روی مسیری دیگر و نه یک پرچم در
   * بدنهٔ همان درخواست: پرچمی که «برای همیشه» معنا می‌دهد، نباید یک خط دورتر از
   * پرچمی باشد که «موقت» معنا می‌دهد.
   */
  @RequirePermission('attachment:purge')
  @Delete('attachments/:id/purge')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'حذف دائمی فایل — شیء و رکورد می‌روند، ردیف حسابرسی می‌ماند' })
  async purge(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.attachments.purge(id, user);
  }
}
