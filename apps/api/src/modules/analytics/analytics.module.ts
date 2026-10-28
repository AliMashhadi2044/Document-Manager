import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { DocumentsModule } from '../documents/documents.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { TableExporter } from './table.exporter';
import { SharedReportsService } from './shared-reports.service';
import { ViewsService } from './views.service';

/**
 * ماژول گزارش‌گیری عمومی (فاز ۸).
 *
 * دو وابستگی و هر دو عمدی:
 *  - `DocumentsModule` برای `DocumentAccessService`: دامنه دسترسی سند در گزارش‌ها
 *    باید **همان** قاعده مسیرهای عادی باشد، نه نسخه دومی که روزی عقب می‌ماند.
 *  - `NotificationsModule` برای اعلانِ «گزارش تازه»: گیرنده با **مجوز** انتخاب
 *    می‌شود و نه با نقش، پس همان سرویسی که بقیهٔ اعلان‌ها را می‌فرستد.
 *  - `FilesModule` برای `StorageService`: فایل خروجی حجیم در همان object storage
 *    می‌نشیند که پیوست‌ها، با همان قاعده ساخت کلید سروری.
 */
@Module({
  imports: [DocumentsModule, FilesModule, NotificationsModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    ViewsService,
    SharedReportsService,
    ExportService,
    TableExporter,
    DashboardService,
    AuditService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
