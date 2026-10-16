import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  FILTER_OPERATOR_LABELS,
  formatJalali,
  isoDateToJalali,
  type Permission,
  type ReportQuery,
} from '@dm/shared';
import type { Readable } from 'node:stream';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { StorageService } from '../files/storage.service';
import { safeFilename } from '../reporting/excel-safety';
import { AnalyticsService } from './analytics.service';
import { findField, type DatasetDefinition } from './datasets';
import { TableExporter } from './table.exporter';

/**
 * آستانه صف و عمر لینک، از پیکربندی.
 *
 * زیر آستانه، فایل هم‌زمان ساخته و فرستاده می‌شود — چون انتظار چندصدمیلی‌ثانیه بهتر
 * از رفت‌و‌برگشت «کار ساخته شد / حالا بپرس آماده شده؟» است. بالای آن، درخواست HTTP
 * نباید منتظر یک کوئری چندده‌هزار ردیفی بماند.
 *
 * قابل تنظیم بودنش یک نیاز واقعی آزمون است: روی ماشین توسعه داده هیچ‌وقت به هزاران
 * ردیف نمی‌رسد و بدون این، مسیر صف هیچ‌وقت زنده آزموده نمی‌شد.
 */
export const DEFAULT_SYNC_EXPORT_ROW_LIMIT = 2_000;
export const DEFAULT_EXPORT_TTL_HOURS = 24;

/**
 * خروجی‌گیری فایل — هم‌زمان برای کوچک، صف برای حجیم (معیار پذیرش ۴ فاز ۸).
 *
 * صف **در همین پروسه** است و یک کار در هر لحظه اجرا می‌شود. این یک انتخاب آگاهانه
 * است، نه یک میان‌بر پنهان: افزودن Redis یا یک worker جدا به این استقرار (یک سرویس،
 * یک پایگاه داده) پیچیدگی عملیاتی می‌آورد که هنوز توجیه ندارد. در عوض، وضعیت هر کار
 * در **دیتابیس** است، نه در حافظه؛ پس با ریستارت سرویس گم نمی‌شود و کارهای نیمه‌کاره
 * هنگام بالا آمدن به حالت «ناموفق» می‌روند تا کاربر منتظر چیزی نماند که دیگر اجرا
 * نمی‌شود.
 *
 * محدودیتی که از این انتخاب می‌آید و صادقانه ثبت می‌شود: با چند نمونه (instance) از
 * سرویس، هر نمونه صف خودش را دارد و کار یک نمونه روی نمونه دیگر ادامه پیدا نمی‌کند.
 */
@Injectable()
export class ExportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportService.name);
  private readonly queue: string[] = [];
  private working = false;
  private cleanupTimer: NodeJS.Timeout | null = null;

  private readonly syncRowLimit: number;
  private readonly ttlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly exporter: TableExporter,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    config?: ConfigService,
  ) {
    this.syncRowLimit =
      config?.get<number>('EXPORT_SYNC_ROW_LIMIT') ?? DEFAULT_SYNC_EXPORT_ROW_LIMIT;
    this.ttlHours = config?.get<number>('EXPORT_TTL_HOURS') ?? DEFAULT_EXPORT_TTL_HOURS;
  }

  async onModuleInit(): Promise<void> {
    await this.recoverInterruptedJobs();

    // پاک‌سازی دوره‌ای: فایل منقضی باید واقعاً پاک شود، نه فقط «منقضی» علامت بخورد.
    this.cleanupTimer = setInterval(
      () => void this.cleanupExpired().catch(() => undefined),
      60 * 60 * 1000,
    );
    this.cleanupTimer.unref();
    await this.cleanupExpired().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /**
   * خروجی هم‌زمان — همان `where` و `orderBy` جدول.
   *
   * معیار پذیرش ۲: خروجی دقیقاً همان فیلتر و مرتب‌سازی جدول را منعکس می‌کند. این با
   * «یک مسیر دیگر که همان کار را می‌کند» به‌دست نمی‌آید؛ هر دو از `AnalyticsService`
   * می‌آیند و همان تابع‌ها را صدا می‌زنند.
   */
  async buildNow(
    datasetKey: string,
    query: ReportQuery,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; filename: string; rowCount: number }> {
    const dataset = this.analytics.requireDataset(datasetKey, user);
    const columns = this.analytics.resolveColumns(dataset, query.columns, user.permissions);

    const { buffer, rowCount } = await this.exporter.build(
      columns,
      this.analytics.streamRows(datasetKey, query, user),
      {
        titleFa: dataset.titleFa,
        notes: this.describeQuery(dataset, query, user),
        generatedAt: new Date(),
      },
    );

    await this.audit.record({
      actorId: user.id,
      action: 'REPORT_EXPORT',
      entityType: 'analytics',
      after: { datasetKey, rowCount, mode: 'SYNC' },
    });

    return { buffer, filename: safeFilename(dataset.titleFa, 'xlsx'), rowCount };
  }

  /**
   * تعداد ردیف و اینکه آیا این خروجی باید به صف برود.
   *
   * `syncLimit` هم برگردانده می‌شود تا رابط کاربری (و آزمون زنده) **قاعده تصمیم** را
   * ببیند، نه فقط نتیجه‌اش.
   */
  async plan(
    datasetKey: string,
    query: ReportQuery,
    user: AuthenticatedUser,
  ): Promise<{ rowCount: number; queued: boolean; syncLimit: number }> {
    const rowCount = await this.analytics.countRows(datasetKey, query, user);
    return {
      rowCount,
      queued: rowCount > this.syncRowLimit,
      syncLimit: this.syncRowLimit,
    };
  }

  async enqueue(datasetKey: string, query: ReportQuery, user: AuthenticatedUser) {
    const dataset = this.analytics.requireDataset(datasetKey, user);
    // اعتبارسنجی پیش از صف: کار نامعتبر نباید وارد صف شود و بعداً شکست بخورد.
    this.analytics.resolveColumns(dataset, query.columns, user.permissions);
    this.analytics.whereFor(dataset, query, user);

    if (!this.storage.isConfigured) {
      throw AppError.conflict(
        'STORAGE_NOT_CONFIGURED',
        'فضای ذخیره‌سازی پیکربندی نشده است؛ خروجی حجیم ساخته نمی‌شود.',
      );
    }

    const job = await this.prisma.exportJob.create({
      data: {
        datasetKey,
        params: query as unknown as Prisma.InputJsonValue,
        requestedById: user.id,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'REPORT_EXPORT_QUEUED',
      entityType: 'exportJob',
      entityId: job.id,
      after: { datasetKey },
    });

    this.queue.push(job.id);
    void this.drain();

    return job;
  }

  async status(jobId: string, user: AuthenticatedUser) {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    // کار دیگران ۴۰۴ می‌گیرد، نه ۴۰۳: وجود خروجیِ کاربر دیگر هم اطلاعات است.
    if (!job || job.requestedById !== user.id) throw AppError.notFound('کار خروجی یافت نشد');

    return {
      id: job.id,
      datasetKey: job.datasetKey,
      status: job.status,
      rowCount: job.rowCount,
      sizeBytes: job.sizeBytes === null ? null : job.sizeBytes.toString(),
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      expiresAt: job.expiresAt,
    };
  }

  async listMine(user: AuthenticatedUser) {
    const jobs = await this.prisma.exportJob.findMany({
      where: { requestedById: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return jobs.map((job) => ({
      id: job.id,
      datasetKey: job.datasetKey,
      status: job.status,
      rowCount: job.rowCount,
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      errorMessage: job.errorMessage,
    }));
  }

  /**
   * دانلود خروجی صف‌شده.
   *
   * سه شرط و هر سه لازم: کار **از خودِ کاربر** باشد، موفق شده باشد، و منقضی نشده
   * باشد. شناسه کار یک UUID است ولی تنها دفاع نیست — «لینک غیرقابل حدس» بدون بررسی
   * مالکیت، یعنی هر کسی که لینک را ببیند فایل را دارد.
   */
  async download(
    jobId: string,
    user: AuthenticatedUser,
  ): Promise<{ stream: Readable; filename: string }> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.requestedById !== user.id) throw AppError.notFound('کار خروجی یافت نشد');

    if (job.status !== 'SUCCEEDED' || job.storageKey === null) {
      throw AppError.conflict('EXPORT_NOT_READY', 'این خروجی آماده دانلود نیست');
    }
    if (job.expiresAt !== null && job.expiresAt.getTime() < Date.now()) {
      throw AppError.conflict('EXPORT_EXPIRED', 'مهلت دانلود این خروجی به پایان رسیده است');
    }

    const dataset = this.analytics.requireDataset(job.datasetKey, user);
    const stream = await this.storage.getStream(job.storageKey);

    await this.audit.record({
      actorId: user.id,
      action: 'REPORT_EXPORT_DOWNLOAD',
      entityType: 'exportJob',
      entityId: job.id,
    });

    return { stream, filename: safeFilename(dataset.titleFa, 'xlsx') };
  }

  /** کارهایی که با ریستارت سرویس نیمه‌کاره ماندند. */
  private async recoverInterruptedJobs(): Promise<void> {
    const interrupted = await this.prisma.exportJob.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorMessage: 'ساخت این خروجی با راه‌اندازی دوباره سرویس قطع شد؛ دوباره تلاش کنید.',
        finishedAt: new Date(),
      },
    });
    if (interrupted.count > 0) {
      this.logger.warn(`${interrupted.count} کار خروجی نیمه‌کاره به حالت ناموفق رفت.`);
    }

    const pending = await this.prisma.exportJob.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: 50,
    });
    for (const job of pending) this.queue.push(job.id);
    if (pending.length > 0) void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.working) return;
    this.working = true;

    try {
      for (;;) {
        const jobId = this.queue.shift();
        if (jobId === undefined) return;
        await this.process(jobId);
      }
    } finally {
      this.working = false;
    }
  }

  private async process(jobId: string): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: jobId },
      include: {
        requestedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            isActive: true,
            roles: {
              select: {
                role: {
                  select: {
                    key: true,
                    permissions: { select: { permission: { select: { key: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!job || job.status !== 'PENDING') return;

    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      /*
       * کار با مجوزهای **همان کاربر** اجرا می‌شود و مجوزها در لحظه اجرا از دیتابیس
       * خوانده می‌شوند، نه از نشستی که درخواست را فرستاده.
       *
       * دلیلش یک حالت واقعی است: کاربری خروجی حجیمی درخواست می‌کند، نقشش عوض
       * می‌شود (یا غیرفعال می‌شود) و فایل چند دقیقه بعد ساخته می‌شود. اگر مجوزها از
       * لحظه درخواست می‌آمد، فایل داده‌ای را نشان می‌داد که کاربر همان لحظه دیگر حق
       * دیدنش را نداشت.
       */
      if (!job.requestedBy.isActive) {
        throw AppError.forbidden('کاربر درخواست‌کننده غیرفعال شده است');
      }

      const permissions = [
        ...new Set(
          job.requestedBy.roles.flatMap((link) =>
            link.role.permissions.map((entry) => entry.permission.key as Permission),
          ),
        ),
      ];
      const actor: AuthenticatedUser = {
        id: job.requestedBy.id,
        username: job.requestedBy.username,
        fullName: job.requestedBy.fullName,
        roles: job.requestedBy.roles.map((link) => link.role.key),
        permissions,
        // کار صف‌شده به نشست گره نمی‌خورد: نشستِ درخواست‌دهنده ممکن است تا لحظه
        // اجرا بسته شده باشد، ولی مجوزهای کاربر همان لحظه از دیتابیس خوانده می‌شوند.
        sessionId: `export:${job.id}`,
      };

      const query = job.params as unknown as ReportQuery;
      const dataset = this.analytics.requireDataset(job.datasetKey, actor);
      const columns = this.analytics.resolveColumns(dataset, query.columns, permissions);

      const { buffer, rowCount } = await this.exporter.build(
        columns,
        this.analytics.streamRows(job.datasetKey, query, actor),
        {
          titleFa: dataset.titleFa,
          notes: this.describeQuery(dataset, query, actor),
          generatedAt: new Date(),
        },
      );

      const storageKey = `exports/${job.id}.xlsx`;
      await this.storage.put(
        storageKey,
        buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'SUCCEEDED',
          rowCount,
          storageKey,
          sizeBytes: BigInt(buffer.byteLength),
          finishedAt: new Date(),
          expiresAt: new Date(Date.now() + this.ttlHours * 60 * 60 * 1000),
        },
      });

      await this.audit.record({
        actorId: job.requestedById,
        action: 'REPORT_EXPORT',
        entityType: 'exportJob',
        entityId: job.id,
        after: { datasetKey: job.datasetKey, rowCount, mode: 'QUEUED' },
      });
    } catch (error) {
      // پیام کاربرپسند؛ جزئیات فنی فقط در log سرور می‌ماند.
      const message =
        error instanceof AppError ? error.message : 'ساخت خروجی با خطا متوقف شد';
      this.logger.error(
        `ساخت خروجی ${jobId} ناموفق: ${error instanceof Error ? error.message : 'نامشخص'}`,
      );
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: message, finishedAt: new Date() },
      });
    }
  }

  /**
   * پاک کردن فایل‌های منقضی.
   *
   * ردیف کار می‌ماند (با وضعیت `EXPIRED`) تا تاریخچه گم نشود، ولی **فایل** از فضای
   * ذخیره‌سازی پاک می‌شود: نگه داشتن یک فایل حاوی داده مالی بی‌آنکه کسی لازمش داشته
   * باشد، فقط سطح افشا را بزرگ می‌کند.
   */
  async cleanupExpired(): Promise<number> {
    const expired = await this.prisma.exportJob.findMany({
      where: { status: 'SUCCEEDED', expiresAt: { lt: new Date() } },
      select: { id: true, storageKey: true },
      take: 100,
    });

    let removed = 0;
    for (const job of expired) {
      try {
        if (job.storageKey !== null) await this.storage.remove(job.storageKey);
      } catch (error) {
        this.logger.warn(
          `پاک کردن فایل خروجی ${job.id} ناموفق بود: ${error instanceof Error ? error.message : 'نامشخص'}`,
        );
        continue;
      }
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: { status: 'EXPIRED', storageKey: null, sizeBytes: null },
      });
      removed += 1;
    }

    if (removed > 0) this.logger.log(`${removed} فایل خروجی منقضی پاک شد.`);
    return removed;
  }

  /**
   * توصیف فارسی فیلترهای اعمال‌شده، برای نوشتن بالای فایل.
   *
   * فایلی که بیرون از سامانه می‌رود باید خودش بگوید چه برشی از داده است.
   */
  describeQuery(
    dataset: DatasetDefinition,
    query: ReportQuery,
    user: AuthenticatedUser,
  ): string[] {
    const notes: string[] = [
      `تاریخ تولید: ${formatJalali(isoDateToJalali(new Date().toISOString().slice(0, 10)))}`,
    ];

    if (query.groupBy !== undefined && dataset.kind === 'grouped') {
      const dimension = (dataset.groupBy ?? []).find((item) => item.key === query.groupBy);
      if (dimension) notes.push(`گروه‌بندی بر اساس: ${dimension.titleFa}`);
    }

    const described = describeGroup(dataset, query.filter);
    notes.push(described === '' ? 'فیلتر: بدون فیلتر' : `فیلتر: ${described}`);

    if (query.sort.length > 0) {
      const sorts = query.sort
        .map((entry) => {
          const field = findField(dataset, entry.field);
          return `${field?.titleFa ?? entry.field} (${entry.dir === 'asc' ? 'صعودی' : 'نزولی'})`;
        })
        .join('، ');
      notes.push(`مرتب‌سازی: ${sorts}`);
    }

    // شناسه کاربر در فایل نمی‌نشیند؛ فقط اینکه خروجی شخصی است، نه عمومی.
    void user;
    return notes;
  }
}

function describeGroup(
  dataset: DatasetDefinition,
  group: { combine: 'and' | 'or'; conditions: readonly unknown[]; groups?: readonly unknown[] },
): string {
  const parts: string[] = [];

  for (const raw of group.conditions) {
    const condition = raw as { field: string; op: keyof typeof FILTER_OPERATOR_LABELS; values: string[] };
    const field = findField(dataset, condition.field);
    const label = field?.titleFa ?? condition.field;
    const operator = FILTER_OPERATOR_LABELS[condition.op] ?? condition.op;
    const values = condition.values.length === 0 ? '' : ` ${condition.values.join(' و ')}`;
    parts.push(`${label} ${operator}${values}`);
  }

  for (const child of group.groups ?? []) {
    const nested = describeGroup(
      dataset,
      child as { combine: 'and' | 'or'; conditions: readonly unknown[] },
    );
    if (nested !== '') parts.push(`(${nested})`);
  }

  return parts.join(group.combine === 'or' ? ' یا ' : ' و ');
}
