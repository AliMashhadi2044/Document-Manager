import { Injectable } from '@nestjs/common';
import { Prisma, type FinancialDocument } from '@prisma/client';
import {
  findTransition,
  isEditableStatus,
  type DocumentStatus,
  type WorkflowAction,
} from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, type ErrorDetail } from '../../common/errors/app-error';
import { FinancialService } from '../financial/financial.service';
import {
  orderByArg,
  paginationArgs,
  toPageResult,
  type ListQuery,
  type PageResult,
} from '../../common/query/list-query';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { buildDocumentSnapshot } from './document-snapshot';
import { DocumentAccessService } from './document-access.service';
import { NotificationsService } from '../notifications/notifications.service';

const DOCUMENT_SORTABLE = ['createdAt', 'fiscalYear', 'documentDate', 'totalAmount'] as const;

export interface UpdateDocumentInput {
  readonly title?: string | undefined;
  readonly fiscalYear?: number | undefined;
  readonly jalaliYear?: number | undefined;
  readonly buyerEntityId?: string | undefined;
  readonly stad?: {
    readonly needNumber: string;
    readonly workflowNumber: string;
    readonly requestNumber: string;
    readonly requestTypeId: string | null;
    readonly notes: string | null;
  } | null | undefined;
}

export interface CreateDocumentInput {
  readonly title: string;
  readonly type: 'NORMAL' | 'STAD';
  readonly fiscalYear: number;
  readonly jalaliYear: number;
  readonly buyerEntityId: string;
  readonly stad: {
    readonly needNumber: string;
    readonly workflowNumber: string;
    readonly requestNumber: string;
    readonly requestTypeId: string | null;
    readonly notes: string | null;
  } | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly financial: FinancialService,
    private readonly access: DocumentAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListQuery, user: AuthenticatedUser): Promise<PageResult<FinancialDocument>> {
    const where = this.accessScope(user);

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { documentNumber: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.financialDocument.findMany({
        where,
        orderBy: orderByArg(query, DOCUMENT_SORTABLE, [{ createdAt: 'desc' }]),
        ...paginationArgs(query),
        include: {
          buyerSnapshot: { select: { name: true } },
          _count: { select: { invoices: true } },
        },
      }),
      this.prisma.financialDocument.count({ where }),
    ]);

    return toPageResult(items, total, query);
  }

  async get(id: string, user: AuthenticatedUser) {
    const document = await this.prisma.financialDocument.findFirst({
      // دامنه دسترسی به‌صورت شرط کوئری اعمال می‌شود، نه بررسی پس از خواندن —
      // پس رکورد خارج از دامنه ۴۰۴ می‌گیرد و وجودش لو نمی‌رود (ضد IDOR).
      where: { id, ...this.accessScope(user) },
      include: {
        buyerSnapshot: true,
        stadMetadata: { include: { requestType: true } },
        invoices: {
          // قاعده §۹: تاریخ صورتحساب صعودی، با ترتیب ثانویه پایدار.
          orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
          include: {
            vendorSnapshot: true,
            // گروه بودجه همراه فصل می‌آید: سند فقط یک گروه می‌پذیرد و رابط باید
            // بداند کدام گروه قفل شده است.
            chapter: { select: { title: true, category: { select: { key: true } } } },
            invoiceType: { select: { titleFa: true, kind: true } },
            payment: { include: { paymentMethod: true } },
            // روز سوخت‌گیری روی همان ردیف مالی می‌آید؛ نمایش، ردیف‌ها را دوباره جفت نمی‌کند.
            items: { orderBy: { rowNo: 'asc' }, include: { fuelEntry: true } },
            // جزئیات اختصاصی هر خانواده (فاز ۴) — حداکثر یکی از این دو مقدار دارد.
            utilityDetail: true,
            fuelDetail: true,
          },
        },
      },
    });

    if (!document) throw AppError.notFound('سند یافت نشد');
    return document;
  }

  /** دامنه دسترسی نقش — قاعده‌اش در `DocumentAccessService` است، نه اینجا. */
  private accessScope(user: AuthenticatedUser): Prisma.FinancialDocumentWhereInput {
    return this.access.scope(user);
  }

  async create(input: CreateDocumentInput, user: AuthenticatedUser): Promise<FinancialDocument> {
    const buyer = await this.prisma.buyerEntity.findUnique({
      where: { id: input.buyerEntityId },
    });
    if (!buyer || !buyer.isActive) {
      throw AppError.validation('مجموعه خریدار انتخاب‌شده معتبر یا فعال نیست', [
        { path: 'buyerEntityId', message: 'مجموعه خریدار معتبر نیست' },
      ]);
    }

    const fiscalYear = await this.prisma.fiscalYear.findUnique({
      where: { year: input.fiscalYear },
    });
    if (fiscalYear?.isClosed) {
      throw AppError.validation('سال مالی بسته است و سند جدید نمی‌پذیرد', [
        { path: 'fiscalYear', message: 'سال مالی بسته است' },
      ]);
    }

    if (input.type === 'STAD' && input.stad === null) {
      throw AppError.validation('اطلاعات سامانه ستاد الزامی است', [
        { path: 'stad', message: 'برای سند ستاد، اطلاعات ستاد الزامی است' },
      ]);
    }

    // سیاست گرد کردن در لحظه ایجاد snapshot می‌شود و پس از ثبت نهایی قفل است.
    const policy = await this.financial.organizationRoundingPolicy();

    const document = await this.prisma.$transaction(async (tx) => {
      const buyerSnapshot = await tx.buyerSnapshot.create({
        data: {
          buyerEntityId: buyer.id,
          personType: buyer.personType,
          name: buyer.name,
          economicCode: buyer.economicCode,
          registrationNumber: buyer.registrationNumber,
          nationalId: buyer.nationalId,
          addressLine: buyer.addressLine,
          postalCode: buyer.postalCode,
          phone: buyer.phone,
          fax: buyer.fax,
        },
      });

      const created = await tx.financialDocument.create({
        data: {
          title: input.title,
          type: input.type,
          fiscalYear: input.fiscalYear,
          jalaliYear: input.jalaliYear,
          buyerEntityId: buyer.id,
          buyerSnapshotId: buyerSnapshot.id,
          roundingPolicy: policy as unknown as Prisma.InputJsonValue,
          createdById: user.id,
          ...(input.stad
            ? {
                stadMetadata: {
                  create: {
                    needNumber: input.stad.needNumber,
                    workflowNumber: input.stad.workflowNumber,
                    requestNumber: input.stad.requestNumber,
                    requestTypeId: input.stad.requestTypeId,
                    notes: input.stad.notes,
                  },
                },
              }
            : {}),
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'DOCUMENT_CREATE',
          entityType: 'financialDocument',
          entityId: created.id,
          documentId: created.id,
          after: created,
        },
        tx,
      );

      return created;
    });

    return document;
  }

  /**
   * ویرایش مشخصات سند — فقط در وضعیت‌های قابل ویرایش.
   *
   * همان چیزهایی که هنگام ساخت پرسیده می‌شوند، منهای نوع سند. تا پیش از این فقط
   * «شرح» عوض می‌شد و کاربری که سال یا خریدار را اشتباه زده بود، باید سند را رها
   * می‌کرد و از نو می‌ساخت.
   *
   * **عوض شدن خریدار، snapshot را هم تازه می‌کند** — و همان snapshot تازه روی
   * فاکتورهای همین سند هم می‌نشیند. در سند ثبت‌نشده، snapshot هنوز سند تاریخی
   * نیست؛ اگر دست‌نخورده می‌ماند، برگهٔ سند یک خریدار نشان می‌داد و فاکتورهایش
   * خریدار دیگری — و این اختلاف تا بعد از ثبت نهایی پنهان می‌ماند.
   */
  async update(
    id: string,
    input: UpdateDocumentInput,
    user: AuthenticatedUser,
  ): Promise<FinancialDocument> {
    const before = await this.prisma.financialDocument.findUnique({
      where: { id },
      include: { stadMetadata: true },
    });
    if (!before) throw AppError.notFound('سند یافت نشد');

    if (!isEditableStatus(before.status as DocumentStatus)) {
      throw AppError.conflict(
        'DOCUMENT_NOT_EDITABLE',
        'سند در وضعیت فعلی قابل ویرایش نیست. برای اصلاح، آن را بازگشایی کنید.',
      );
    }

    if (input.fiscalYear !== undefined && input.fiscalYear !== before.fiscalYear) {
      const fiscalYear = await this.prisma.fiscalYear.findUnique({
        where: { year: input.fiscalYear },
      });
      if (fiscalYear?.isClosed) {
        throw AppError.validation('سال مالی بسته است و سند به آن منتقل نمی‌شود', [
          { path: 'fiscalYear', message: 'سال مالی بسته است' },
        ]);
      }
    }

    const buyer =
      input.buyerEntityId !== undefined && input.buyerEntityId !== before.buyerEntityId
        ? await this.prisma.buyerEntity.findUnique({ where: { id: input.buyerEntityId } })
        : null;

    if (input.buyerEntityId !== undefined && input.buyerEntityId !== before.buyerEntityId) {
      if (!buyer || !buyer.isActive) {
        throw AppError.validation('مجموعه خریدار انتخاب‌شده معتبر یا فعال نیست', [
          { path: 'buyerEntityId', message: 'مجموعه خریدار معتبر نیست' },
        ]);
      }
    }

    // اطلاعات ستاد فقط روی سند ستاد معنا دارد، و روی آن حذف‌شدنی نیست.
    if (input.stad !== undefined) {
      if (before.type !== 'STAD') {
        throw AppError.validation('این سند، سند سامانه ستاد نیست', [
          { path: 'stad', message: 'اطلاعات ستاد فقط برای سند ستاد است' },
        ]);
      }
      if (input.stad === null) {
        throw AppError.validation('اطلاعات سامانه ستاد الزامی است', [
          { path: 'stad', message: 'برای سند ستاد، اطلاعات ستاد الزامی است' },
        ]);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let buyerSnapshotId: string | null = null;

      if (buyer) {
        const snapshot = await tx.buyerSnapshot.create({
          data: {
            buyerEntityId: buyer.id,
            personType: buyer.personType,
            name: buyer.name,
            economicCode: buyer.economicCode,
            registrationNumber: buyer.registrationNumber,
            nationalId: buyer.nationalId,
            addressLine: buyer.addressLine,
            postalCode: buyer.postalCode,
            phone: buyer.phone,
            fax: buyer.fax,
          },
        });
        buyerSnapshotId = snapshot.id;

        await tx.invoice.updateMany({
          where: { documentId: id },
          data: { buyerSnapshotId: snapshot.id },
        });
      }

      const row = await tx.financialDocument.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
          ...(input.jalaliYear !== undefined ? { jalaliYear: input.jalaliYear } : {}),
          ...(buyer ? { buyerEntityId: buyer.id, buyerSnapshotId: buyerSnapshotId as string } : {}),
          ...(input.stad
            ? {
                stadMetadata: {
                  // سند ستاد همیشه یک ردیف اطلاعات ستاد دارد؛ `upsert` هم ردیف
                  // نداشتن (سند قدیمی) را می‌پوشاند و هم ویرایش را.
                  upsert: { create: input.stad, update: input.stad },
                },
              }
            : {}),
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: 'DOCUMENT_UPDATE',
          entityType: 'financialDocument',
          entityId: id,
          documentId: id,
          before,
          after: row,
        },
        tx,
      );

      return row;
    });

    return updated;
  }

  /**
   * ثبت نهایی — تراکنشی، با بازمحاسبه کامل مالی.
   *
   * قفل ردیف سند (`FOR UPDATE`) دو درخواست همزمان را سریالایز می‌کند، پس دومی با
   * «وضعیت فعلی اجازه نمی‌دهد» رد می‌شود (ریسک R8).
   */
  async finalize(id: string, user: AuthenticatedUser): Promise<FinancialDocument> {
    return this.transition(id, 'FINALIZE', null, user, async (tx, document) => {
      const problems = await this.validateForFinalize(tx, document.id);
      if (problems.length > 0) {
        throw new AppError(
          'DOCUMENT_NOT_READY',
          'سند برای ثبت نهایی آماده نیست',
          422,
          problems,
        );
      }

      await tx.financialDocument.update({
        where: { id: document.id },
        data: { finalizedAt: new Date(), finalizedById: user.id },
      });
    });
  }

  async reopen(id: string, reason: string, user: AuthenticatedUser): Promise<FinancialDocument> {
    return this.transition(id, 'REOPEN', reason, user);
  }

  /**
   * ارجاع به بایگانی.
   *
   * ردیف `archive_metadata` همین‌جا و **در همان تراکنش** ساخته می‌شود، نه هنگام اولین
   * اقدام بایگان؛ وگرنه کارتابل بایگانی سندی را نشان می‌داد که هنوز رکورد فرایندی
   * ندارد و «از چه زمانی منتظر است» بی‌پاسخ می‌ماند.
   */
  async sendToArchive(id: string, user: AuthenticatedUser): Promise<FinancialDocument> {
    const document = await this.transition(id, 'SEND_TO_ARCHIVE', null, user, async (tx) => {
      await tx.archiveMetadata.upsert({
        where: { documentId: id },
        create: { documentId: id, status: 'RECEIVED', receivedAt: new Date() },
        update: { status: 'RECEIVED', receivedAt: new Date() },
      });
    });

    await this.notifications.notifyPermissionHolders(
      'archive:write',
      {
        kind: 'DOCUMENT_SENT_TO_ARCHIVE',
        title: `سند «${document.title}» به بایگانی ارجاع شد`,
        documentId: id,
      },
      { exceptUserId: user.id },
    );

    return document;
  }

  /** نهایی کردن بایگانی — فقط از مسیر سرویس بایگانی فراخوانی می‌شود. */
  async archive(id: string, user: AuthenticatedUser): Promise<FinancialDocument> {
    return this.transition(id, 'ARCHIVE', null, user, async (tx) => {
      await tx.financialDocument.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    });
  }

  /**
   * ارجاع برای اصلاح — اقدام ناظر.
   *
   * ثبت دلیل الزامی است (جدول `TRANSITIONS`) و کارپرداز سازنده سند اعلان می‌گیرد.
   */
  async sendBackForRevision(
    id: string,
    reason: string,
    user: AuthenticatedUser,
  ): Promise<FinancialDocument> {
    const document = await this.transition(id, 'SEND_BACK_FOR_REVISION', reason, user);

    await this.notifications.notifyUsers(
      [document.createdById],
      {
        kind: 'DOCUMENT_NEEDS_REVISION',
        title: `سند «${document.title}» برای اصلاح برگشت خورد`,
        body: reason,
        documentId: id,
      },
      { exceptUserId: user.id },
    );

    return document;
  }

  /**
   * اجرای یک انتقال وضعیت.
   *
   * قواعد از جدول مشترک `TRANSITIONS` خوانده می‌شوند، پس سرور، UI و تست‌ها هرگز
   * واگرا نمی‌شوند (docs/07-document-workflow.md §۳).
   */
  private async transition(
    id: string,
    action: WorkflowAction,
    reason: string | null,
    user: AuthenticatedUser,
    extra?: (tx: Prisma.TransactionClient, document: FinancialDocument) => Promise<void>,
  ): Promise<FinancialDocument> {
    return this.prisma.$transaction(async (tx) => {
      // قفل ردیف پیش از هر بررسی — ضد شرایط مسابقه‌ای.
      const locked = await tx.$queryRaw<Array<{ id: string; status: DocumentStatus }>>`
        SELECT id, status FROM financial_documents WHERE id = ${id}::uuid FOR UPDATE
      `;
      const current = locked[0];
      if (!current) throw AppError.notFound('سند یافت نشد');

      const rule = findTransition(action, current.status);
      if (!rule) {
        throw AppError.conflict(
          'INVALID_TRANSITION',
          'وضعیت فعلی سند اجازه این عملیات را نمی‌دهد',
        );
      }

      if (!user.permissions.includes(rule.permission)) {
        throw AppError.forbidden();
      }

      if (rule.requiresReason && (reason === null || reason.trim() === '')) {
        throw AppError.validation('ثبت دلیل برای این عملیات الزامی است', [
          { path: 'reason', message: 'دلیل الزامی است' },
        ]);
      }

      const document = await tx.financialDocument.findUniqueOrThrow({ where: { id } });

      if (extra) await extra(tx, document);

      // نسخه کامل **پیش از** تغییر وضعیت ثبت می‌شود، تا وضعیت قبلی همیشه
      // قابل بازیابی باشد (ADR-0009).
      if (rule.createsRevision) {
        await this.createRevision(tx, id, revisionTrigger(action), reason, user.id);
      }

      const updated = await tx.financialDocument.update({
        where: { id },
        data: { status: rule.to },
      });

      await tx.documentStatusTransition.create({
        data: {
          documentId: id,
          fromStatus: current.status,
          toStatus: rule.to,
          action,
          reason,
          actorId: user.id,
        },
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: `DOCUMENT_${action}`,
          entityType: 'financialDocument',
          entityId: id,
          documentId: id,
          before: { status: current.status },
          after: { status: rule.to },
          reason,
        },
        tx,
      );

      return updated;
    });
  }

  /** ثبت نسخه کامل سند برای بازسازی وضعیت. */
  private async createRevision(
    tx: Prisma.TransactionClient,
    documentId: string,
    trigger: 'FINALIZE' | 'REOPEN' | 'ARCHIVE' | 'CORRECTION',
    reason: string | null,
    actorId: string,
  ): Promise<void> {
    const snapshot = await buildDocumentSnapshot(tx, documentId);

    const last = await tx.documentRevision.findFirst({
      where: { documentId },
      orderBy: { revisionNo: 'desc' },
      select: { revisionNo: true },
    });

    await tx.documentRevision.create({
      data: {
        documentId,
        revisionNo: (last?.revisionNo ?? 0) + 1,
        trigger,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        reason,
        createdById: actorId,
      },
    });
  }

  /** تمام شرایط پذیرش ثبت نهایی (docs/07-document-workflow.md §۴). */
  private async validateForFinalize(
    tx: Prisma.TransactionClient,
    documentId: string,
  ): Promise<ErrorDetail[]> {
    const problems: ErrorDetail[] = [];

    const document = await tx.financialDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: {
        stadMetadata: true,
        invoices: { include: { items: true, payment: { include: { paymentMethod: true } } } },
      },
    });

    if (document.invoices.length === 0) {
      problems.push({ path: 'invoices', message: 'سند باید حداقل یک فاکتور داشته باشد' });
    }

    if (document.type === 'STAD') {
      if (!document.stadMetadata) {
        problems.push({ path: 'stad', message: 'اطلاعات سامانه ستاد کامل نیست' });
      }
      if (document.invoices.length > 1) {
        problems.push({
          path: 'invoices',
          message: 'سند سامانه ستاد فقط می‌تواند یک فاکتور داشته باشد',
        });
      }
    }

    for (const invoice of document.invoices) {
      const path = `invoices.${invoice.id}`;

      if (!invoice.payment) {
        problems.push({ path: `${path}.payment`, message: 'روش پرداخت انتخاب نشده است' });
      } else {
        const method = invoice.payment.paymentMethod;
        if (method.requiresPaymentIdentifier && !invoice.payment.paymentIdentifier) {
          problems.push({
            path: `${path}.payment.paymentIdentifier`,
            message: 'شناسه پرداخت برای این روش الزامی است',
          });
        }
        if (method.requiresBillIdentifier && !invoice.payment.billIdentifier) {
          problems.push({
            path: `${path}.payment.billIdentifier`,
            message: 'شناسه قبض برای این روش الزامی است',
          });
        }
        if (invoice.payment.methodKind === 'BENEFICIARY_ACCOUNT' && !invoice.payment.ibanSnapshot) {
          problems.push({
            path: `${path}.payment.iban`,
            message: 'برای حساب ذی‌نفع، انتخاب شبا الزامی است',
          });
        }
      }

      if ((invoice.invoiceKind === 'NORMAL' || invoice.invoiceKind === 'STAD') && invoice.items.length === 0) {
        problems.push({ path: `${path}.items`, message: 'فاکتور باید حداقل یک ردیف داشته باشد' });
      }

      if (!invoice.buyerSnapshotId) {
        problems.push({ path: `${path}.buyer`, message: 'اطلاعات خریدار ثبت نشده است' });
      }
    }

    // بازمحاسبه کامل مالی — مهم‌ترین بررسی.
    const financialProblems = await this.financial.verifyDocumentTotals(documentId);
    problems.push(...financialProblems);

    return problems;
  }

  async revisions(documentId: string) {
    return this.prisma.documentRevision.findMany({
      where: { documentId },
      orderBy: { revisionNo: 'desc' },
      select: {
        id: true,
        revisionNo: true,
        trigger: true,
        reason: true,
        createdAt: true,
        createdById: true,
      },
    });
  }

  async history(documentId: string) {
    return this.prisma.auditLog.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { fullName: true, username: true } } },
    });
  }
}

/**
 * نگاشت اقدام به علت نسخه.
 *
 * پیش از این همه‌چیز جز بازگشایی «ثبت نهایی» ثبت می‌شد؛ با افزوده شدن بایگانی در فاز
 * ۵، نسخه بایگانی هم «ثبت نهایی» برچسب می‌خورد و تاریخچه گمراه‌کننده می‌شد.
 */
function revisionTrigger(action: WorkflowAction): 'FINALIZE' | 'REOPEN' | 'ARCHIVE' {
  if (action === 'REOPEN') return 'REOPEN';
  if (action === 'ARCHIVE') return 'ARCHIVE';
  return 'FINALIZE';
}
