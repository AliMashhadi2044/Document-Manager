import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DEFAULT_UPLOAD_LIMITS, UPLOAD_TYPES, safeDownloadFilename, type UploadTypeKey } from '@dm/shared';
import type { Response } from 'express';

import {
  CurrentUser,
  RequirePermission,
  type AuthenticatedUser,
} from '../../common/auth/auth.decorators';
import { AppError } from '../../common/errors/app-error';
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

    // هر فایل مستقل پردازش می‌شود: یک فایل نامعتبر، بقیه را دور نمی‌ریزد، ولی
    // نتیجه‌اش هم پنهان نمی‌ماند.
    const uploaded = [];
    const failed = [];

    for (const file of files) {
      try {
        const attachment = await this.attachments.upload(documentId, file, attachmentKind, user);
        uploaded.push(attachment);
      } catch (error) {
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
    const { attachment, stream } = await this.attachments.readContent(
      id,
      user,
      inline ? 'PREVIEW' : 'DOWNLOAD',
    );

    const filename = safeDownloadFilename(attachment.originalFilename);

    response.setHeader('Content-Type', attachment.detectedMime);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Length', attachment.sizeBytes.toString());
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

  @RequirePermission('attachment:delete')
  @Delete('attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'حذف نرم فایل — رکورد برای حسابرسی باقی می‌ماند' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.attachments.softDelete(id, user);
  }
}
