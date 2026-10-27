import { Injectable } from '@nestjs/common';
import { groupBeneficiaries, type BeneficiaryInvoiceInput, type Money } from '@dm/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/auth/auth.decorators';
import { DocumentAccessService } from '../documents/document-access.service';

/**
 * جزئیات یک ردیف گزارش «شماره شبا ذینفعان سند».
 *
 * فرم چاپی عمداً ستون «فاکتور ۱ تا ۵» ندارد: پنج ستون ثابت برای سندی که شش فاکتور
 * دارد کم می‌آورد و برای سندی که یکی دارد، چهار ستون خالی چاپ می‌کند. به‌جایش
 * جمعِ هر مقصد روی کاغذ می‌آید و ریزش — اینکه از هر فاکتور چقدر به این حساب رفته —
 * اینجا، روی صفحه.
 *
 * گروه‌بندی از **همان تابع مشترک** می‌آید که گزارش را می‌سازد (`groupBeneficiaries`)،
 * نه یک کوئری جداگانه: اگر این دو از هم جدا می‌شدند، جزئیات می‌توانست عددی بدهد که
 * با ردیف بالای فرم نمی‌خواند.
 */
@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DocumentAccessService,
  ) {}

  async details(documentId: string, key: string, user: AuthenticatedUser) {
    await this.access.assertDocumentVisible(documentId, user);

    const invoices = await this.prisma.invoice.findMany({
      where: { documentId },
      // همان ترتیب قطعی گزارش: تاریخ صورتحساب، سپس ترتیب ثبت.
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: {
        vendorSnapshot: { select: { name: true } },
        invoiceType: { select: { titleFa: true } },
        payment: true,
      },
    });

    const input: BeneficiaryInvoiceInput[] = invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      totalAmount: invoice.totalAmount as Money,
      vendorName: invoice.vendorSnapshot?.name ?? '',
      methodKind: invoice.payment?.methodKind ?? null,
      ibanSnapshot: invoice.payment?.ibanSnapshot ?? null,
      bankTitleSnapshot: invoice.payment?.bankTitleSnapshot ?? null,
      accountTitleSnapshot: invoice.payment?.accountTitleSnapshot ?? null,
      paymentIdentifier: invoice.payment?.paymentIdentifier ?? null,
      billIdentifier: invoice.payment?.billIdentifier ?? null,
      payeeName: invoice.payment?.payeeName ?? null,
      pettyCashHolderNameSnapshot: invoice.payment?.pettyCashHolderNameSnapshot ?? null,
      pettyCashAccountHolderSnapshot: invoice.payment?.pettyCashAccountHolderSnapshot ?? null,
      pettyCashBankTitleSnapshot: invoice.payment?.pettyCashBankTitleSnapshot ?? null,
      pettyCashIbanSnapshot: invoice.payment?.pettyCashIbanSnapshot ?? null,
      beneficiaryAmount: (invoice.payment?.beneficiaryAmount ?? null) as Money | null,
      pettyCashAmount: (invoice.payment?.pettyCashAmount ?? null) as Money | null,
    }));

    const row = groupBeneficiaries(input).rows.find((item) => item.key === key);
    if (!row) throw AppError.notFound('این مقصد پرداخت در سند یافت نشد');

    // نوع و فصل فاکتور فقط برای نمایش‌اند و از همان ردیف‌های خوانده‌شده می‌آیند.
    const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));

    return {
      identifier: row.identifier,
      secondaryIdentifier: row.secondaryIdentifier,
      accountHolder: row.accountHolder,
      bankTitle: row.bankTitle,
      kind: row.kind,
      total: row.total.toString(),
      invoices: row.shares.map((share) => {
        const invoice = byId.get(share.invoiceId);
        return {
          id: share.invoiceId,
          invoiceNumber: share.invoiceNumber,
          invoiceDate: share.invoiceDate,
          vendorName: share.vendorName,
          invoiceTypeTitle: invoice?.invoiceType.titleFa ?? '',
          chapterTitle: invoice?.chapterTitleSnapshot ?? '',
          /** مبلغ کل فاکتور — تا دیده شود سهم این مقصد چه نسبتی از آن است. */
          invoiceTotal: (invoice?.totalAmount ?? 0n).toString(),
          amount: share.amount.toString(),
          isPartial: share.isPartial,
        };
      }),
    };
  }
}
