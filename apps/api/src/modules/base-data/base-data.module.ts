import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { ChaptersController } from './chapters.controller';
import { ReferenceController } from './reference.controller';

@Module({
  controllers: [LookupController, ChaptersController, ReferenceController],
  providers: [LookupService, AuditService],
  exports: [LookupService],
})
export class BaseDataModule {}
