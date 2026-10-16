import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { InvoicesService } from '../invoices/invoices.service';
import { InvoiceKindService } from '../invoices/invoice-kind.service';
import { FinancialService } from '../financial/financial.service';
import { DocumentAccessService } from './document-access.service';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    InvoicesService,
    InvoiceKindService,
    FinancialService,
    DocumentAccessService,
    AuditService,
  ],
  exports: [DocumentsService, InvoicesService, FinancialService, DocumentAccessService],
})
export class DocumentsModule {}
