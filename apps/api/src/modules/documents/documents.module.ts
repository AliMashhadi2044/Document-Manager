import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { InvoicesService } from '../invoices/invoices.service';
import { InvoiceKindService } from '../invoices/invoice-kind.service';
import { UtilityDuplicateService } from '../invoices/utility-duplicate.service';
import { FinancialService } from '../financial/financial.service';
import { DocumentAccessService } from './document-access.service';
import { DocumentTrashController } from './document-trash.controller';
import { DocumentTrashService } from './document-trash.service';
/*
  سرویس ردیف‌های گزارش ستاد اینجا تأمین می‌شود و نه در ماژول گزارش‌گیری.

  ساخت فاکتور باید ردیف را در همان تراکنش بنویسد، و ماژول گزارش‌گیری خودش همین
  ماژول را import می‌کند؛ تأمین کردنش آن‌طرف، یک حلقهٔ وابستگی می‌ساخت.
*/
import { StadReportLinesService } from '../reporting/stad-report-lines.service';

@Module({
  controllers: [DocumentsController, DocumentTrashController],
  providers: [
    DocumentsService,
    InvoicesService,
    InvoiceKindService,
    UtilityDuplicateService,
    FinancialService,
    DocumentAccessService,
    DocumentTrashService,
    StadReportLinesService,
    AuditService,
  ],
  exports: [
    DocumentsService,
    InvoicesService,
    FinancialService,
    DocumentAccessService,
    StadReportLinesService,
  ],
})
export class DocumentsModule {}
