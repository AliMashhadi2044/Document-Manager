import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

  /*
    پشت proxy، نشانی واقعی کاربر از `X-Forwarded-For` می‌آید.

    عمداً پیش‌فرضش خاموش است: با روشن بودنِ بی‌مورد، هر کسی می‌تواند نشانی‌اش را
    جعل کند و سقف نرخ را دور بزند.
  */
  if (config.get('TRUST_PROXY', { infer: true })) {
    app.set('trust proxy', 1);
  }

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
          // data: برای قلم جاسازی‌شده در خروجی HTML گزارش لازم است؛ آن سند باید
          // خودبسنده باشد چون همان HTML برای تولید PDF با شبکه قطع هم استفاده می‌شود.
          fontSrc: ["'self'", 'data:'],
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

  // رابط وب از همان origin سرو می‌شود (بدون CORS و بدون کوکی cross-site).
  //
  // مسیر پیش‌فرض، خروجی build در کنار همین سرویس است؛ در تصویر Docker فایل‌ها آنجا
  // کپی می‌شوند. اگر پوشه نباشد، سرویس بدون رابط بالا می‌آید و صریحاً هشدار می‌دهد —
  // نه اینکه با ۴۰۴ های گنگ کار کند.
  const webRoot = resolve(process.env.WEB_DIST ?? join(__dirname, '..', 'public'));
  const logger = new Logger('Bootstrap');

  if (existsSync(join(webRoot, 'index.html'))) {
    // دارایی‌های با نام هش‌دار برای همیشه کش می‌شوند؛ index.html هرگز.
    app.useStaticAssets(webRoot, { index: false, maxAge: '1y', immutable: true });

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get(/^(?!\/api\/).*/, (_request: unknown, response: { sendFile: (path: string, options: object) => void }) => {
      response.sendFile(join(webRoot, 'index.html'), { maxAge: 0 });
    });

    logger.log(`رابط وب از ${webRoot} سرو می‌شود`);
  } else if (isProduction) {
    logger.warn(`رابط وب پیدا نشد (${webRoot}); فقط API سرو می‌شود`);
  }

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);

  logger.log(`سرویس روی پورت ${port} بالا آمد`);
}

void bootstrap();
