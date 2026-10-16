import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentsModule } from '../documents/documents.module';
import { FilesModule } from '../files/files.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { TableExporter } from './table.exporter';
import { ViewsService } from './views.service';

/**
 * ماژول گزارش‌گیری عمومی (فاز ۸).
 *
 * دو وابستگی و هر دو عمدی:
 *  - `DocumentsModule` برای `DocumentAccessService`: دامنه دسترسی سند در گزارش‌ها
 *    باید **همان** قاعده مسیرهای عادی باشد، نه نسخه دومی که روزی عقب می‌ماند.
 *  - `FilesModule` برای `StorageService`: فایل خروجی حجیم در همان object storage
 *    می‌نشیند که پیوست‌ها، با همان قاعده ساخت کلید سروری.
 */
@Module({
  imports: [DocumentsModule, FilesModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    ViewsService,
    ExportService,
    TableExporter,
    DashboardService,
    AuditService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
