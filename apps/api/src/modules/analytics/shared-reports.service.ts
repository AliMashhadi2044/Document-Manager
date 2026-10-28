import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { reportQuerySchema, type ReportQuery } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from './analytics.service';

/**
 * ارسال یک گزارش برای بررسی.
 *
 * کارپردازی جدول را با فیلترهای دلخواهش می‌چیند، عنوان و شرح می‌گذارد و می‌فرستد؛
 * ناظر اعلان می‌گیرد و با یک کلیک همان جدول را می‌بیند.
 *
 * ─────── آنچه ذخیره می‌شود، تعریف است و نه ردیف ───────
 *
 * ستون‌ها و فیلتر و ترتیب ذخیره می‌شوند، نه خروجیِ اجرا. وقتی گیرنده بازش می‌کند،
 * اجرا با مجوزها و دامنهٔ دسترسی **خودِ او** انجام می‌شود — همان قاعده‌ای که نمای
 * اشتراکی و قالب گزارش دارند. اگر ردیف‌ها snapshot می‌شدند، «فرستادن گزارش» تبدیل
 * می‌شد به راهی برای دادن داده‌ای که گیرنده حق دیدنش را ندارد.
 *
 * ─────── گیرنده با مجوز انتخاب می‌شود، نه با نقش ───────
 *
 * اعلان به دارندگان `report:share_read` می‌رود. اگر فردا این مجوز به نقش دیگری هم
 * داده شود، اعلان خودبه‌خود درست می‌رود؛ فهرست نقشِ سفت‌شده در کد همان‌جا می‌شکست.
 */
@Injectable()
export class SharedReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async send(
    input: {
      datasetKey: string;
      title: string;
      description?: string | null | undefined;
      query?: unknown;
    },
    user: AuthenticatedUser,
  ) {
    const dataset = this.analytics.requireDataset(input.datasetKey, user);
    const query = this.validateQuery(input.datasetKey, input.query, user);

    const created = await this.prisma.sharedReport.create({
      data: {
        senderId: user.id,
        datasetKey: input.datasetKey,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        columns: query.columns as unknown as Prisma.InputJsonValue,
        filter: query.filter as unknown as Prisma.InputJsonValue,
        sort: query.sort as unknown as Prisma.InputJsonValue,
        pageSize: query.pageSize,
      },
    });

    /*
      اعلان بیرون از ساخت رکورد است و عمداً: اگر ارسال اعلان شکست بخورد، گزارش
      فرستاده‌شده نباید از بین برود — `notifyPermissionHolders` خودش خطا را
      می‌بلعد و log می‌کند.
    */
    await this.notifications.notifyPermissionHolders(
      'report:share_read',
      {
        kind: 'REPORT_SHARED',
        title: `گزارش تازه: ${created.title}`,
        body: created.description ?? `گزارش «${dataset.titleFa}» از ${user.fullName}`,
        sharedReportId: created.id,
      },
      { exceptUserId: user.id },
    );

    await this.audit.record({
      actorId: user.id,
      action: 'REPORT_SHARED',
      entityType: 'shared_report',
      entityId: created.id,
      // عنوان و مجموعه‌داده؛ نه فیلتر، که می‌تواند مقدار جست‌وجوشده را داشته باشد.
      after: { datasetKey: created.datasetKey, title: created.title },
    });

    return { id: created.id, title: created.title };
  }

  /**
   * گزارش‌هایی که این کاربر می‌بیند.
   *
   * فرستنده همیشه فرستاده‌های خودش را می‌بیند (بی‌نیاز از مجوز دیدن)، و دارندهٔ
   * `report:share_read` همهٔ فرستاده‌ها را.
   */
  async list(user: AuthenticatedUser) {
    const canReadAll = user.permissions.includes('report:share_read');

    const rows = await this.prisma.sharedReport.findMany({
      where: canReadAll ? {} : { senderId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { sender: { select: { id: true, fullName: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      datasetKey: row.datasetKey,
      title: row.title,
      description: row.description,
      sender: row.sender,
      isMine: row.senderId === user.id,
      createdAt: row.createdAt,
    }));
  }

  async get(id: string, user: AuthenticatedUser) {
    const row = await this.prisma.sharedReport.findUnique({
      where: { id },
      include: { sender: { select: { id: true, fullName: true } } },
    });

    // نبودن و نداشتن مجوز، هر دو ۴۰۴: وجودِ گزارشی که کاربر حق دیدنش را ندارد هم اطلاعات است.
    const allowed =
      row !== null && (row.senderId === user.id || user.permissions.includes('report:share_read'));
    if (!row || !allowed) throw AppError.notFound('این گزارش وجود ندارد');

    /*
      مجموعه‌داده با مجوزهای **گیرنده** بررسی می‌شود.

      اگر فرستنده گزارشی از مجموعه‌داده‌ای بفرستد که گیرنده حقش را ندارد، اینجا ۴۰۴
      می‌گیرد — نه اینکه جدول با خطای مبهم باز شود.
    */
    this.analytics.requireDataset(row.datasetKey, user);

    return {
      id: row.id,
      datasetKey: row.datasetKey,
      title: row.title,
      description: row.description,
      sender: row.sender,
      isMine: row.senderId === user.id,
      createdAt: row.createdAt,
      query: {
        columns: row.columns as string[],
        filter: row.filter,
        sort: row.sort,
        pageSize: row.pageSize,
      },
    };
  }

  /**
   * اعتبارسنجی تنظیمات گزارش، با مجوزهای **فرستنده**.
   *
   * همان دروازه‌های اجرا: ستون موجود و مجاز، فیلتر با فیلد و عملگر و مقدار درست.
   * گزارشی که همین حالا نامعتبر است، نباید فرستاده شود تا روزی که ناظر بازش
   * می‌کند خطا بدهد.
   */
  private validateQuery(datasetKey: string, raw: unknown, user: AuthenticatedUser): ReportQuery {
    const parsed = reportQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw AppError.validation(
        'تنظیمات گزارش معتبر نیست',
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    const dataset = this.analytics.requireDataset(datasetKey, user);
    this.analytics.resolveColumns(dataset, parsed.data.columns, user.permissions);
    this.analytics.whereFor(dataset, parsed.data, user);

    return parsed.data;
  }
}
