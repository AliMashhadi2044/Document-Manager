import { Injectable } from '@nestjs/common';
import { Prisma, type FinancialDocument } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, type ErrorDetail } from '../../common/errors/app-error';
import {
  orderByArg,
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface ArchiveInfoInput {
  readonly documentNumber: string;
  /** تاریخ سند به‌صورت `YYYY-MM-DD` میلادی؛ تبدیل شمسی سمت کلاینت انجام شده است. */
  readonly documentDate: string;
  readonly notes: string | null;
}

const ARCHIVE_SORTABLE = ['createdAt', 'fiscalYear', 'documentDate', 'totalAmount'] as const;

/**
 * کارتابل بایگانی.
 *
 * محدوده کار بایگانی عمداً باریک است: شماره سند، تاریخ سند، توضیح بایگانی، فایل‌ها، و
 * نهایی کردن بایگانی. **هیچ مبلغی** از این مسیر قابل تغییر نیست — نه چون کد اینجا
 * مراقب است، بلکه چون نقش بایگانی اصلاً مجوز `document:update` و `invoice:*` ندارد و
 * نگهبان مجوز پیش از رسیدن به این سرویس جلویش را می‌گیرد (معیار پذیرش ۲).
 */
@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: DocumentAccessService,
    private readonly documents: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** کارتابل: اسنادی که در جریان بایگانی‌اند، با فیلتر وضعیت و سال مالی. */
  async inbox(
    query: ListQuery & {
      status?: 'PENDING_ARCHIVE' | 'ARCHIVED' | 'NEEDS_REVISION' | undefined;
      fiscalYear?: number | undefined;
      hasOpenFeedback?: boolean | undefined;
    },
    user: AuthenticatedUser,
  ): Promise<PageResult<unknown>> {
    const where: Prisma.FinancialDocumentWhereInput = {
      ...this.access.scope(user),
      status: query.status ?? { in: ['PENDING_ARCHIVE', 'ARCHIVED', 'NEEDS_REVISION'] },
      ...(query.fiscalYear ? { fiscalYear: query.fiscalYear } : {}),
      ...(query.hasOpenFeedback === undefined
        ? {}
        : query.hasOpenFeedback
          ? { openFeedbackCount: { gt: 0 } }
          : { openFeedbackCount: 0 }),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { documentNumber: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.financialDocument.findMany({
        where,
        orderBy: orderByArg(query, ARCHIVE_SORTABLE, [{ createdAt: 'desc' }]),
        ...paginationArgs(query),
        include: {
          buyerSnapshot: { select: { name: true } },
          archiveMetadata: true,
          _count: { select: { invoices: true, attachments: true } },
        },
      }),
      this.prisma.financialDocument.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  /**
   * ثبت یا اصلاح شماره و تاریخ سند.
   *
   * یکتایی شماره در هر سال مالی را **ایندکس دیتابیس** تضمین می‌کند
   * (`financial_documents_number_per_year_uk`، تصمیم Q5)؛ این متد فقط خطای خام را به
   * پیام فارسی ترجمه می‌کند. بررسی «قبلش وجود دارد؟» جایگزین قید نیست: بین بررسی و
   * نوشتن، درخواست دیگری می‌تواند همان شماره را ثبت کند (معیار پذیرش ۴).
   */
  async saveInfo(
    documentId: string,
    input: ArchiveInfoInput,
    user: AuthenticatedUser,
  ): Promise<FinancialDocument> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    if (document.status === 'ARCHIVED') {
      throw AppError.conflict(
        'DOCUMENT_ARCHIVED',
        'بایگانی این سند نهایی شده است؛ برای تغییر باید سند بازگشایی شود.',
      );
    }
    if (document.status !== 'PENDING_ARCHIVE' && document.status !== 'NEEDS_REVISION') {
      throw AppError.conflict(
        'DOCUMENT_NOT_IN_ARCHIVE',
        'این سند هنوز به بایگانی ارجاع نشده است',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.financialDocument.update({
          where: { id: documentId },
          data: {
            documentNumber: input.documentNumber,
            documentDate: new Date(`${input.documentDate}T00:00:00.000Z`),
          },
        });

        await tx.archiveMetadata.upsert({
          where: { documentId },
          create: { documentId, status: 'IN_PROGRESS', notes: input.notes },
          update: { status: 'IN_PROGRESS', notes: input.notes },
        });

        await this.audit.record(
          {
            actorId: user.id,
            action: 'ARCHIVE_INFO_SAVE',
            entityType: 'financialDocument',
            entityId: documentId,
            documentId,
            before: {
              documentNumber: document.documentNumber,
              documentDate: document.documentDate,
            },
            after: {
              documentNumber: updated.documentNumber,
              documentDate: updated.documentDate,
            },
          },
          tx,
        );

        return updated;
      });
    } catch (error) {
      throw this.translateConstraint(error, document.fiscalYear, input.documentNumber);
    }
  }

  /**
   * نهایی کردن بایگانی.
   *
   * پیش‌نیازها **همه با هم** گزارش می‌شوند، نه اولین مورد؛ بایگان باید یک‌بار بداند
   * چه چیزی کم است.
   */
  async complete(documentId: string, user: AuthenticatedUser): Promise<FinancialDocument> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    const problems: ErrorDetail[] = [];

    if (!document.documentNumber || !document.documentDate) {
      problems.push({
        path: 'documentNumber',
        message: 'شماره و تاریخ سند پیش از نهایی کردن بایگانی باید ثبت شوند',
      });
    }

    const attachments = await this.prisma.attachment.count({
      where: { documentId, deletedAt: null, status: 'READY' },
    });
    if (attachments === 0) {
      problems.push({
        path: 'attachments',
        message: 'حداقل یک فایل اسکن سند باید بارگذاری شده باشد',
      });
    }

    if (document.openFeedbackCount > 0) {
      problems.push({
        path: 'feedbacks',
        message: `این سند ${document.openFeedbackCount} بازخورد رسیدگی‌نشده دارد`,
      });
    }

    if (problems.length > 0) {
      throw new AppError('ARCHIVE_NOT_READY', 'سند برای نهایی شدن بایگانی آماده نیست', 422, problems);
    }

    const updated = await this.documents.archive(documentId, user);

    await this.prisma.archiveMetadata.upsert({
      where: { documentId },
      create: {
        documentId,
        status: 'COMPLETED',
        archivedById: user.id,
        archivedAt: new Date(),
      },
      update: { status: 'COMPLETED', archivedById: user.id, archivedAt: new Date() },
    });

    await this.notifications.notifyUsers([document.createdById], {
      kind: 'DOCUMENT_ARCHIVED',
      title: `بایگانی سند «${document.title}» نهایی شد`,
      body: document.documentNumber ? `شماره سند: ${document.documentNumber}` : null,
      documentId,
    });

    return updated;
  }

  /** جزئیات بایگانی یک سند برای صفحه کارتابل. */
  async detail(documentId: string, user: AuthenticatedUser) {
    await this.access.assertDocumentVisible(documentId, user);

    return this.prisma.financialDocument.findUniqueOrThrow({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        status: true,
        fiscalYear: true,
        documentNumber: true,
        documentDate: true,
        openFeedbackCount: true,
        totalAmount: true,
        archiveMetadata: {
          include: { archivedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
  }

  /**
   * ترجمه نقض یکتایی شماره سند.
   *
   * Prisma نام **ستون‌ها** را گزارش می‌دهد، نه نام ایندکس جزئی؛ پس تشخیص از ترکیب
   * ستون‌هاست (همان درسی که در فاز ۳ با ایندکس ستاد گرفته شد).
   */
  private translateConstraint(error: unknown, fiscalYear: number, documentNumber: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.['target'];
      const columns = Array.isArray(target) ? target.map(String) : [String(target ?? '')];

      if (columns.includes('document_number')) {
        return AppError.conflict(
          'DOCUMENT_NUMBER_DUPLICATE',
          `شماره سند «${documentNumber}» در سال مالی ${fiscalYear} قبلاً ثبت شده است`,
        );
      }
    }
    return error;
  }
}
