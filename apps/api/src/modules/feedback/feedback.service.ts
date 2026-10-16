import { Injectable } from '@nestjs/common';
import type { FeedbackStatus, Prisma, ReviewFeedback } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import {
  orderByArg,
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface CreateFeedbackInput {
  readonly targetKind:
    | 'DOCUMENT'
    | 'STAD_META'
    | 'VENDOR'
    | 'INVOICE'
    | 'INVOICE_ITEM'
    | 'PAYMENT'
    | 'ARCHIVE'
    | 'TAX_REPORT';
  readonly invoiceId: string | null;
  readonly invoiceItemId: string | null;
  readonly sectionKey: string | null;
  readonly body: string;
}

/**
 * بازخورد ناظر.
 *
 * قاعده‌ای که کل این سرویس حولش ساخته شده (معیار پذیرش ۷ فاز ۵):
 * **بازخورد حذف نمی‌شود.** هیچ مسیر حذفی وجود ندارد — نه نرم و نه سخت. تنها چیزی که
 * عوض می‌شود وضعیت است، و هر تغییر وضعیت یک ردیف در `review_feedback_status_history`
 * می‌گذارد. پس «این ایراد رسیدگی شد» همیشه قابل اثبات است، و «این ایراد اصلاً نبود»
 * هرگز قابل ادعا نیست.
 *
 * انتقال‌های مجاز وضعیت هم جدول‌اند، نه شرط پراکنده.
 */
const FEEDBACK_TRANSITIONS: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  OPEN: ['ANSWERED', 'RESOLVED', 'REJECTED'],
  ANSWERED: ['RESOLVED', 'REJECTED', 'OPEN'],
  // رسیدگی‌شده و رد‌شده پایان مسیرند؛ باز کردن دوباره یعنی بازخورد تازه.
  RESOLVED: [],
  REJECTED: [],
};

const FEEDBACK_SORTABLE = ['createdAt', 'updatedAt', 'status'] as const;

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: DocumentAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /** کارتابل بازخوردها، محدود به دامنه دسترسی سند. */
  async list(
    query: ListQuery & { status?: FeedbackStatus | undefined; documentId?: string | undefined },
    user: AuthenticatedUser,
  ): Promise<PageResult<unknown>> {
    const where: Prisma.ReviewFeedbackWhereInput = {
      document: this.access.scope(user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.documentId ? { documentId: query.documentId } : {}),
      ...(query.search ? { body: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.reviewFeedback.findMany({
        where,
        orderBy: orderByArg(query, FEEDBACK_SORTABLE, [{ createdAt: 'desc' }]),
        ...paginationArgs(query),
        include: {
          createdBy: { select: { id: true, fullName: true } },
          document: { select: { id: true, title: true, status: true, documentNumber: true } },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { createdBy: { select: { id: true, fullName: true } } },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
            include: { actor: { select: { id: true, fullName: true } } },
          },
        },
      }),
      this.prisma.reviewFeedback.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  /**
   * ثبت بازخورد تازه.
   *
   * هدف بازخورد باید **واقعاً به همین سند** تعلق داشته باشد؛ وگرنه ناظر می‌توانست با
   * فرستادن شناسه فاکتور سند دیگری، وجود آن را استنباط کند.
   */
  async create(
    documentId: string,
    input: CreateFeedbackInput,
    user: AuthenticatedUser,
  ): Promise<ReviewFeedback> {
    const document = await this.access.assertDocumentVisible(documentId, user);

    if (document.status === 'DRAFT') {
      // تصمیم Q8: ناظر پیش‌نویس را نمی‌بیند، پس بازخورد روی آن هم بی‌معناست.
      throw AppError.conflict(
        'DOCUMENT_IS_DRAFT',
        'روی سند پیش‌نویس نمی‌توان بازخورد ثبت کرد',
      );
    }

    await this.assertTargetBelongsToDocument(documentId, input);

    return this.prisma.$transaction(async (tx) => {
      const feedback = await tx.reviewFeedback.create({
        data: {
          documentId,
          targetKind: input.targetKind,
          invoiceId: input.invoiceId,
          invoiceItemId: input.invoiceItemId,
          sectionKey: input.sectionKey,
          body: input.body,
          status: 'OPEN',
          createdById: user.id,
        },
      });

      await tx.reviewFeedbackStatusHistory.create({
        data: { feedbackId: feedback.id, fromStatus: null, toStatus: 'OPEN', actorId: user.id },
      });

      // شاخص «دارای بازخورد» روی سند — وضعیت سند نیست (تصمیم B12).
      await tx.financialDocument.update({
        where: { id: documentId },
        data: { openFeedbackCount: { increment: 1 } },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'FEEDBACK_CREATE',
          entityType: 'reviewFeedback',
          entityId: feedback.id,
          documentId,
          after: { targetKind: feedback.targetKind, status: feedback.status },
        },
        tx,
      );

      await this.notifications.notifyPermissionHolders(
        'feedback:reply',
        {
          kind: 'FEEDBACK_CREATED',
          title: `بازخورد تازه روی سند «${document.title}»`,
          body: input.body.slice(0, 300),
          documentId,
          feedbackId: feedback.id,
        },
        { exceptUserId: user.id },
        tx,
      );

      return feedback;
    });
  }

  /** پاسخ کارپردازی. پاسخ، وضعیت باز را به «پاسخ داده‌شده» می‌برد. */
  async reply(feedbackId: string, body: string, user: AuthenticatedUser) {
    const feedback = await this.loadVisible(feedbackId, user);

    if (feedback.status === 'RESOLVED' || feedback.status === 'REJECTED') {
      throw AppError.conflict(
        'FEEDBACK_CLOSED',
        'این بازخورد بسته شده است و پاسخ تازه نمی‌پذیرد',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const reply = await tx.reviewFeedbackReply.create({
        data: { feedbackId, body, createdById: user.id },
      });

      if (feedback.status === 'OPEN') {
        await tx.reviewFeedback.update({
          where: { id: feedbackId },
          data: { status: 'ANSWERED' },
        });
        await tx.reviewFeedbackStatusHistory.create({
          data: {
            feedbackId,
            fromStatus: 'OPEN',
            toStatus: 'ANSWERED',
            note: 'پاسخ کارپردازی ثبت شد',
            actorId: user.id,
          },
        });
      }

      await this.audit.record(
        {
          actorId: user.id,
          action: 'FEEDBACK_REPLY',
          entityType: 'reviewFeedback',
          entityId: feedbackId,
          documentId: feedback.documentId,
        },
        tx,
      );

      await this.notifications.notifyUsers(
        [feedback.createdById],
        {
          kind: 'FEEDBACK_REPLIED',
          title: 'به بازخورد شما پاسخ داده شد',
          body: body.slice(0, 300),
          documentId: feedback.documentId,
          feedbackId,
        },
        { exceptUserId: user.id },
        tx,
      );

      return reply;
    });
  }

  /**
   * تغییر وضعیت رسیدگی.
   *
   * انتقال نامجاز رد می‌شود و هر تغییر در تاریخچه می‌نشیند. شمارنده بازخورد باز سند
   * در همان تراکنش به‌روز می‌شود تا شاخص سند با واقعیت نخواند، ممکن نباشد.
   */
  async changeStatus(
    feedbackId: string,
    toStatus: FeedbackStatus,
    note: string | null,
    user: AuthenticatedUser,
  ): Promise<ReviewFeedback> {
    const feedback = await this.loadVisible(feedbackId, user);

    const allowed = FEEDBACK_TRANSITIONS[feedback.status];
    if (!allowed.includes(toStatus)) {
      throw AppError.conflict(
        'INVALID_FEEDBACK_TRANSITION',
        `تغییر وضعیت از «${FEEDBACK_STATUS_FA[feedback.status]}» به «${FEEDBACK_STATUS_FA[toStatus]}» مجاز نیست`,
      );
    }

    const wasOpen = isOpenStatus(feedback.status);
    const willBeOpen = isOpenStatus(toStatus);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reviewFeedback.update({
        where: { id: feedbackId },
        data: {
          status: toStatus,
          // قید دیتابیس هم همین را می‌خواهد: RESOLVED بدون زمان رسیدگی پذیرفته نمی‌شود.
          resolvedAt: toStatus === 'RESOLVED' ? new Date() : null,
        },
      });

      await tx.reviewFeedbackStatusHistory.create({
        data: {
          feedbackId,
          fromStatus: feedback.status,
          toStatus,
          note,
          actorId: user.id,
        },
      });

      if (wasOpen !== willBeOpen) {
        await tx.financialDocument.update({
          where: { id: feedback.documentId },
          data: { openFeedbackCount: { increment: willBeOpen ? 1 : -1 } },
        });
      }

      await this.audit.record(
        {
          actorId: user.id,
          action: 'FEEDBACK_STATUS_CHANGE',
          entityType: 'reviewFeedback',
          entityId: feedbackId,
          documentId: feedback.documentId,
          before: { status: feedback.status },
          after: { status: toStatus },
          reason: note,
        },
        tx,
      );

      if (toStatus === 'RESOLVED' || toStatus === 'REJECTED') {
        await this.notifications.notifyUsers(
          [feedback.createdById],
          {
            kind: 'FEEDBACK_RESOLVED',
            title: `بازخورد شما ${FEEDBACK_STATUS_FA[toStatus]} شد`,
            body: note,
            documentId: feedback.documentId,
            feedbackId,
          },
          { exceptUserId: user.id },
          tx,
        );
      }

      return updated;
    });
  }

  async get(feedbackId: string, user: AuthenticatedUser) {
    await this.loadVisible(feedbackId, user);

    return this.prisma.reviewFeedback.findUniqueOrThrow({
      where: { id: feedbackId },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { createdBy: { select: { id: true, fullName: true } } },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, fullName: true } } },
        },
      },
    });
  }

  private async loadVisible(
    feedbackId: string,
    user: AuthenticatedUser,
  ): Promise<ReviewFeedback> {
    const feedback = await this.prisma.reviewFeedback.findFirst({
      where: { id: feedbackId, document: this.access.scope(user) },
    });
    if (!feedback) throw AppError.notFound('بازخورد یافت نشد');
    return feedback;
  }

  /** هدف بازخورد باید به همین سند تعلق داشته باشد. */
  private async assertTargetBelongsToDocument(
    documentId: string,
    input: CreateFeedbackInput,
  ): Promise<void> {
    if (input.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: input.invoiceId, documentId },
        select: { id: true },
      });
      if (!invoice) {
        throw AppError.validation('فاکتور انتخاب‌شده به این سند تعلق ندارد', [
          { path: 'invoiceId', message: 'فاکتور متعلق به این سند نیست' },
        ]);
      }
    }

    if (input.invoiceItemId) {
      const item = await this.prisma.invoiceItem.findFirst({
        where: {
          id: input.invoiceItemId,
          ...(input.invoiceId === null ? {} : { invoiceId: input.invoiceId }),
          invoice: { documentId },
        },
        select: { id: true },
      });
      if (!item) {
        throw AppError.validation('ردیف انتخاب‌شده به این فاکتور تعلق ندارد', [
          { path: 'invoiceItemId', message: 'ردیف متعلق به این فاکتور نیست' },
        ]);
      }
    }
  }
}

const FEEDBACK_STATUS_FA: Record<FeedbackStatus, string> = {
  OPEN: 'باز',
  ANSWERED: 'پاسخ داده‌شده',
  RESOLVED: 'رسیدگی‌شده',
  REJECTED: 'رد‌شده',
};

/** «باز» برای شمارنده سند یعنی هنوز بسته نشده — پاسخ‌داده‌شده هم هنوز باز است. */
function isOpenStatus(status: FeedbackStatus): boolean {
  return status === 'OPEN' || status === 'ANSWERED';
}

export { FEEDBACK_TRANSITIONS, isOpenStatus };
