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
    AuditService,
  ],
  exports: [DocumentsService, InvoicesService, FinancialService, DocumentAccessService],
})
export class DocumentsModule {}
