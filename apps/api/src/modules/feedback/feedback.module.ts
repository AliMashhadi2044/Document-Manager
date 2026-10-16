import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentAccessService } from '../documents/document-access.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, AuditService, DocumentAccessService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
