import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentsModule } from '../documents/documents.module';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';

@Module({
  // سرویس سند از همان ماژول می‌آید تا انتقال وضعیت یک مسیر داشته باشد، نه دو تا.
  imports: [DocumentsModule],
  controllers: [ArchiveController],
  providers: [ArchiveService, AuditService],
})
export class ArchiveModule {}
