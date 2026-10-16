import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

import { AppError } from '../../common/errors/app-error';

/**
 * لایه نازک روی object storage سازگار با S3 (ADR-0011).
 *
 * چرا این لایه وجود دارد و کد مستقیم SDK صدا نمی‌زند:
 *  - کلید شیء **فقط اینجا** ساخته می‌شود، از شناسه‌های سروری. هیچ ورودی کاربری به
 *    مسیر راه ندارد، پس Path Traversal ساختاراً ممکن نیست.
 *  - تعویض endpoint (MinIO، SeaweedFS، S3 سازمان) فقط پیکربندی است، نه تغییر کد.
 *  - خطای خام SDK هرگز به کاربر نمی‌رسد؛ اینجا به خطای فارسی ترجمه می‌شود.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private bucketReady = false;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY');
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'dm-documents';

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      // نبودِ پیکربندی یعنی آپلود در دسترس نیست — ولی بقیه سامانه باید بالا بیاید.
      this.client = null;
      this.logger.warn('ذخیره‌سازی فایل پیکربندی نشده است؛ مسیرهای پیوست غیرفعال‌اند.');
      return;
    }

    this.client = new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE') ?? true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.ensureBucket();
    } catch (error) {
      // در دسترس نبودن ذخیره‌سازی هنگام بالا آمدن، کل سرویس را زمین نمی‌زند؛
      // اولین آپلود خطای روشن می‌دهد.
      this.logger.warn(
        `آماده‌سازی bucket ناموفق بود: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`,
      );
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** کلید شیء — سروری، بدون نام کاربر و بدون پسوندِ ورودی کاربر. */
  buildDocumentKey(documentId: string, attachmentId: string, extension: string): string {
    const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'bin';
    return `documents/${documentId}/${attachmentId}.${safeExtension}`;
  }

  async ensureBucket(): Promise<void> {
    const client = this.requireClient();
    if (this.bucketReady) return;

    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`bucket «${this.bucket}» ساخته شد.`);
    }
    this.bucketReady = true;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = this.requireClient();
    await this.ensureBucket();
    await client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** استریم محتوا برای دانلود؛ کل فایل در حافظه بارگذاری نمی‌شود. */
  async getStream(key: string): Promise<Readable> {
    const client = this.requireClient();
    const result = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) {
      throw AppError.notFound('محتوای فایل در فضای ذخیره‌سازی یافت نشد');
    }
    return result.Body as Readable;
  }

  async remove(key: string): Promise<void> {
    const client = this.requireClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw AppError.conflict(
        'STORAGE_NOT_CONFIGURED',
        'فضای ذخیره‌سازی فایل پیکربندی نشده است. با مدیر سامانه تماس بگیرید.',
      );
    }
    return this.client;
  }
}
