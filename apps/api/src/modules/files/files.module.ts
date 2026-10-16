import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentAccessService } from '../documents/document-access.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, StorageService, AuditService, DocumentAccessService],
  exports: [StorageService, AttachmentsService],
})
export class FilesModule {}
