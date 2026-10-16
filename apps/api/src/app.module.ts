import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { validateEnv } from './common/config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { SessionGuard } from './common/auth/session.guard';
import { PermissionGuard } from './common/auth/permission.guard';
import { AuthModule } from './modules/auth/auth.module';
import { BaseDataModule } from './modules/base-data/base-data.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { FilesModule } from './modules/files/files.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { ArchiveModule } from './modules/archive/archive.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
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
    BaseDataModule,
    VendorsModule,
    NotificationsModule,
    DocumentsModule,
    FilesModule,
    FeedbackModule,
    ArchiveModule,
    ReportingModule,
  ],
  controllers: [HealthController],
  providers: [
    // ترتیب مهم است: ابتدا نشست و CSRF، سپس مجوز.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    // ترتیب: ابتدا ضد تکرار (پیش از اجرای handler)، سپس سریالایز مبالغ.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
