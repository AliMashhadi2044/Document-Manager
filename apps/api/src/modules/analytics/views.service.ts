import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { reportQuerySchema, type ReportQuery } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { AnalyticsService } from './analytics.service';

/**
 * نماهای ذخیره‌شده گزارش — «تنظیمات جدول» که کاربر دوباره بازش می‌کند.
 *
 * دو قاعده:
 *
 *  ۱. **نما پیش از ذخیره اعتبارسنجی می‌شود.** ستون‌ها و فیلترها همان مسیری را
 *     می‌پیمایند که یک اجرای واقعی می‌پیماید، با مجوزهای همان کاربر. نمای نامعتبر
 *     ذخیره نمی‌شود، نه اینکه روزی که کسی بازش می‌کند خطا بدهد.
 *
 *  ۲. **نمای اشتراکی، دسترسی اضافه نمی‌دهد.** نما فقط «ستون‌ها و فیلترها» است؛ وقتی
 *     کاربر دیگری بازش می‌کند، اجرا با مجوزهای **خودش** انجام می‌شود. پس نمای یک
 *     مدیر، در دست بایگانی داده بیشتری نشان نمی‌دهد — همان قاعده‌ای که فاز ۷ برای
 *     قالب‌های گزارش داشت.
 */
@Injectable()
export class ViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async list(datasetKey: string, user: AuthenticatedUser) {
    this.analytics.requireDataset(datasetKey, user);

    const views = await this.prisma.reportView.findMany({
      where: {
        datasetKey,
        // نمای خودِ کاربر، به‌علاوه نماهای اشتراکی دیگران.
        OR: [{ ownerId: user.id }, { isShared: true }],
      },
      orderBy: [{ isShared: 'asc' }, { name: 'asc' }],
      include: { owner: { select: { id: true, fullName: true } } },
    });

    return views.map((view) => ({
      id: view.id,
      name: view.name,
      datasetKey: view.datasetKey,
      columns: view.columns as string[],
      filter: view.filter,
      sort: view.sort,
      pageSize: view.pageSize,
      isShared: view.isShared,
      isOwn: view.ownerId === user.id,
      owner: view.owner,
      updatedAt: view.updatedAt,
    }));
  }

  async save(
    datasetKey: string,
    input: { id?: string | undefined; name: string; isShared: boolean; query?: unknown },
    user: AuthenticatedUser,
  ) {
    this.analytics.requireDataset(datasetKey, user);
    const query = this.validateQuery(datasetKey, input.query, user);

    const data = {
      datasetKey,
      name: input.name,
      columns: query.columns as unknown as Prisma.InputJsonValue,
      filter: query.filter as unknown as Prisma.InputJsonValue,
      sort: query.sort as unknown as Prisma.InputJsonValue,
      pageSize: query.pageSize,
      isShared: input.isShared,
    };

    if (input.id !== undefined) {
      const existing = await this.prisma.reportView.findUnique({ where: { id: input.id } });
      if (!existing) throw AppError.notFound('نما یافت نشد');
      // نمای دیگران حتی اگر اشتراکی باشد، فقط خواندنی است.
      if (existing.ownerId !== user.id) throw AppError.notFound('نما یافت نشد');

      const updated = await this.prisma.reportView.update({ where: { id: input.id }, data });
      return { id: updated.id, name: updated.name };
    }

    try {
      const created = await this.prisma.reportView.create({
        data: { ...data, ownerId: user.id },
      });
      return { id: created.id, name: created.name };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict(
          'REPORT_VIEW_DUPLICATE',
          'نمایی با همین نام برای این گزارش دارید؛ نام دیگری انتخاب کنید.',
        );
      }
      throw error;
    }
  }

  async remove(viewId: string, user: AuthenticatedUser) {
    const existing = await this.prisma.reportView.findUnique({ where: { id: viewId } });
    if (!existing || existing.ownerId !== user.id) throw AppError.notFound('نما یافت نشد');

    await this.prisma.reportView.delete({ where: { id: viewId } });
    return { id: viewId };
  }

  /**
   * اعتبارسنجی درخواست ذخیره‌شده.
   *
   * همان دروازه‌های اجرا: ستون موجود و مجاز، فیلتر با فیلد و عملگر و مقدار درست.
   * `buildWhere` اینجا فقط برای **بررسی** صدا زده می‌شود و نتیجه‌اش استفاده نمی‌شود.
   */
  private validateQuery(datasetKey: string, raw: unknown, user: AuthenticatedUser): ReportQuery {
    const parsed = reportQuerySchema.safeParse(raw);
    if (!parsed.success) {
      throw AppError.validation(
        'تنظیمات نما معتبر نیست',
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
