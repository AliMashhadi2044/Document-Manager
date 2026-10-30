import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { validateEnv } from './common/config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { RateLimitGuard } from './common/throttle/rate-limit.guard';
import { RetentionModule } from './common/retention/retention.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { SessionGuard } from './common/auth/session.guard';
import { PermissionGuard } from './common/auth/permission.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BaseDataModule } from './modules/base-data/base-data.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { FilesModule } from './modules/files/files.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { ArchiveModule } from './modules/archive/archive.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    BaseDataModule,
    VendorsModule,
    NotificationsModule,
    PreferencesModule,
    RetentionModule,
    DocumentsModule,
    FilesModule,
    FeedbackModule,
    ArchiveModule,
    ReportingModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    // ترتیب مهم است: ابتدا نشست و CSRF، سپس مجوز.
    // ترتیب مهم است: سقف نرخ پیش از هر کار دیگری، تا تلاش‌های پیاپی حتی به
    // خواندن نشست از دیتابیس هم نرسند.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    // ترتیب: ابتدا ضد تکرار (پیش از اجرای handler)، سپس سریالایز مبالغ.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
