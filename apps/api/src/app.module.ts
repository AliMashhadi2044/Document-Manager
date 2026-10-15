import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { validateEnv } from './common/config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';
import { SessionGuard } from './common/auth/session.guard';
import { PermissionGuard } from './common/auth/permission.guard';
import { AuthModule } from './modules/auth/auth.module';
import { BaseDataModule } from './modules/base-data/base-data.module';
import { VendorsModule } from './modules/vendors/vendors.module';
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
  ],
  controllers: [HealthController],
  providers: [
    // ترتیب مهم است: ابتدا نشست و CSRF، سپس مجوز.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
