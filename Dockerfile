# syntax=docker/dockerfile:1

# ============================================================================
# تصویر production — یک سرویس، شامل API و رابط وب.
#
# رابط وب از همان origin سرو می‌شود؛ بنابراین نه CORS لازم است و نه کوکی cross-site.
# همین هم باعث می‌شود reverse proxy جداگانه برای کارکرد سامانه **لازم** نباشد
# (برای TLS همچنان توصیه می‌شود).
#
# قلم فارسی داخل خروجی گزارش جاسازی شده است (`report-font.ts`)، پس این تصویر به
# نصب قلم روی سیستم وابسته نیست و خروجی PDF روی هر ماشینی یکسان است.
# ============================================================================

# ─────────────────────── ۰. پایه مشترک ───────────────────────
#
# نصب openssl عمدی است و فقط «یک بسته اضافه» نیست: تصویرهای slim این باینری را
# ندارند و Prisma نسخه OpenSSL را از روی آن تشخیص می‌دهد. بدون آن، موتور کوئری برای
# openssl 1.1.x تولید می‌شود در حالی که Debian 12 نسخه 3.x دارد — و کلاینت در زمان
# اجرا موتورش را پیدا نمی‌کند.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ─────────────────────────── ۱. وابستگی‌ها ───────────────────────────
FROM base AS deps
WORKDIR /app

# فقط مانیفست‌ها کپی می‌شوند تا لایه نصب با هر تغییر کد باطل نشود.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/report-engine/package.json packages/report-engine/

# مرورگر در این مرحله دانلود نمی‌شود؛ مرحله اجرا خودش نصبش می‌کند.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# ─────────────────────────── ۲. ساخت ───────────────────────────
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build -w @dm/api \
 && npm run build -w @dm/web

# ───────────────────── ۳. وابستگی‌های اجرا ─────────────────────
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/report-engine/package.json packages/report-engine/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

# بسته‌های داخلی به‌صورت symlink نصب می‌شوند؛ خروجی ساخته‌شده‌شان باید واقعی باشد.
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/report-engine/dist packages/report-engine/dist
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client node_modules/@prisma/client

# ─────────────────────────── ۴. اجرا ───────────────────────────
FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    API_PORT=3100 \
    WEB_DIST=/app/public \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Chromium و کتابخانه‌های سیستمی‌اش برای تولید PDF.
# نسخه مرورگر صریح و برابر با نسخه playwright-core مخزن است؛ نسخه ناهمخوان یعنی
# مرورگری که سرویس در زمان اجرا پیدا نمی‌کند.
RUN npx --yes playwright@1.64.1 install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm

COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages packages
COPY --from=build /app/apps/api/dist apps/api/dist
# نسخه کامپایل‌شده اسکریپت‌های seed؛ بدون داده مرجع سامانه قابل استفاده نیست.
COPY --from=build /app/apps/api/dist-seed apps/api/dist-seed
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/web/dist public
COPY package.json ./
COPY apps/api/package.json apps/api/
COPY infrastructure/docker-entrypoint.mjs ./

# کاربر غیر root — تصویر node این کاربر را از پیش دارد.
#
# پوشه موتورهای Prisma هم باید نوشتنی باشد: CLI هنگام `migrate deploy` قابل نوشتن
# بودن آن را بررسی می‌کند و در غیر این صورت با خطای مجوز متوقف می‌شود.
RUN mkdir -p /app/storage  && chown -R node:node /app/storage /app/node_modules/@prisma /app/node_modules/.prisma
USER node

EXPOSE 3100

# سلامت سرویس از همان مسیری خوانده می‌شود که متعادل‌کننده بار استفاده می‌کند.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3100)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "docker-entrypoint.mjs"]
CMD ["node", "apps/api/dist/main.js"]
