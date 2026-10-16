import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import type { Env } from './common/config/env';
import { isQueryCountEnabled, queryCountMiddleware } from './common/prisma/query-counter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Env, true>);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(cookieParser());

  // شمارنده کوئری: ابزار تشخیصی، فقط در محیط توسعه و فقط با متغیر محیطی صریح.
  if (isQueryCountEnabled()) {
    app.use(queryCountMiddleware);
  }

  // هدرهای امنیتی (docs/10-security-plan.md §۴)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'blob:', 'data:'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'same-origin' },
    }),
  );

  // سقف اندازه بدنه درخواست؛ آپلود فایل مسیر جداگانه خود را دارد.
  app.useBodyParser('json', { limit: '1mb' });

  // در production رابط وب از همان origin سرو می‌شود و CORS لازم نیست.
  if (!isProduction) {
    app.enableCors({
      origin: config.get('WEB_ORIGIN', { infer: true }),
      credentials: true,
    });
  }

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('سامانه مدیریت اسناد کارپردازی')
      .setDescription(
        'توجه: تمام مبالغ بر حسب **ریال صحیح** و به‌صورت **رشته عددی** منتقل می‌شوند، نه number.',
      )
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);

  new Logger('Bootstrap').log(`سرویس روی پورت ${port} بالا آمد`);
}

void bootstrap();
