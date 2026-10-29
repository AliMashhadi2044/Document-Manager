import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Attachment, Prisma } from '@prisma/client';
import {
  DEFAULT_UPLOAD_LIMITS,
  FileValidationError,
  UPLOAD_TYPES,
  validateUpload,
  type UploadLimits,
  type UploadTypeKey,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { StorageService } from './storage.service';
import { DocumentAccessService } from '../documents/document-access.service';
import { rotatePdf } from './pdf-rotation';

export interface UploadedFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

/**
 * پیوست‌های سند.
 *
 * ترتیب دو مرحله‌ای ثبت (docs/12 §۲): رکورد `PENDING` → آپلود شیء → `READY`. اگر
 * آپلود شکست بخورد، رکورد `PENDING` می‌ماند و job پاک‌سازی آن را برمی‌دارد؛ هیچ‌وقت
 * رکوردی وجود ندارد که وعده فایلی را بدهد که آنجا نیست.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly access: DocumentAccessService,
  ) {}

  private get limits(): UploadLimits {
    return DEFAULT_UPLOAD_LIMITS;
  }

  async list(documentId: string, user: AuthenticatedUser) {
    await this.access.assertDocumentVisible(documentId, user);

    return this.prisma.attachment.findMany({
      where: { documentId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * آپلود یک فایل.
   *
   * نوع فایل از **محتوا** تشخیص داده می‌شود؛ پسوند و MIME اعلامی فقط برای تطبیق‌اند
   * (docs/12 §۳). نام اصلی هرگز وارد کلید شیء نمی‌شود.
   */
  async upload(
    documentId: string,
    file: UploadedFile,
    kind: 'SCAN' | 'OTHER',
    user: AuthenticatedUser,
  ): Promise<Attachment> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    if (document.status === 'ARCHIVED') {
      throw AppError.conflict(
        'DOCUMENT_ARCHIVED',
        'سند بایگانی‌شده است؛ برای افزودن فایل باید ابتدا بازگشایی شود.',
      );
    }

    const detected = this.validate(file);

    // سقف تعداد و حجم کل، پیش از نوشتن هر چیزی.
    const existing = await this.prisma.attachment.aggregate({
      where: { documentId, deletedAt: null },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });

    const currentCount = existing._count._all;
    const currentBytes = existing._sum.sizeBytes ?? 0n;

    if (currentCount >= this.limits.maxFilesPerDocument) {
      throw AppError.validation(
        `هر سند حداکثر ${this.limits.maxFilesPerDocument} فایل می‌تواند داشته باشد`,
        [{ path: 'file', message: 'سقف تعداد فایل‌های سند پر شده است' }],
      );
    }
    if (currentBytes + BigInt(file.size) > BigInt(this.limits.maxTotalBytesPerDocument)) {
      throw AppError.validation('مجموع حجم فایل‌های این سند از حد مجاز بیشتر می‌شود', [
        { path: 'file', message: 'سقف حجم کل سند پر شده است' },
      ]);
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // فایل تکراری: خطا نیست، ولی کاربر باید بداند.
    const duplicate = await this.prisma.attachment.findFirst({
      where: { documentId, checksumSha256: checksum, deletedAt: null },
    });
    if (duplicate) {
      throw AppError.conflict(
        'ATTACHMENT_DUPLICATE',
        `همین فایل قبلاً با نام «${duplicate.originalFilename}» برای این سند ثبت شده است`,
      );
    }

    const extension = detected.extensions[0] as string;

    // مرحله ۱: رکورد PENDING، تا کلید شیء از شناسه واقعی ساخته شود.
    const pending = await this.prisma.attachment.create({
      data: {
        documentId,
        kind,
        /*
          کلید موقت و **یکتا**، نه رشتهٔ خالی.

          `storage_key` قید یکتایی دارد، پس با رشتهٔ خالی فقط **یک** رکورد
          PENDING می‌توانست هم‌زمان وجود داشته باشد: اولین آپلودی که نیمه‌کاره
          می‌ماند (قطعی فضای ذخیره‌سازی، درخواست لغو‌شده) جای آن رشته را می‌گرفت و
          از آن پس **هر** آپلودی در کل سامانه با خطای یکتایی رد می‌شد — با پیام
          «آپلود این فایل ناموفق بود»، که هیچ نمی‌گوید.

          پیشوند `pending:` عمدی است: کلید واقعی هرگز با آن شروع نمی‌شود، پس
          رکورد نیمه‌کاره در نگاه اول پیداست.
        */
        storageKey: `pending:${randomUUID()}`,
        originalFilename: file.originalname.slice(0, 255),
        declaredMime: file.mimetype.slice(0, 150),
        detectedMime: detected.mime,
        typeKey: detected.key,
        sizeBytes: BigInt(file.size),
        checksumSha256: checksum,
        pageCount: detected.key === 'PDF' ? countPdfPages(file.buffer) : null,
        status: 'PENDING',
        // اسکنر بدافزار در این استقرار وجود ندارد؛ وضعیت صادقانه ثبت می‌شود،
        // نه «پاک» ادعایی (docs/12 §۳).
        scanStatus: 'SKIPPED',
        uploadedById: user.id,
      },
    });

    const storageKey = this.storage.buildDocumentKey(documentId, pending.id, extension);

    try {
      // مرحله ۲: آپلود شیء.
      await this.storage.put(storageKey, file.buffer, detected.mime);
    } catch (error) {
      // رکورد PENDING عمداً باقی می‌ماند تا job پاک‌سازی ببیندش.
      throw AppError.conflict(
        'STORAGE_UNAVAILABLE',
        `ذخیره فایل ناموفق بود: ${error instanceof AppError ? error.message : 'فضای ذخیره‌سازی در دسترس نیست'}`,
      );
    }

    // مرحله ۳: READY شدن در همان تراکنشی که رویداد حسابرسی را هم می‌نویسد.
    return this.prisma.$transaction(async (tx) => {
      const ready = await tx.attachment.update({
        where: { id: pending.id },
        data: { storageKey, status: 'READY' },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'ATTACHMENT_UPLOAD',
          entityType: 'attachment',
          entityId: ready.id,
          documentId,
          after: {
            originalFilename: ready.originalFilename,
            typeKey: ready.typeKey,
            sizeBytes: ready.sizeBytes.toString(),
            checksumSha256: ready.checksumSha256,
          },
        },
        tx,
      );

      return ready;
    });
  }

  /**
   * خواندن محتوای فایل برای دانلود یا پیش‌نمایش.
   *
   * دسترسی **پیش از** استریم بررسی می‌شود، و رکورد خارج از دامنه دسترسی ۴۰۴ می‌گیرد،
   * نه ۴۰۳ — تا وجود فایل سند دیگری لو نرود (معیار پذیرش ۵).
   */
  async readContent(
    attachmentId: string,
    user: AuthenticatedUser,
    reason: 'DOWNLOAD' | 'PREVIEW',
  ): Promise<{ attachment: Attachment; stream: Readable; byteLength: bigint }> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null, status: 'READY' },
    });
    if (!attachment) throw AppError.notFound('فایل یافت نشد');

    // همان دامنه دسترسی سند؛ بدون این، شناسه فایل یک راه دور زدن محدودیت نقش بود.
    await this.access.assertDocumentVisible(attachment.documentId, user);

    await this.audit.record({
      actorId: user.id,
      action: reason === 'DOWNLOAD' ? 'ATTACHMENT_DOWNLOAD' : 'ATTACHMENT_PREVIEW',
      entityType: 'attachment',
      entityId: attachment.id,
      documentId: attachment.documentId,
    });

    /*
      پیش‌نمایش همیشه بایت‌های اصلی است و چرخش را خودِ نمایشگر اعمال می‌کند — زنده،
      همان لحظه که کاربر دکمه را می‌زند. دانلود اما یک فایل است که از سامانه بیرون
      می‌رود و کسی نمی‌تواند رویش چیزی اعمال کند؛ پس چرخش باید **در خودِ فایل**
      باشد، وگرنه کاربر برگهٔ کجی را می‌گیرد که در سامانه صاف دیده بود.
    */
    const rotations =
      reason === 'DOWNLOAD' && attachment.detectedMime === 'application/pdf'
        ? await this.prisma.attachmentPageRotation.findMany({
            where: { attachmentId },
            select: { pageNumber: true, rotation: true },
          })
        : [];

    if (rotations.length === 0) {
      return {
        attachment,
        stream: await this.storage.getStream(attachment.storageKey),
        byteLength: attachment.sizeBytes,
      };
    }

    /*
      فقط این مسیر فایل را کامل در حافظه می‌آورد، چون بازنویسی PDF جز با کل فایل
      ممکن نیست. وقتی چرخشی ثبت نشده باشد — یعنی تقریباً همیشه — همان stream قبلی
      برمی‌گردد و چیزی عوض نمی‌شود.

      شکست بازنویسی، دانلود را از بین نمی‌برد: کاربر فایل اصلی را می‌گیرد، که بدتر
      از نگرفتنِ هیچ فایلی نیست.
    */
    const original = await this.storage.getBuffer(attachment.storageKey);
    try {
      const rotated = await rotatePdf(
        original,
        new Map(rotations.map((row) => [row.pageNumber, row.rotation])),
      );
      return { attachment, stream: Readable.from(rotated), byteLength: BigInt(rotated.length) };
    } catch (error) {
      this.logger.error({ err: error, attachmentId }, 'اعمال چرخش روی فایل دانلودی ناموفق بود');
      return {
        attachment,
        stream: Readable.from(original),
        byteLength: BigInt(original.length),
      };
    }
  }

  /**
   * چرخش برگه‌های یک اسکن.
   *
   * چرخش روی **فایل** ذخیره می‌شود و نه در مرورگر: کاربر بعدی باید همان برگهٔ صاف
   * را ببیند، نه اینکه هر کسی دوباره بچرخاند. و چون فایل دانلودی هم از همین‌جا
   * می‌خواند، «آنچه دیدم» و «آنچه گرفتم» یکی می‌مانند.
   */
  async readRotations(
    attachmentId: string,
    user: AuthenticatedUser,
  ): Promise<{ page: number; rotation: number }[]> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      select: { id: true, documentId: true },
    });
    if (!attachment) throw AppError.notFound('فایل یافت نشد');

    await this.access.assertDocumentVisible(attachment.documentId, user);

    const rows = await this.prisma.attachmentPageRotation.findMany({
      where: { attachmentId },
      select: { pageNumber: true, rotation: true },
      orderBy: { pageNumber: 'asc' },
    });

    return rows.map((row) => ({ page: row.pageNumber, rotation: row.rotation }));
  }

  /**
   * جایگزینی کامل چرخش‌ها.
   *
   * ورودی **تمام** حالت است و نه یک تغییر: برگه‌ای که در فهرست نیست یعنی «بدون
   * چرخش». این انتخاب عمدی است — با تغییرِ تکی، یک درخواست گم‌شده حالتی می‌ساخت که
   * نه مرورگر و نه سرور نمی‌توانستند بگویند درست است یا نه.
   *
   * سند بایگانی‌شده هم چرخش می‌پذیرد: فایل و checksum آن دست‌نخورده می‌مانند و
   * صاف کردن یک اسکن کج، همان کاری است که بایگانی بعد از بایگانی هم لازم دارد.
   */
  async saveRotations(
    attachmentId: string,
    user: AuthenticatedUser,
    rotations: readonly { page: number; rotation: number }[],
  ): Promise<{ page: number; rotation: number }[]> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null, status: 'READY' },
      select: { id: true, documentId: true, detectedMime: true },
    });
    if (!attachment) throw AppError.notFound('فایل یافت نشد');

    await this.access.assertDocumentVisible(attachment.documentId, user);

    if (attachment.detectedMime !== 'application/pdf') {
      throw AppError.validation('چرخش برگه فقط برای فایل PDF معنا دارد');
    }

    // یک برگه، یک چرخش؛ دو مقدار برای یک برگه یعنی درخواست بدشکل است.
    const seen = new Set<number>();
    for (const entry of rotations) {
      if (seen.has(entry.page)) {
        throw AppError.validation(`برای برگهٔ ${entry.page} دو چرخش فرستاده شده است`);
      }
      seen.add(entry.page);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.attachmentPageRotation.deleteMany({ where: { attachmentId } });
      if (rotations.length > 0) {
        await tx.attachmentPageRotation.createMany({
          data: rotations.map((entry) => ({
            attachmentId,
            pageNumber: entry.page,
            rotation: entry.rotation,
            updatedById: user.id,
          })),
        });
      }

      await this.audit.record(
        {
          actorId: user.id,
          action: 'ATTACHMENT_ROTATE',
          entityType: 'attachment',
          entityId: attachmentId,
          documentId: attachment.documentId,
          // شمارهٔ برگه و زاویه داده‌اند و نه محتوا؛ چیزی که اینجا بنشیند حساس نیست.
          after: { rotations },
        },
        tx,
      );
    });

    return rotations.map((entry) => ({ page: entry.page, rotation: entry.rotation }));
  }

  /** حذف نرم؛ شیء ذخیره‌سازی طبق سیاست retention بعداً پاک می‌شود. */
  async softDelete(attachmentId: string, user: AuthenticatedUser): Promise<void> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      include: { document: { select: { status: true } } },
    });
    if (!attachment) throw AppError.notFound('فایل یافت نشد');

    await this.access.assertDocumentVisible(attachment.documentId, user);

    if (attachment.document.status === 'ARCHIVED') {
      throw AppError.conflict(
        'DOCUMENT_ARCHIVED',
        'بایگانی این سند نهایی شده است؛ حذف فایل پس از آن مجاز نیست.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date(), deletedById: user.id },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'ATTACHMENT_DELETE',
          entityType: 'attachment',
          entityId: attachmentId,
          documentId: attachment.documentId,
          before: { originalFilename: attachment.originalFilename },
        },
        tx,
      );
    });
  }

  /** تاریخچه عملیات فایل — از audit log، که منبع واحد رویدادهاست. */
  async history(attachmentId: string, user: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, documentId: true },
    });
    if (!attachment) throw AppError.notFound('فایل یافت نشد');

    await this.access.assertDocumentVisible(attachment.documentId, user);

    return this.prisma.auditLog.findMany({
      where: { entityType: 'attachment', entityId: attachmentId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { id: true, fullName: true } },
      },
    });
  }

  private validate(file: UploadedFile) {
    try {
      return validateUpload(
        {
          filename: file.originalname,
          declaredMime: file.mimetype,
          // امضای همه قالب‌های مجاز در ۸ بایت اول است؛ خواندن بیشتر لازم نیست.
          bytes: file.buffer.subarray(0, 16),
          sizeBytes: file.size,
        },
        this.limits,
      );
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw AppError.validation(error.message, [{ path: 'file', message: error.message }]);
      }
      throw error;
    }
  }
}

/** نوع فایل برای هدر دانلود — از نوع **تشخیص‌داده‌شده** سرور، نه ورودی کاربر. */
export function attachmentContentType(typeKey: string): string {
  const known = UPLOAD_TYPES[typeKey as UploadTypeKey];
  return known ? known.mime : 'application/octet-stream';
}

/**
 * شمارش تقریبی صفحات PDF.
 *
 * عمداً ساده است: شمارش `/Type /Page` در بایت‌های خام. PDF فشرده یا خطی ممکن است
 * عدد دقیقی ندهد، پس این مقدار **نمایشی** است و هیچ تصمیمی بر پایه‌اش گرفته نمی‌شود.
 * جایگزینش یک کتابخانه کامل تجزیه PDF بود — سطح حمله‌ای که ارزش یک عدد نمایشی را ندارد.
 */
function countPdfPages(buffer: Buffer): number | null {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : null;
}

export type { Prisma };
