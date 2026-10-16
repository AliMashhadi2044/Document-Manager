import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentsModule } from '../documents/documents.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { DatasetService } from './dataset.service';
import { ProductTypesService } from './product-types.service';
import { ExcelExporter } from './excel.exporter';
import { PdfRenderer } from './pdf.renderer';
import { TemplatesService } from './templates.service';

/**
 * ماژول گزارش‌گیری.
 *
 * `DocumentsModule` فقط برای `DocumentAccessService` وارد می‌شود: دامنه دسترسی سند
 * باید **همان** قاعده‌ای باشد که مسیرهای عادی سند دارند، نه یک نسخه دوم.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    DatasetService,
    ProductTypesService,
    ExcelExporter,
    PdfRenderer,
    TemplatesService,
    AuditService,
  ],
  exports: [ReportsService, DatasetService],
})
export class ReportingModule {}
